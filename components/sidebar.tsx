"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Plus,
  Search,
  Settings,
  PanelLeftClose,
  PanelLeft,
  Sun,
  Moon,
  LogOut,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThreadList } from "./chat/leopard/thread-list";
import { ThreadSearch } from "./chat/leopard/thread-search";
import { useLeopardTheme } from "@/components/theme-provider";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BYPASS_CLERK, DEV_USER_ID } from "@/lib/dev-user";

/** Group chats by relative date buckets */
function groupChats<T extends { _id: string; title: string; updatedAt: number; pinned?: boolean }>(
  chats: T[]
) {
  const now = Date.now();
  const DAY = 86_400_000;
  const groups: Record<string, T[]> = {};
  // Pinned chats form their own first bucket,
  // still newest-first inside it; everything else buckets by recency.
  const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
  const pinned = sorted.filter((c) => c.pinned === true);
  if (pinned.length > 0) groups["Pinned"] = pinned;
  for (const chat of sorted) {
    if (chat.pinned === true) continue;
    const diff = now - chat.updatedAt;
    let bucket: string;
    if (diff < DAY) bucket = "Today";
    else if (diff < DAY * 2) bucket = "Yesterday";
    else if (diff < DAY * 7) bucket = "Previous 7 Days";
    else bucket = "Older";
    if (!groups[bucket]) groups[bucket] = [];
    groups[bucket].push(chat);
  }
  return groups;
}

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  /** Force collapse on mobile overlay close */
  onClose?: () => void;
  /** When true on desktop, render sidebar as overlay over content */
  overlayDesktop?: boolean;
}

function isUnread(chatId: string, updatedAt: number, pathname: string): boolean {
  if (pathname === `/chat/${chatId}`) return false;
  try {
    const stamp = window.localStorage.getItem(`leopard:read:${chatId}`);
    return stamp === null ? false : updatedAt > Number(stamp);
  } catch {
    return false;
  }
}

/**
 * Clears a chat's `generating` flag once no assistant row is still streaming.
 * Exists for the navigate-away case: the active chat's provider flips the flag
 * on send/settle, but it unmounts when the user switches chats mid-stream, and
 * in dev (no CONVEX_DEPLOY_KEY) the route's upsertAssistant patch — the prod
 * path — never runs. One per generating row; clears once, then idles.
 */
function StaleGeneratingSweeper({
  chatId,
  userId,
}: {
  chatId: Id<"chats">;
  userId: string | null;
}) {
  const setGenerating = useMutation(api.chats.setGenerating);
  const messages = useQuery(api.messages.list, { chatId });
  const clearedRef = useRef(false);
  useEffect(() => {
    if (!messages || !userId || clearedRef.current) return;
    // A row stuck in `streaming` forever means its generation died with a
    // server restart (in-memory generations don't survive; no final write ever
    // lands). Older than 10 min (settle cap is 300s) → treat as settled.
    const STALE_MS = 10 * 60_000;
    const now = Date.now();
    const stillStreaming = messages.some(
      (m) =>
        m.role === "assistant" &&
        m.status === "streaming" &&
        typeof m.createdAt === "number" &&
        now - m.createdAt < STALE_MS,
    );
    if (!stillStreaming) {
      clearedRef.current = true;
      void setGenerating({ chatId, userId, generating: false }).catch(() => {});
    }
  }, [messages, chatId, userId, setGenerating]);
  return null;
}

export default function Sidebar({
  collapsed = false,
  onToggle,
  onClose,
  overlayDesktop = false,
}: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { theme, toggleTheme } = useLeopardTheme();

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Effective user id — Clerk id, or DEV_USER_ID under BYPASS_CLERK so a fresh
  // unauth'd browser can list/create chats (matches the chat route + new-chat page).
  const userId = user?.id ?? (BYPASS_CLERK ? DEV_USER_ID : null);

  // Convex data — paginated: the
  // unpaginated `.collect()` re-read every row on every mount; 40-row pages
  // + a "Load more" control keep the sidebar O(first-page) at any history
  // size. Settings/export still read the full `chats.list`.
  const {
    results: chatsPage,
    status: chatsStatus,
    loadMore: loadMoreChats,
  } = usePaginatedQuery(
    api.chats.listPage,
    userId ? { userId } : "skip",
    { initialNumItems: 40 },
  );
  const chats = chatsPage;
  const chatsHasMore = chatsStatus === "CanLoadMore";
  const chatsLoadingMore = chatsStatus === "LoadingMore";
  const deleteChat = useMutation(api.chats.remove);
  const renameChat = useMutation(api.chats.updateTitle);
  const setPinned = useMutation(api.chats.setPinned);
  const setArchived = useMutation(api.chats.setArchived);
  // Count archived rows so the hidden-set is discoverable (audit 2026-10-10):
  // archiving with no way back from the sidebar reads as deletion.
  const archivedCount = (chats ?? []).filter((c) => c.archived === true).length;
  const [showArchived, setShowArchived] = useState(false);

  const sidebarOpen = !collapsed;
  const [searchQuery, setSearchQuery] = useState("");

  // Unread tracking (2026-09-04): opening a chat stamps leopard:read:<id>;
  // any chat whose updatedAt is newer than its stamp (and isn't open) shows
  // the unread dot. localStorage — per-browser, no schema churn.
  const activeChatId = pathname.startsWith("/chat/") ? pathname.split("/chat/")[1] : null;
  useEffect(() => {
    if (!activeChatId) return;
    try {
      window.localStorage.setItem(`leopard:read:${activeChatId}`, String(Date.now()));
    } catch { /* private mode */ }
  }, [activeChatId]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const filtered = useMemo(() => {
    if (!chats) return [];
    // Archived rows hide from the sidebar
    // (a direct link to an archived chat still loads) — toggled back on by
    // the "archived" footer chip below.
    const visible = chats.filter((c) => showArchived || c.archived !== true);
    if (!searchQuery.trim()) return visible;
    const q = searchQuery.toLowerCase();
    return visible.filter((c) => c.title.toLowerCase().includes(q));
  }, [chats, searchQuery, showArchived]);

  const grouped = useMemo(() => groupChats(filtered as { _id: string; title: string; updatedAt: number; generating?: boolean; pinned?: boolean; archived?: boolean }[]), [filtered]);


  // Deferred-create: just open the draft surface; the row is minted on the
  // first actual send (see use-active-chat's draft branch).
  const handleNewChat = () => {
    if (isMobile && onClose) onClose();
    router.push("/chat");
  };

  const handleChatClick = (chatId: string) => {
    if ((isMobile || overlayDesktop) && onClose) onClose();
    router.push(`/chat/${chatId}`);
  };

  const handleRename = async (chatId: string) => {
    if (editTitle.trim() && userId) {
      try {
        await renameChat({
          chatId: chatId as Id<"chats">,
          userId,
          title: editTitle.trim(),
        });
      } catch (e) {
        // Keep the editor open so the typed title isn't silently lost (audit
        // 2026-10-08: a failed rename used to discard the new title).
        toast.error("Rename didn't save — try again.");
        console.error("[sidebar] rename failed", e);
        return;
      }
    }
    setEditingId(null);
  };

  // Destructive delete is gated by ConfirmDialog — row click only arms it.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const handleDelete = async (chatId: string) => {
    if (!userId) return;
    // Abort any detached server generation for this chat FIRST — else the
    // route keeps streaming/writing into a deleted conversation (operator
    // 2026-09-04: "deleted the chat but generation continued").
    try {
      await fetch("/api/chat/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId }),
      });
    } catch {
      /* generation may not exist — delete proceeds regardless */
    }
    // The abort's finalize-partial write lands just after /stop responds —
    // give it a beat so the row delete below isn't followed by a zombie upsert.
    await new Promise((r) => setTimeout(r, 300));
    try {
      await deleteChat({ chatId: chatId as Id<"chats">, userId });
    } catch (e) {
      // Keep the confirm dialog open + say why (audit 2026-10-08: a failed
      // delete used to leave the dialog open with no error signal).
      toast.error("Couldn't delete the chat — try again.");
      console.error("[sidebar] delete failed", e);
      return;
    }
    if (pathname === `/chat/${chatId}`) {
      router.push("/chat");
    }
    setPendingDelete(null);
  };

  // ─── Collapsed sidebar (Desktop only) ───
  if (!sidebarOpen && !isMobile) {
    return (
      <div className="flex flex-col items-center justify-between py-4 w-[60px] h-full border-r dark:border-white/[0.08] light:border-black/[0.08] bg-background">
        <div className="flex flex-col items-center gap-3">
          <button
            className="h-10 w-10 flex items-center justify-center rounded-full dark:text-[#737373] light:text-[#737373] hover:dark:text-white hover:light:text-[#171717] hover:dark:bg-white/5 hover:light:bg-black/5 transition-colors"
            onClick={onToggle}
            title="Expand sidebar"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <button
            className="h-9 w-9 flex items-center justify-center rounded-full dark:text-[#737373] light:text-[#737373] hover:text-[#ffb400] hover:dark:bg-[#ffb40010] hover:light:bg-[#d4960010] transition-colors"
            onClick={handleNewChat}
            aria-label="New chat" title="New chat"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Link
            href="/settings"
            aria-label="Settings"
            className="h-9 w-9 flex items-center justify-center rounded-full dark:text-[#525252] light:text-[#8c8c8c] hover:dark:text-white hover:light:text-[#171717] hover:dark:bg-white/5 hover:light:bg-black/5 transition-colors"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Link>
        <button
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="h-9 w-9 flex items-center justify-center rounded-full dark:text-[#525252] light:text-[#8c8c8c] hover:text-[#ffb400] hover:dark:bg-[#ffb40010] hover:light:bg-[#d4960010] transition-colors"
          onClick={toggleTheme}
          title={theme === "dark" ? "Light" : "Dark"}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
          <Link
            href="/settings"
            aria-label="Profile"
            className="h-9 w-9 rounded-full overflow-hidden ring-1 dark:ring-white/10 light:ring-black/10"
            title="Profile"
          >
            <Avatar className="h-9 w-9">
              <AvatarImage src={user?.imageUrl} />
              <AvatarFallback>U</AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </div>
    );
  }

  // ─── Sidebar content ───
  const sidebarContent = (
    <nav aria-label="Chats" className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <Link href="/" className="flex items-center gap-1.5 group">
          <span className="font-signature text-xl text-[#ffb400] text-glow-amber">
            Leopard
          </span>
        </Link>
        <div className="flex items-center gap-0.5">
          <button
            className="h-8 w-8 flex items-center justify-center rounded-full dark:text-[#737373] light:text-[#737373] hover:text-[#ffb400] hover:dark:bg-[#ffb40010] hover:light:bg-[#d4960010] transition-colors"
            onClick={handleNewChat}
            aria-label="New chat" title="New chat"
          >
            <Plus className="h-4 w-4" />
          </button>
          {!isMobile && (
            <button
              className="h-8 w-8 flex items-center justify-center rounded-full dark:text-[#525252] light:text-[#8c8c8c] hover:dark:text-white hover:light:text-[#171717] hover:dark:bg-white/5 hover:light:bg-black/5 transition-colors"
              onClick={onToggle}
              aria-label="Collapse sidebar" title="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
          {isMobile && (
            <button
              className="h-8 w-8 flex items-center justify-center rounded-full dark:text-[#525252] light:text-[#8c8c8c] hover:dark:text-white hover:light:text-[#171717] hover:dark:bg-white/5 hover:light:bg-black/5 transition-colors"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Search — hidden while searching: the ThreadSearch panel carries its
          own field then, so keeping this one rendered read as a duplicate. */}
      {!searchQuery.trim() && (
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 dark:text-[#525252] light:text-[#8c8c8c]" />
            <Input
              type="search"
              placeholder="Search chats…"
              aria-label="Search chats"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 rounded-full pl-10 text-sm dark:bg-white/[0.03] light:bg-black/[0.02] dark:border-white/[0.08] light:border-black/[0.08] focus:dark:border-[#ffb40030] focus:light:border-[#d4960030] focus:dark:ring-[#ffb40020] focus:light:ring-[#d4960020] placeholder:dark:text-[#6b6b6b] dark:text-[#e5e5e5] light:text-[#262626] light:placeholder:text-[#6b6b6b]"
            />
          </div>
        </div>
      )}

      <Separator className="dark:bg-white/[0.08] light:bg-black/[0.05]" />

      {/* Chat List - kit ThreadList rows; ThreadSearch panel while searching */}
      <div className="flex-1 overflow-y-auto px-2 scrollbar-thin">
        <div className="py-3">
          {chats === undefined ? (
            <div className="space-y-3 px-2 py-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-10 rounded-xl dark:bg-white/[0.05] light:bg-black/[0.04] animate-pulse"
                />
              ))}
            </div>
          ) : searchQuery.trim() ? (
            <ThreadSearch
              threads={filtered.map((c) => ({
                id: c._id,
                title: c.title,
                // No group header — a flat match list reads cleaner than a
                // literal "results" label; no preview line (we don't have one).
                group: "",
                preview: "",
              }))}
              query={searchQuery}
              activeId={pathname.startsWith("/chat/") ? pathname.split("/chat/")[1] : ""}
              onQueryChange={setSearchQuery}
              onSelect={(id) => handleChatClick(id)}
              onClear={() => setSearchQuery("")}
              className="mx-1 max-w-none border-0 bg-transparent p-1 shadow-none"
            />
          ) : (
            <>
              {/* Dev-only stale-flag sweeper: navigating away mid-stream unmounts
                  the chat provider, and without a CONVEX_DEPLOY_KEY the route
                  never clears `generating` on settle — the row would blink
                  forever (X9.2). Watch each generating chat and clear once no
                  assistant row is still streaming. */}
              {(chats ?? [])
                .filter((c) => c.generating === true)
                .map((c) => (
                  <StaleGeneratingSweeper key={c._id} chatId={c._id} userId={userId} />
                ))}
              {/* Empty state (audit 2026-10-08: a fresh/fully-deleted account
                  rendered a blank void under the search box). */}
              {chats !== undefined && Object.keys(grouped).length === 0 && (
                <div className="px-3 py-8 text-center">
                  <p className="text-[13px] font-medium dark:text-[#a3a3a3] light:text-[#525252]">
                    No chats yet
                  </p>
                  <p className="mt-1 text-[11px] dark:text-[#6b6b6b] light:text-[#8a8a8a]">
                    Start one — your conversations show up here.
                  </p>
                </div>
              )}
              {Object.entries(grouped).map(([bucket, items]) => (
                <ThreadList
                  key={bucket}
                  label={bucket}
                  className="mb-5"
                  threads={items.map((c) => ({
                    id: c._id,
                    title: c.title,
                    generating: c.generating === true,
                    pinned: c.pinned === true,
                    archived: c.archived === true,
                    unread: isUnread(c._id, c.updatedAt, pathname),
                  }))}
                  activeId={pathname.startsWith("/chat/") ? pathname.split("/chat/")[1] : undefined}
                  onSelect={(id) => handleChatClick(id)}
                  onRename={(id) => {
                    const chat = items.find((c) => c._id === id);
                    setEditTitle(chat?.title ?? "");
                    setEditingId(id);
                  }}
                  onPin={(id) => {
                    const chat = items.find((c) => c._id === id);
                    if (chat && userId) {
                      void setPinned({
                        chatId: id as Id<"chats">,
                        userId,
                        pinned: !(chat.pinned === true),
                      });
                    }
                  }}
                  onArchive={(id) => {
                    const chat = items.find((c) => c._id === id);
                    if (chat && userId) {
                      void setArchived({
                        chatId: id as Id<"chats">,
                        userId,
                        archived: !(chat.archived === true),
                      });
                    }
                  }}
                  onDelete={(id) => setPendingDelete(id)}
                  editingId={editingId}
                  editValue={editTitle}
                  onEditChange={setEditTitle}
                  onEditSubmit={() => editingId && handleRename(editingId)}
                  onEditCancel={() => setEditingId(null)}
                />
              ))}
              {/* Load more: pages in 40-row chunks; hidden while searching
                  (search filters the loaded page) or when the page is full. */}
              {(chatsHasMore || chatsLoadingMore) && !searchQuery.trim() && (
                <div className="px-1 pb-2 pt-1">
                  <button
                    type="button"
                    onClick={() => loadMoreChats(40)}
                    // a11y (audit 2026-10-10): the button's busy state had no
                    // AT signal — a click that pends invisibly reads as dead.
                    aria-busy={chatsLoadingMore}
                    disabled={chatsLoadingMore}
                    className="w-full rounded-xl border px-3 py-2 text-[12px] font-medium dark:border-white/[0.08] light:border-black/[0.08] dark:text-[#a3a3a3] light:text-[#525252] dark:hover:bg-white/[0.04] light:hover:bg-black/[0.03] transition-colors disabled:opacity-50"
                  >
                    {chatsLoadingMore ? "Loading…" : "Load more"}
                  </button>
                </div>
              )}
              {/* Archived toggle (audit 2026-10-10): archive hides rows with
                  no way back from the sidebar — reads as deletion. A footer
                  chip flips archived rows back into view (unarchive from
                  there via the same button, now relabeled). */}
              {archivedCount > 0 && (
                <div className="px-1 pb-2">
                  <button
                    type="button"
                    aria-pressed={showArchived}
                    onClick={() => setShowArchived((s) => !s)}
                    className="w-full rounded-xl border px-3 py-2 text-[12px] font-medium dark:border-white/[0.08] light:border-black/[0.08] dark:text-[#a3a3a3] light:text-[#525252] dark:hover:bg-white/[0.04] light:hover:bg-black/[0.03] transition-colors"
                  >
                    {showArchived ? "Hide" : "Show"} {archivedCount} archived
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* User Footer */}
      <div className="border-t dark:border-white/[0.08] light:border-black/[0.08] p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 ring-1 dark:ring-white/10 light:ring-black/10">
            <AvatarImage src={user?.imageUrl} />
            <AvatarFallback className="bg-[#ffb40015] text-[#ffb400] text-sm font-body font-semibold">
              {user?.firstName?.[0] || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-body dark:text-[#d4d4d4] light:text-[#404040] truncate">
              {user?.firstName || "User"}
            </p>
          </div>
          <Link
            href="/settings"
            className="h-9 w-9 flex items-center justify-center rounded-full dark:text-[#525252] light:text-[#8c8c8c] hover:dark:text-white hover:light:text-[#171717] hover:dark:bg-white/5 hover:light:bg-black/5 transition-colors"
            title="Settings"
            onClick={() => isMobile && onClose && onClose()}
          >
            <Settings className="h-4 w-4" />
          </Link>
      <button
        className="h-9 w-9 flex items-center justify-center rounded-full dark:text-[#525252] light:text-[#8c8c8c] hover:text-[#ffb400] hover:dark:bg-[#ffb40010] hover:light:bg-[#d4960010] transition-colors"
        onClick={toggleTheme}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
          <button
            className="h-9 w-9 flex items-center justify-center rounded-full dark:text-[#525252] light:text-[#8c8c8c] hover:text-red-400 hover:bg-red-500/5 transition-colors"
            onClick={() => signOut()}
            aria-label="Sign out" title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </nav>
  );

  // Expanded sidebar
  return (
    <div
      className={cn(
        "bg-background border-r dark:border-white/[0.08] light:border-black/[0.08] shrink-0",
        isMobile
          ? cn("sidebar-mobile", !sidebarOpen && "-translate-x-full")
          : overlayDesktop
            ? "fixed left-0 top-0 bottom-0 z-50 w-[280px] max-w-[85vw] flex flex-col h-full shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
            : "flex flex-col h-full"
      )}
      style={{ width: isMobile ? undefined : 280 }}
    >
      {sidebarContent}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this chat?"
        description="The conversation and all its messages are permanently removed. This cannot be undone."
        confirmLabel="Delete chat"
        onConfirm={() => (pendingDelete ? handleDelete(pendingDelete) : undefined)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
