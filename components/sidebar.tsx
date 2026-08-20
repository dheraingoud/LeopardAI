"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useUser, useClerk } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Plus,
  Search,
  Settings,
  Trash2,
  PanelLeftClose,
  PanelLeft,
  MessageSquare,
  Sun,
  Moon,
  MoreHorizontal,
  Pencil,
  LogOut,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLeopardTheme } from "@/components/theme-provider";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getDefaultChatModel } from "@/lib/ai/models";
import { BYPASS_CLERK, DEV_USER_ID } from "@/lib/dev-user";

/** Group chats by relative date buckets */
function groupChats(
  chats: { _id: string; title: string; updatedAt: number }[]
) {
  const now = Date.now();
  const DAY = 86_400_000;
  const groups: Record<string, typeof chats> = {};
  const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
  for (const chat of sorted) {
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

  // Convex data
  const chats = useQuery(api.chats.list, userId ? { userId } : "skip");
  const createChat = useMutation(api.chats.create);
  const deleteChat = useMutation(api.chats.remove);
  const renameChat = useMutation(api.chats.updateTitle);

  const sidebarOpen = !collapsed;
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!chats) return [];
    if (!searchQuery.trim()) return chats;
    const q = searchQuery.toLowerCase();
    return chats.filter((c) => c.title.toLowerCase().includes(q));
  }, [chats, searchQuery]);

  const grouped = useMemo(() => groupChats(filtered as { _id: string; title: string; updatedAt: number }[]), [filtered]);

  useEffect(() => {
    if (editingId && editRef.current) editRef.current.focus();
  }, [editingId]);

  const handleNewChat = async () => {
    if (!userId) return;
    const id = await createChat({
      userId,
      title: "New Chat",
      model: getDefaultChatModel().id,
    });
    if (isMobile && onClose) onClose();
    router.push(`/chat/${id}`);
  };

  const handleChatClick = (chatId: string) => {
    if ((isMobile || overlayDesktop) && onClose) onClose();
    router.push(`/chat/${chatId}`);
  };

  const handleRename = async (chatId: string) => {
    if (editTitle.trim() && userId) {
      await renameChat({
        chatId: chatId as Id<"chats">,
        userId,
        title: editTitle.trim(),
      });
    }
    setEditingId(null);
  };

  const handleDelete = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (!userId) return;
    await deleteChat({ chatId: chatId as Id<"chats">, userId });
    if (pathname === `/chat/${chatId}`) {
      router.push("/chat");
    }
  };

  // ─── Collapsed sidebar (Desktop only) ───
  if (!sidebarOpen && !isMobile) {
    return (
      <div className="flex flex-col items-center justify-between py-4 w-[60px] h-full border-r dark:border-white/[0.08] light:border-black/[0.08] dark:bg-[#070605] light:bg-[#f8f8f8]">
        <div className="flex flex-col items-center gap-3">
          <button
            className="h-10 w-10 flex items-center justify-center rounded-lg dark:text-[#737373] light:text-[#737373] hover:dark:text-white light:text-[#171717] hover:dark:bg-white/5 light:bg-black/5 transition-colors"
            onClick={onToggle}
            title="Expand sidebar"
          >
            <PanelLeft className="h-5 w-5" />
          </button>
          <button
            className="h-9 w-9 flex items-center justify-center rounded-lg dark:text-[#737373] light:text-[#737373] hover:text-[#ffb400] hover:dark:bg-[#ffb40010] light:bg-[#d4960010] transition-colors"
            onClick={handleNewChat}
            title="New chat"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Link
            href="/settings"
            className="h-9 w-9 flex items-center justify-center rounded-lg dark:text-[#525252] light:text-[#8c8c8c] hover:dark:text-white light:text-[#171717] hover:dark:bg-white/5 light:bg-black/5 transition-colors"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Link>
        <button
          className="h-9 w-9 flex items-center justify-center rounded-lg dark:text-[#525252] light:text-[#8c8c8c] hover:text-[#ffb400] hover:dark:bg-[#ffb40010] light:bg-[#d4960010] transition-colors"
          onClick={toggleTheme}
          title={theme === "dark" ? "Light" : "Dark"}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
          <button className="h-9 w-9 rounded-full overflow-hidden ring-1 dark:ring-white/10 light:ring-black/10" title="Profile">
            <Avatar className="h-9 w-9">
              <AvatarImage src={user?.imageUrl} />
              <AvatarFallback>U</AvatarFallback>
            </Avatar>
          </button>
        </div>
      </div>
    );
  }

  // ─── Sidebar content ───
  const sidebarContent = (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <Link href="/" className="flex items-center gap-1.5 group">
          <span className="font-signature text-xl text-[#ffb400] text-glow-amber group-hover:tracking-wider transition-all">
            Leopard
          </span>
        </Link>
        <div className="flex items-center gap-0.5">
          <button
            className="h-8 w-8 flex items-center justify-center rounded-lg dark:text-[#737373] light:text-[#737373] hover:text-[#ffb400] hover:dark:bg-[#ffb40010] light:bg-[#d4960010] hover-lift transition-colors"
            onClick={handleNewChat}
            title="New chat"
          >
            <Plus className="h-5 w-5" />
          </button>
          {!isMobile && (
            <button
              className="h-8 w-8 flex items-center justify-center rounded-lg dark:text-[#525252] light:text-[#8c8c8c] hover:dark:text-white light:text-[#171717] hover:dark:bg-white/5 light:bg-black/5 transition-colors"
              onClick={onToggle}
              title="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
          {isMobile && (
            <button
              className="h-8 w-8 flex items-center justify-center rounded-lg dark:text-[#525252] light:text-[#8c8c8c] hover:dark:text-white light:text-[#171717] hover:dark:bg-white/5 light:bg-black/5 transition-colors"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 dark:text-[#525252] light:text-[#8c8c8c]" />
          <Input
            placeholder="Search chats…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 pl-10 text-sm dark:bg-white/[0.03] light:bg-black/[0.02] dark:border-white/[0.08] light:border-black/[0.08] focus:dark:border-[#ffb40030] light:border-[#d4960030] focus:dark:ring-[#ffb40020] light:ring-[#d4960020] placeholder:dark:text-[#505050] light:text-[#737373] light:text-[#737373]"
          />
        </div>
      </div>

      <Separator className="dark:bg-white/[0.08] light:bg-black/[0.05]" />

      {/* Chat List - Native Scroll for reliability */}
      <div className="flex-1 overflow-y-auto px-2 scroll-container scrollbar-thin">
        <div className="py-3">
          {chats === undefined ? (
            <div className="space-y-3 px-2 py-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-10 rounded-lg dark:bg-white/[0.02] light:bg-black/[0.015] animate-pulse"
                />
              ))}
            </div>
          ) : (
            Object.entries(grouped).map(([bucket, items]) => (
              <div key={bucket} className="mb-5">
                <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-widest dark:text-[#505050] light:text-[#737373] light:text-[#737373]">
                  {bucket}
                </p>
                <AnimatePresence>
                  {items.map((chat: any) => {
                    // Check if current route matches this chat
                    const isActive = pathname === `/chat/${chat._id}`;

                    // Chat-only now (workspaces cut); always message icon.
                    const ChatIcon = MessageSquare;

                    return (
                      <motion.div
                        key={chat._id}
                        layout
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="relative group mb-1"
                      >
                        {editingId === chat._id ? (
                          <div className="px-2 py-2">
                            <Input
                              ref={editRef}
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              onBlur={() => handleRename(chat._id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleRename(chat._id);
                                if (e.key === "Escape") setEditingId(null);
                              }}
                              className="h-9 text-sm dark:bg-white/5 light:bg-black/5 dark:border-[#ffb40030] light:border-[#d4960030]"
                            />
                          </div>
                        ) : (
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => handleChatClick(chat._id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleChatClick(chat._id);
                              }
                            }}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-all duration-150 relative cursor-pointer",
                              isActive
                                ? "dark:bg-white/[0.08] light:bg-black/[0.05] dark:text-white light:text-[#171717]"
                                : "dark:text-[#a3a3a3] light:text-[#525252] hover:dark:bg-white/[0.04] light:bg-black/[0.03] hover:dark:text-white light:text-[#171717]"
                            )}
                          >
                            {/* Active indicator bar */}
                            {isActive && (
                              <div className="absolute left-0 top-2 bottom-2 w-[3px] bg-[#ffb400] rounded-full" />
                            )}
                            <ChatIcon
                              className={cn(
                                "h-4 w-4 shrink-0",
                                isActive ? "text-[#ffb400]" : "text-[#606060]"
                              )}
                            />
                            <span className="truncate text-sm font-body flex-1">
                              {chat.title}
                            </span>
                            <div className="action-reveal flex items-center">
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  render={
                                    <button
                                      type="button"
                                      className="h-7 w-7 flex items-center justify-center rounded hover:dark:bg-white/10 light:bg-black/10"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <MoreHorizontal className="h-4 w-4 dark:text-[#737373] light:text-[#737373]" />
                                    </button>
                                  }
                                />
                                <DropdownMenuContent
                                  align="end"
                                  side="bottom"
                                  className="glass-elevated dark:border-white/[0.08] light:border-black/[0.08] dark:bg-[#111] light:bg-[#f0f0f0] min-w-[140px]"
                                >
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setEditTitle(chat.title);
                                      setEditingId(chat._id);
                                    }}
                                  >
                                    <Pencil className="h-4 w-4" />
                                    Rename
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator className="dark:bg-white/[0.06] light:bg-black/[0.06]" />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(e as unknown as React.MouseEvent, chat._id);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            ))
          )}
        </div>
      </div>

      {/* User Footer */}
      <div className="border-t dark:border-white/[0.08] light:border-black/[0.08] p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 ring-1 dark:ring-white/10 light:ring-black/10">
            <AvatarImage src={user?.imageUrl} />
            <AvatarFallback className="bg-[#ffb40015] text-[#ffb400] text-sm font-body font-bold">
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
            className="h-9 w-9 flex items-center justify-center rounded-lg dark:text-[#525252] light:text-[#8c8c8c] hover:dark:text-white light:text-[#171717] hover:dark:bg-white/5 light:bg-black/5 transition-colors"
            title="Settings"
            onClick={() => isMobile && onClose && onClose()}
          >
            <Settings className="h-4 w-4" />
          </Link>
      <button
        className="h-9 w-9 flex items-center justify-center rounded-lg dark:text-[#525252] light:text-[#8c8c8c] hover:text-[#ffb400] hover:dark:bg-[#ffb40010] light:bg-[#d4960010] transition-colors"
        onClick={toggleTheme}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
          <button
            className="h-7 w-7 flex items-center justify-center rounded-lg dark:text-[#525252] light:text-[#8c8c8c] hover:text-red-400 hover:bg-red-500/5 transition-colors"
            onClick={() => signOut()}
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  // Expanded sidebar
  return (
    <div
      className={cn(
        "dark:bg-[#070605] light:bg-[#f8f8f8] border-r dark:border-white/[0.04] light:border-black/[0.05] shrink-0",
        isMobile
          ? cn("sidebar-mobile", !sidebarOpen && "-translate-x-full")
          : overlayDesktop
            ? "fixed left-0 top-0 bottom-0 z-50 w-[280px] max-w-[85vw] flex flex-col h-full shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
            : "flex flex-col h-full"
      )}
      style={{ width: isMobile ? undefined : 280 }}
    >
      {sidebarContent}
    </div>
  );
}
