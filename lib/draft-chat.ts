/**
 * Deferred-create handoff: /chat mints NO Convex row until the first message
 * actually sends. The draft composer's send stashes the outgoing parts here,
 * routes to /chat/<realId>, and the mounted provider picks them up and sends.
 * sessionStorage (not localStorage) — a pending send must not survive a tab
 * close and fire in a later session.
 */

const key = (chatId: string) => `leopard:pending-message:${chatId}`;

export interface PendingPart {
  type: string;
  text?: string;
  url?: string;
  filename?: string;
  mediaType?: string;
}

export interface PendingMessage {
  parts: PendingPart[];
  /** Model picked on the draft screen — the remounted provider must send with
   *  THIS, not its default (the Convex chatMeta sync lands after the pending
   *  send fires; without the stash the first turn silently ran on the server
   *  default — observed 2026-09-02: picked Flash, nemotron served). */
  model?: string;
}

export function stashPendingMessage(chatId: string, parts: PendingPart[], model?: string) {
  try {
    const stash: PendingMessage = { parts, ...(model ? { model } : {}) };
    window.sessionStorage.setItem(key(chatId), JSON.stringify(stash));
  } catch {
    /* quota/private mode — the draft send is lost; user retypes */
  }
}

export function takePendingMessage(chatId: string): PendingMessage | null {
  try {
    const raw = window.sessionStorage.getItem(key(chatId));
    if (!raw) return null;
    window.sessionStorage.removeItem(key(chatId));
    const parsed = JSON.parse(raw) as PendingMessage | PendingPart[];
    // Legacy shape (bare parts array) from a pre-model stash.
    return Array.isArray(parsed) ? { parts: parsed } : parsed;
  } catch {
    return null;
  }
}
