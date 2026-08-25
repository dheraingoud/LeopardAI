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

export function stashPendingMessage(chatId: string, parts: PendingPart[]) {
  try {
    window.sessionStorage.setItem(key(chatId), JSON.stringify(parts));
  } catch {
    /* quota/private mode — the draft send is lost; user retypes */
  }
}

export function takePendingMessage(chatId: string): PendingPart[] | null {
  try {
    const raw = window.sessionStorage.getItem(key(chatId));
    if (!raw) return null;
    window.sessionStorage.removeItem(key(chatId));
    return JSON.parse(raw) as PendingPart[];
  } catch {
    return null;
  }
}
