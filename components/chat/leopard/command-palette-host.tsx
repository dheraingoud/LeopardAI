"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useLeopardTheme } from "@/components/theme-provider";
import { BYPASS_CLERK, DEV_USER_ID } from "@/lib/dev-user";
import { CommandPalette, type PaletteCommand } from "./command-palette";

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
  const router = useRouter();
  const { toggleTheme } = useLeopardTheme();
  const { user } = useUser();
  const userId = user?.id ?? (BYPASS_CLERK ? DEV_USER_ID : null);
  const chats = useQuery(api.chats.list, userId ? { userId } : "skip");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setQuery("");
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const commands = useMemo<PaletteCommand[]>(() => {
    const base: PaletteCommand[] = [
      { id: "new", label: "New chat", group: "actions", keys: [] },
      { id: "theme", label: "Toggle theme", group: "actions", keys: [] },
      { id: "settings", label: "Open settings", group: "actions", keys: [] },
    ];
    const recent = (chats ?? []).slice(0, 8).map((c) => ({
      id: `chat:${c._id}`,
      label: c.title,
      group: "chats",
      keys: [] as string[],
    }));
    const prompts = SAVED_PROMPTS.map((p) => ({
      id: `prompt:${p.id}`,
      label: p.label,
      group: "prompts",
      keys: [] as string[],
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
