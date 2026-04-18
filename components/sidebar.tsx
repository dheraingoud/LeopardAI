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
  Cpu,
  GraduationCap,
  Plus,
  Search,
  Settings,
  Trash2,
  PanelLeftClose,
  PanelLeft,
  MessageSquare,
  Network,
  MoreHorizontal,
  Pencil,
  LogOut,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Convex data
  const chats = useQuery(api.chats.list, user ? { userId: user.id } : "skip");
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
    if (!user) return;
    const id = await createChat({
      userId: user.id,
      title: "New Chat",
      model: "minimax-m2.5",
    });
    if (isMobile && onClose) onClose();
    router.push(`/app/chat/${id}`);
  };

  const handleChatClick = (chatId: string, type?: string, workspaceId?: string) => {
    if ((isMobile || overlayDesktop) && onClose) onClose();
    if (type === "sql") {
      router.push(`/app/schema?chatId=${chatId}${workspaceId ? `&workspaceId=${workspaceId}` : ''}`);
    } else if (type === "playground") {
      router.push(`/app/playground/${workspaceId}?chatId=${chatId}`);
    } else if (type === "audit") {
      router.push(`/app/audit?chatId=${chatId}`);
    } else if (type === "ai-dev") {
      router.push(`/app/ai-dev?chatId=${chatId}`);
    } else if (type === "teaching") {
      router.push(`/app/teaching?chatId=${chatId}`);
    } else {
      router.push(`/app/chat/${chatId}`);
    }
  };

  const handleRename = async (chatId: string) => {
    if (editTitle.trim() && user) {
      await renameChat({
        chatId: chatId as Id<"chats">,
        userId: user.id,
        title: editTitle.trim(),
      });
    }
    setEditingId(null);
  };

  const handleDelete = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (!user) return;
    await deleteChat({ chatId: chatId as Id<"chats">, userId: user.id });
    if (pathname === `/app/chat/${chatId}`) {
      router.push("/app");
    }
  };

  // ─── Collapsed sidebar (Desktop only) ───
  if (!sidebarOpen && !isMobile) {
    return (
      <div className="flex flex-col items-center justify-between py-4 w-[60px] border-r border-white/[0.08] bg-[#050505] h-full">
        <div className="flex flex-col items-center gap-3">
          <button
            className="h-10 w-10 flex items-center justify-center rounded-lg text-[#737373] hover:text-white hover:bg-white/5 transition-colors"
            onClick={onToggle}
            title="Expand sidebar"
          >
            <PanelLeft className="h-5 w-5" />
          </button>
          <button
            className="h-9 w-9 flex items-center justify-center rounded-lg text-[#737373] hover:text-[#ffb400] hover:bg-[#ffb40010] transition-colors"
            onClick={handleNewChat}
            title="New chat"
          >
            <Plus className="h-5 w-5" />
          </button>
          <Link
            href="/app/schema"
            className="h-9 w-9 flex items-center justify-center rounded-lg text-[#737373] hover:text-[#ffb400] hover:bg-[#ffb40010] transition-colors"
            title="Schema visualizer"
          >
            <Network className="h-4.5 w-4.5" />
          </Link>
          <Link
            href="/app/audit"
            className="h-9 w-9 flex items-center justify-center rounded-lg text-[#737373] hover:text-emerald-300 hover:bg-emerald-400/10 transition-colors"
            title="Auditor workspace"
          >
            <Search className="h-4.5 w-4.5" />
          </Link>
          <Link
            href="/app/ai-dev"
            className="h-9 w-9 flex items-center justify-center rounded-lg text-[#737373] hover:text-sky-300 hover:bg-sky-400/10 transition-colors"
            title="AI Dev workspace"
          >
            <Cpu className="h-4.5 w-4.5" />
          </Link>
          <Link
            href="/app/teaching"
            className="h-9 w-9 flex items-center justify-center rounded-lg text-[#737373] hover:text-amber-300 hover:bg-amber-400/10 transition-colors"
            title="Teaching workspace"
          >
            <GraduationCap className="h-4.5 w-4.5" />
          </Link>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Link
            href="/app/settings"
            className="h-9 w-9 flex items-center justify-center rounded-lg text-[#525252] hover:text-white hover:bg-white/5 transition-colors"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Link>
          <button className="h-9 w-9 rounded-full overflow-hidden ring-1 ring-white/10" title="Profile">
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
            className="h-8 w-8 flex items-center justify-center rounded-lg text-[#737373] hover:text-[#ffb400] hover:bg-[#ffb40010] hover-lift transition-colors"
            onClick={handleNewChat}
            title="New chat"
          >
            <Plus className="h-5 w-5" />
          </button>
          {!isMobile && (
            <button
              className="h-8 w-8 flex items-center justify-center rounded-lg text-[#525252] hover:text-white hover:bg-white/5 transition-colors"
              onClick={onToggle}
              title="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
          {isMobile && (
            <button
              className="h-8 w-8 flex items-center justify-center rounded-lg text-[#525252] hover:text-white hover:bg-white/5 transition-colors"
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#525252]" />
          <Input
            placeholder="Search chats…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 pl-10 text-sm bg-white/[0.03] border-white/[0.08] focus:border-[#ffb40030] focus:ring-[#ffb40020] placeholder:text-[#505050]"
          />
        </div>

        <Link
          href="/app/schema"
          onClick={() => {
            if ((isMobile || overlayDesktop) && onClose) onClose();
          }}
          className={cn(
            "mt-2 flex h-10 items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
            pathname.startsWith("/app/schema")
              ? "border-[#ffb40040] bg-[#ffb40012] text-[#ffcf66]"
              : "border-white/[0.08] bg-white/[0.02] text-[#a3a3a3] hover:text-white hover:border-white/[0.2]",
          )}
        >
          <Network className="h-4 w-4" />
          <span>Schema Visualizer</span>
        </Link>

        <Link
          href="/app/audit"
          onClick={() => {
            if ((isMobile || overlayDesktop) && onClose) onClose();
          }}
          className={cn(
            "mt-2 flex h-10 items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
            pathname.startsWith("/app/audit")
              ? "border-emerald-300/45 bg-emerald-400/12 text-emerald-200"
              : "border-white/[0.08] bg-white/[0.02] text-[#a3a3a3] hover:text-white hover:border-white/[0.2]",
          )}
        >
          <Search className="h-4 w-4" />
          <span>Auditor Workspace</span>
        </Link>

        <Link
          href="/app/ai-dev"
          onClick={() => {
            if ((isMobile || overlayDesktop) && onClose) onClose();
          }}
          className={cn(
            "mt-2 flex h-10 items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
            pathname.startsWith("/app/ai-dev")
              ? "border-sky-300/45 bg-sky-400/12 text-sky-200"
              : "border-white/[0.08] bg-white/[0.02] text-[#a3a3a3] hover:text-white hover:border-white/[0.2]",
          )}
        >
          <Cpu className="h-4 w-4" />
          <span>AI Dev Learner</span>
        </Link>

        <Link
          href="/app/teaching"
          onClick={() => {
            if ((isMobile || overlayDesktop) && onClose) onClose();
          }}
          className={cn(
            "mt-2 flex h-10 items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
            pathname.startsWith("/app/teaching")
              ? "border-amber-300/45 bg-amber-400/12 text-amber-200"
              : "border-white/[0.08] bg-white/[0.02] text-[#a3a3a3] hover:text-white hover:border-white/[0.2]",
          )}
        >
          <GraduationCap className="h-4 w-4" />
          <span>Teaching Space</span>
        </Link>
      </div>

      <Separator className="bg-white/[0.08]" />

      {/* Chat List - Native Scroll for reliability */}
      <div className="flex-1 overflow-y-auto px-2 scroll-container scrollbar-thin">
        <div className="py-3">
          {chats === undefined ? (
            <div className="space-y-3 px-2 py-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-10 rounded-lg bg-white/[0.02] animate-pulse"
                />
              ))}
            </div>
          ) : (
            Object.entries(grouped).map(([bucket, items]) => (
              <div key={bucket} className="mb-5">
                <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-widest text-[#505050]">
                  {bucket}
                </p>
                <AnimatePresence>
                  {items.map((chat: any) => {
                    // Check if current route matches this chat
                    const isActive = pathname === `/app/chat/${chat._id}` || 
                                     (pathname.startsWith("/app/schema") && chat.type === 'sql') ||
                                     (pathname.startsWith("/app/audit") && chat.type === 'audit') ||
                                     (pathname.startsWith("/app/ai-dev") && chat.type === 'ai-dev') ||
                                     (pathname.startsWith("/app/teaching") && chat.type === 'teaching') ||
                                     (pathname.startsWith("/app/playground") && chat.type === 'playground');

                    // Determine icon based on chat type
                    let ChatIcon = MessageSquare;
                    if (chat.type === "sql") ChatIcon = Network;
                    else if (chat.type === "audit") ChatIcon = Search;
                    else if (chat.type === "ai-dev") ChatIcon = Cpu;
                    else if (chat.type === "teaching") ChatIcon = GraduationCap;
                    else if (chat.type === "playground") ChatIcon = Cpu; // Replace with playground icon

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
                              className="h-9 text-sm bg-white/5 border-[#ffb40030]"
                            />
                          </div>
                        ) : (
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => handleChatClick(chat._id, chat.type, chat.workspaceId)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleChatClick(chat._id, chat.type, chat.workspaceId);
                              }
                            }}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-all duration-150 relative cursor-pointer",
                              isActive
                                ? "bg-white/[0.08] text-white"
                                : "text-[#a3a3a3] hover:bg-white/[0.04] hover:text-white"
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
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  className="h-7 w-7 flex items-center justify-center rounded hover:bg-white/10"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreHorizontal className="h-4 w-4 text-[#737373]" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="end"
                                  className="glass-elevated border-white/[0.08] bg-[#111] min-w-[140px]"
                                >
                                  <DropdownMenuItem
                                    className="text-sm font-body gap-2 text-[#d4d4d4] focus:bg-white/5 focus:text-white cursor-pointer"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditTitle(chat.title);
                                      setEditingId(chat._id);
                                    }}
                                  >
                                    <Pencil className="h-4 w-4" />
                                    Rename
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-sm font-body gap-2 text-red-400 focus:bg-red-500/10 focus:text-red-400 cursor-pointer"
                                    onClick={(e) => handleDelete(e, chat._id)}
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
      <div className="border-t border-white/[0.08] p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 ring-1 ring-white/10">
            <AvatarImage src={user?.imageUrl} />
            <AvatarFallback className="bg-[#ffb40015] text-[#ffb400] text-sm font-body font-bold">
              {user?.firstName?.[0] || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-body text-[#d4d4d4] truncate">
              {user?.firstName || "User"}
            </p>
          </div>
          <Link
            href="/app/settings"
            className="h-9 w-9 flex items-center justify-center rounded-lg text-[#525252] hover:text-white hover:bg-white/5 transition-colors"
            title="Settings"
            onClick={() => isMobile && onClose && onClose()}
          >
            <Settings className="h-4 w-4" />
          </Link>
          <button
            className="h-7 w-7 flex items-center justify-center rounded-lg text-[#525252] hover:text-red-400 hover:bg-red-500/5 transition-colors"
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
        "bg-[#050505] border-r border-white/[0.04] shrink-0",
        isMobile
          ? "sidebar-mobile"
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
