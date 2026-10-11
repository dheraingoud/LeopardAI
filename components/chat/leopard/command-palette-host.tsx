"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useLeopardTheme } from "@/components/theme-provider";
import { BYPASS_CLERK, DEV_USER_ID } from "@/lib/dev-user";
import {
  MessageSquarePlus,
  SunMoon,
  Settings,
  MessageSquare,
  Lightbulb,
  Code2,
  Compass,
  Mail,
} from "lucide-react";
import { CommandPalette, type PaletteCommand } from "./command-palette";

const PROMPT_ICONS = { explain: Lightbulb, code: Code2, research: Compass, email: Mail } as const;

// Curated starter prompts surfaced as palette commands; selecting one loads it
// into the composer via the composer:set-text event.
const SAVED_PROMPTS = [
  { id: "explain", label: "Explain a concept", text: "Explain a concept: " },
  { id: "code", label: "Write code", text: "Write code that " },
  { id: "research", label: "Research a topic", text: "Research " },
  { id: "email", label: "Draft an email", text: "Draft an email " },
];

// Cmd/Ctrl+K global palette. Commands: navigation + theme + recent chats.
export function CommandPaletteHost() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState("");
  // a11y (audit 2026-10-10): Escape/Cmd-K closed the palette with focus
  // landing on <body> — keyboard users had to re-tab to their element.
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const { toggleTheme } = useLeopardTheme();
  const { user } = useUser();
  const userId = user?.id ?? (BYPASS_CLERK ? DEV_USER_ID : null);
  const chats = useQuery(api.chats.list, userId ? { userId } : "skip");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!open) {
          // Snapshot the focused element so close returns focus to it.
          lastFocusRef.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
        }
        setOpen((o) => !o);
        setQuery("");
        setActiveId(""); // reset highlight so Enter lands on the first match
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Restore focus on close (see lastFocusRef note above).
  useEffect(() => {
    if (open) return;
    const prev = lastFocusRef.current;
    if (prev && document.contains(prev)) {
      // Defer one frame — the palette's own input still holds focus during
      // this render, and a synchronous focus() loses to the unmount.
      requestAnimationFrame(() => prev.focus());
    }
  }, [open]);

  const commands = useMemo<PaletteCommand[]>(() => {
    const base: PaletteCommand[] = [
      { id: "new", label: "New chat", group: "actions", keys: [], icon: MessageSquarePlus },
      { id: "theme", label: "Toggle theme", group: "actions", keys: [], icon: SunMoon },
      { id: "settings", label: "Open settings", group: "actions", keys: [], icon: Settings },
    ];
    const recent = (chats ?? []).slice(0, 8).map((c) => ({
      id: `chat:${c._id}`,
      label: c.title,
      group: "chats",
      keys: [] as string[],
      icon: MessageSquare,
    }));
    const prompts = SAVED_PROMPTS.map((p) => ({
      id: `prompt:${p.id}`,
      label: p.label,
      group: "prompts",
      keys: [] as string[],
      icon: PROMPT_ICONS[p.id as keyof typeof PROMPT_ICONS] ?? Lightbulb,
    }));
    return [...base, ...prompts, ...recent];
  }, [chats]);

  const run = (id: string) => {
    setOpen(false);
    if (id === "new") router.push("/chat");
    else if (id === "theme") toggleTheme();
    else if (id === "settings") router.push("/settings");
    else if (id.startsWith("chat:")) router.push(`/chat/${id.slice(5)}`);
    else if (id.startsWith("prompt:")) {
      const prompt = SAVED_PROMPTS.find((p) => `prompt:${p.id}` === id);
      if (!prompt) return;
      router.push("/chat");
      requestAnimationFrame(() => {
        window.dispatchEvent(
          new CustomEvent("composer:set-text", { detail: { text: prompt.text } }),
        );
      });
    }
  };

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[18vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md px-4">
        <CommandPalette
          commands={commands}
          query={query}
          activeId={activeId}
          onQueryChange={setQuery}
          onActiveChange={setActiveId}
          onRun={run}
          className="w-full max-w-none"
        />
      </div>
    </div>
  );
}
