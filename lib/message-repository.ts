// Ported from assistant-ui message-repository.ts — self-contained, no leopard imports.
// Parent-pointer message tree with head/branch switching, optimistic-message
// eviction, and an export shape that only contains persisted messages.

export type ExportedMessageRepositoryItem<TMessage> = {
  message: TMessage;
  parentId: string | null;
};

export type ExportedMessageRepository<TMessage> = {
  headId?: string | null;
  messages: Array<ExportedMessageRepositoryItem<TMessage>>;
};

// Hosts keep their own metadata shape (Leopard's UIMessage metadata is
// untyped), so the optimistic flag is read defensively instead of being
// required by the TMessage constraint. A message without the flag counts as
// persisted.
const isOptimisticMessage = (message: unknown): boolean => {
  const metadata = (message as { metadata?: { isOptimistic?: unknown } })
    .metadata;
  return metadata?.isOptimistic === true;
};

type RepositoryParent<TMessage> = {
  children: string[];
  next: RepositoryMessage<TMessage> | null;
};

type RepositoryMessage<TMessage> = RepositoryParent<TMessage> & {
  prev: RepositoryMessage<TMessage> | null;
  current: TMessage;
  level: number;
};

const findHead = <TMessage>(
  message: RepositoryMessage<TMessage> | RepositoryParent<TMessage>,
): RepositoryMessage<TMessage> | null => {
  let current = message;
  while (current.next) current = current.next;
  return "current" in current ? current : null;
};

// A history may store a message before its parent, for example one that
// commits appends concurrently, so such a message is added after its parent.
export const withParentsFirst = <TMessage extends { id: string }>(
  messages: ReadonlyArray<ExportedMessageRepositoryItem<TMessage>>,
  isStored: (id: string) => boolean,
): Array<ExportedMessageRepositoryItem<TMessage>> => {
  const listed = new Set(messages.map((item) => item.message.id));
  const added = new Set<string>();
  const waiting = new Map<string, ExportedMessageRepositoryItem<TMessage>[]>();
  const ordered: ExportedMessageRepositoryItem<TMessage>[] = [];
  for (const item of messages) {
    const { parentId } = item;
    if (
      parentId !== null &&
      listed.has(parentId) &&
      !added.has(parentId) &&
      !isStored(parentId)
    ) {
      const children = waiting.get(parentId);
      if (children) children.push(item);
      else waiting.set(parentId, [item]);
      continue;
    }
    for (let i = ordered.push(item) - 1; i < ordered.length; i++) {
      const { id } = ordered[i]!.message;
      if (added.has(id)) continue;
      added.add(id);
      const children = waiting.get(id);
      if (!children) continue;
      waiting.delete(id);
      ordered.push(...children);
    }
  }
  for (const children of waiting.values()) ordered.push(...children);
  return ordered;
};

export const withoutOrphanedMessages = <TMessage extends { id: string }>(
  repository: ExportedMessageRepository<TMessage>,
): { repository: ExportedMessageRepository<TMessage>; droppedIds: string[] } => {
  const listed = new Set(repository.messages.map((item) => item.message.id));
  const children = new Map<string, string[]>();
  const pending: string[] = [];
  for (const { message, parentId } of repository.messages) {
    if (parentId === null) continue;
    const siblings = children.get(parentId);
    if (siblings) siblings.push(message.id);
    else children.set(parentId, [message.id]);
    if (!listed.has(parentId)) pending.push(message.id);
  }

  const dropped = new Set<string>();
  for (let i = 0; i < pending.length; i++) {
    const id = pending[i]!;
    if (dropped.has(id)) continue;
    dropped.add(id);
    for (const child of children.get(id) ?? []) pending.push(child);
  }
  const headMissing =
    repository.headId != null && !listed.has(repository.headId);
  if (dropped.size === 0 && !headMissing) return { repository, droppedIds: [] };

  const droppedIds: string[] = [];
  const keptParents = new Set<string>();
  const messages = repository.messages.filter(({ message, parentId }) => {
    if (dropped.has(message.id)) {
      droppedIds.push(message.id);
      return false;
    }
    if (parentId !== null) keptParents.add(parentId);
    return true;
  });
  let { headId } = repository;
  if (headId != null && (headMissing || dropped.has(headId))) {
    headId = null;
    for (const { message } of messages) {
      if (!keptParents.has(message.id)) headId = message.id;
    }
  }

  return {
    repository: {
      ...repository,
      messages,
      ...(headId !== undefined && { headId }),
    },
    droppedIds,
  };
};

class CachedValue<T> {
  private _value: T | null = null;

  private func: () => T;

  constructor(func: () => T) {
    this.func = func;
  }

  get value() {
    if (this._value === null) {
      this._value = this.func();
    }
    return this._value;
  }

  dirty() {
    this._value = null;
  }
}

export class MessageRepository<
  TMessage extends { id: string; role: string },
> {
  private messages = new Map<string, RepositoryMessage<TMessage>>();
  private head: RepositoryMessage<TMessage> | null = null;
  private root: RepositoryParent<TMessage> = {
    children: [],
    next: null,
  };

  private updateLevels(message: RepositoryMessage<TMessage>, newLevel: number) {
    const pending = [{ message, level: newLevel }];

    while (pending.length > 0) {
      const current = pending.pop()!;
      current.message.level = current.level;

      for (const childId of current.message.children) {
        const childMessage = this.messages.get(childId);
        if (childMessage) {
          pending.push({ message: childMessage, level: current.level + 1 });
        }
      }
    }
  }

  private selectPathTo(message: RepositoryMessage<TMessage>) {
    for (
      let current: RepositoryMessage<TMessage> | null = message;
      current;
      current = current.prev
    ) {
      (current.prev ?? this.root).next = current;
    }
  }

  private performOp(
    newParent: RepositoryMessage<TMessage> | null,
    child: RepositoryMessage<TMessage>,
    operation: "cut" | "link" | "relink",
  ) {
    const parentOrRoot = child.prev ?? this.root;
    const newParentOrRoot = newParent ?? this.root;

    if (operation === "relink" && parentOrRoot === newParentOrRoot) return;

    // `link` receives a fresh ID from `addOrUpdateMessage`; only `relink` can
    // introduce a cycle.
    if (operation === "relink") {
      for (
        let current: RepositoryMessage<TMessage> | null = newParent;
        current;
        current = current.prev
      ) {
        if (current.current.id === child.current.id) {
          throw new Error(
            "MessageRepository(performOp/relink): A message with the same id already exists in the parent tree. This error occurs if the same message id is found multiple times. This is likely an internal bug in the calling code.",
          );
        }
      }
    }

    if (operation !== "link") {
      parentOrRoot.children = parentOrRoot.children.filter(
        (m) => m !== child.current.id,
      );

      if (parentOrRoot.next === child) {
        const fallbackId = parentOrRoot.children.at(-1);
        const fallback = fallbackId ? this.messages.get(fallbackId) : null;
        if (fallback === undefined) {
          throw new Error(
            "MessageRepository(performOp/cut): Fallback sibling message not found. This is likely an internal bug in the calling code.",
          );
        }
        parentOrRoot.next = fallback;
      }
    }

    if (operation !== "cut") {
      newParentOrRoot.children = [
        ...newParentOrRoot.children,
        child.current.id,
      ];

      child.prev = newParent;

      if (findHead(child) === this.head) {
        this.selectPathTo(child);
      } else if (newParentOrRoot.next === null) {
        newParentOrRoot.next = child;
        if (this.head === newParentOrRoot) {
          this.head = findHead(child);
        }
      }

      const newLevel = newParent ? newParent.level + 1 : 0;
      this.updateLevels(child, newLevel);
    }
  }

  private _messages = new CachedValue<readonly TMessage[]>(() => {
    const messages = new Array<TMessage>((this.head?.level ?? -1) + 1);
    for (let current = this.head; current; current = current.prev) {
      messages[current.level] = current.current;
    }
    return messages;
  });

  get headId(): string | null {
    return this.head?.current.id ?? null;
  }

  get canonicalHeadId(): string | null {
    // Optimistic messages are ephemeral, so persisted callers need the nearest
    // non-optimistic ancestor rather than the raw head.
    let head = this.head;
    while (head && isOptimisticMessage(head.current)) {
      head = head.prev;
    }
    return head?.current.id ?? null;
  }

  getMessages(headId?: string): readonly TMessage[] {
    if (headId === undefined || headId === this.head?.current.id) {
      return this._messages.value;
    }

    const headMessage = this.messages.get(headId);
    if (!headMessage) {
      throw new Error(
        "MessageRepository(getMessages): Head message not found. This is likely an internal bug in the calling code.",
      );
    }

    const messages = new Array<TMessage>(headMessage.level + 1);
    for (
      let current: RepositoryMessage<TMessage> | null = headMessage;
      current;
      current = current.prev
    ) {
      messages[current.level] = current.current;
    }
    return messages;
  }

  addOrUpdateMessage(parentId: string | null, message: TMessage): void {
    const existingItem = this.messages.get(message.id);
    const prev = parentId ? this.messages.get(parentId) : null;
    if (prev === undefined)
      throw new Error(
        "MessageRepository(addOrUpdateMessage): Parent message not found. This is likely an internal bug in the calling code.",
      );

    if (existingItem) {
      this.performOp(prev, existingItem, "relink");
      existingItem.current = message;
      this._messages.dirty();
      return;
    }

    const newItem: RepositoryMessage<TMessage> = {
      prev,
      current: message,
      next: null,
      children: [],
      level: prev ? prev.level + 1 : 0,
    };

    this.messages.set(message.id, newItem);
    this.performOp(prev, newItem, "link");

    if (this.head === prev) {
      this.head = newItem;
      this.selectPathTo(newItem);
    }

    this._messages.dirty();
  }

  getMessage(messageId: string): {
    parentId: string | null;
    message: TMessage;
    index: number;
  } {
    const message = this.messages.get(messageId);
    if (!message)
      throw new Error(
        "MessageRepository(getMessage): Message not found. This is likely an internal bug in the calling code.",
      );

    return {
      parentId: message.prev?.current.id ?? null,
      message: message.current,
      index: message.level,
    };
  }

  deleteMessage(
    messageId: string,
    replacementId?: string | null | undefined,
  ): void {
    const message = this.messages.get(messageId);

    if (!message)
      throw new Error(
        "MessageRepository(deleteMessage): Message not found. This is likely an internal bug in the calling code.",
      );

    const replacement =
      replacementId === undefined
        ? message.prev
        : replacementId === null
          ? null
          : this.messages.get(replacementId);
    if (replacement === undefined)
      throw new Error(
        "MessageRepository(deleteMessage): Replacement not found. This is likely an internal bug in the calling code.",
      );

    for (let current = replacement; current; current = current.prev) {
      if (current === message)
        throw new Error(
          "MessageRepository(deleteMessage): Replacement is the deleted message or one of its descendants. This is likely an internal bug in the calling code.",
        );
    }

    for (const child of message.children) {
      const childMessage = this.messages.get(child);
      if (!childMessage)
        throw new Error(
          "MessageRepository(deleteMessage): Child message not found. This is likely an internal bug in the calling code.",
        );
      this.performOp(replacement, childMessage, "relink");
    }

    this.performOp(null, message, "cut");
    this.messages.delete(messageId);

    if (this.head === message) {
      this.head = findHead(replacement ?? this.root);
    }

    this._messages.dirty();
  }

  hasChildren(messageId: string): boolean {
    return (this.messages.get(messageId)?.children.length ?? 0) > 0;
  }

  getBranches(messageId: string): string[] {
    const message = this.messages.get(messageId);
    if (!message)
      throw new Error(
        "MessageRepository(getBranches): Message not found. This is likely an internal bug in the calling code.",
      );

    const { children } = message.prev ?? this.root;
    return children;
  }

  /**
   * Evicts optimistic messages (`metadata.isOptimistic`) on the branch the head
   * just moved away from. Only that branch is walked, so an optimistic message
   * added off the head branch (such as the server-id copy that replaces a
   * client-id placeholder before the head moves to it) is kept until a
   * `switchToBranch` or `resetHead` moves the head off the branch it is on.
   * Keeps a client→server id swap from leaving a phantom sibling.
   */
  private evictOffBranchOptimisticMessages(
    previousHead: RepositoryMessage<TMessage> | null,
    currentHead: RepositoryMessage<TMessage> | null,
  ) {
    if (!previousHead) return;

    const onHeadBranch = new Set<string>();
    for (let current = currentHead; current; current = current.prev) {
      onHeadBranch.add(current.current.id);
    }

    const stale: string[] = [];
    for (
      let current: RepositoryMessage<TMessage> | null = previousHead;
      current;
      current = current.prev
    ) {
      // Stop at the first node shared with the current head branch: every
      // ancestor above it is shared too, so nothing further can be off-branch.
      if (onHeadBranch.has(current.current.id)) break;
      if (isOptimisticMessage(current.current)) {
        stale.push(current.current.id);
      }
    }

    for (const id of stale) {
      // A prior deletion may have already removed this node.
      if (this.messages.has(id)) this.deleteMessage(id);
    }
  }

  switchToBranch(messageId: string): void {
    const message = this.messages.get(messageId);
    if (!message)
      throw new Error(
        "MessageRepository(switchToBranch): Branch not found. This is likely an internal bug in the calling code.",
      );

    const previousHead = this.head;
    this.selectPathTo(message);

    this.head = findHead(message);

    this.evictOffBranchOptimisticMessages(previousHead, this.head);

    this._messages.dirty();
  }

  private setHead(messageId: string | null, pruneChildren: boolean) {
    if (messageId === null) {
      this.clear();
      return;
    }

    const message = this.messages.get(messageId);
    if (!message)
      throw new Error(
        `MessageRepository(${pruneChildren ? "resetHead" : "import"}): Branch not found. This is likely an internal bug in the calling code.`,
      );

    const previousHead = this.head;

    if (pruneChildren && message.children.length > 0) {
      const pending = [...message.children];
      while (pending.length > 0) {
        const childId = pending.pop()!;
        const childMessage = this.messages.get(childId);
        if (childMessage) {
          for (const descendantId of childMessage.children) {
            pending.push(descendantId);
          }
          this.messages.delete(childId);
        }
      }

      message.children = [];
      message.next = null;
    }

    this.head = message;
    this.selectPathTo(message);

    this.evictOffBranchOptimisticMessages(previousHead, this.head);

    this._messages.dirty();
  }

  resetHead(messageId: string | null): void {
    this.setHead(messageId, true);
  }

  clear(): void {
    this.messages.clear();
    this.head = null;
    this.root = {
      children: [],
      next: null,
    };
    this._messages.dirty();
  }

  export(): ExportedMessageRepository<TMessage> {
    const exportItems: ExportedMessageRepositoryItem<TMessage>[] = [];

    // Optimistic messages are ephemeral and never persisted. A persisted child
    // of an optimistic node is re-parented onto its nearest persisted ancestor
    // so the exported tree never references a skipped id.
    // External-state conversion requires parents before children, so the tree
    // is walked in pre-order rather than iterated in insertion order.
    const pending = [...this.root.children].reverse();
    while (pending.length > 0) {
      const message = this.messages.get(pending.pop()!);
      if (!message) continue;
      for (let i = message.children.length - 1; i >= 0; i--) {
        pending.push(message.children[i]!);
      }
      if (isOptimisticMessage(message.current)) continue;
      let prev = message.prev;
      while (prev && isOptimisticMessage(prev.current)) {
        prev = prev.prev;
      }
      exportItems.push({
        message: message.current,
        parentId: prev?.current.id ?? null,
      });
    }

    return {
      headId: this.exportedHeadId(),
      messages: exportItems,
    };
  }

  /**
   * The head as it would be if the optimistic messages were deleted. An
   * optimistic head resolves to a leaf of the exported tree, so an import
   * returns to the branch that was visible instead of the one its persisted
   * ancestor selects.
   */
  private exportedHeadId(): string | null {
    let head = this.head;
    while (head && isOptimisticMessage(head.current)) head = head.prev;
    if (head === this.head) return head?.current.id ?? null;

    for (;;) {
      const next = this.exportedChild(head ?? this.root);
      if (!next) return head?.current.id ?? null;
      head = next;
    }
  }

  private exportedChild(
    parent: RepositoryParent<TMessage>,
  ): RepositoryMessage<TMessage> | null {
    const selected = parent.next;
    if (selected) {
      if (!isOptimisticMessage(selected.current)) return selected;
      const descendant = this.exportedChild(selected);
      if (descendant) return descendant;
    }
    const selectedIndex = selected
      ? parent.children.indexOf(selected.current.id)
      : parent.children.length;
    const siblings = [
      ...parent.children.slice(0, selectedIndex).reverse(),
      ...parent.children.slice(selectedIndex + 1).reverse(),
    ];
    for (const id of siblings) {
      const child = this.messages.get(id);
      if (!child) continue;
      if (!isOptimisticMessage(child.current)) return child;
      const descendant = this.exportedChild(child);
      if (descendant) return descendant;
    }
    return null;
  }

  import({ headId, messages }: ExportedMessageRepository<TMessage>): void {
    const ordered = withParentsFirst(messages, (id) => this.messages.has(id));
    for (const { message, parentId } of ordered) {
      this.addOrUpdateMessage(parentId, message);
    }

    const importedHeadId = headId ?? ordered.at(-1)?.message.id ?? null;
    this.setHead(importedHeadId, false);
  }
}
