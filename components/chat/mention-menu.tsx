"use client";

import { useMemo } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { MessageSquareIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BYPASS_CLERK, DEV_USER_ID } from "@/lib/dev-user";

/**
 * @-mention popover (aui-forked, leopard-styled). Offers recent chat titles
 * (max 8) from the same Convex source the sidebar uses (api.chats.list, ordered
 * desc by updatedAt). Selecting one applies `applyMention` (composer.tsx) —
 * plain-text insertion, no backend change. Pure presentational; the parent owns
 * input, open state, active index, and keyboard handling.
 */

const MAX_TITLES = 8;

/** Recent chat titles (newest first), read from api.chats.list. */
export function useRecentChatTitles(): string[] {
  const { user } = useUser();
  const userId = user?.id ?? (BYPASS_CLERK ? DEV_USER_ID : null);
  const chats = useQuery(api.chats.list, userId ? { userId } : "skip");
  return useMemo(() => {
    if (!chats) return [];
    return chats
      .slice(0, MAX_TITLES)
      .map((c) => c.title)
      .filter((t): t is string => Boolean(t && t.trim().length > 0));
  }, [chats]);
}

export function MentionMenu({
  titles,
  activeIndex,
  onSelect,
}: {
  titles: readonly string[];
  activeIndex: number;
  onSelect: (title: string) => void;
}) {
  return (
    <div
      data-slot="mention-menu"
      className={cn(
        "absolute bottom-full start-0 z-30 mb-2 w-64 max-w-[calc(100vw-2rem)] rounded-md border",
        "dark:border-white/[0.08] light:border-black/[0.08]",
        "dark:bg-[#141414] light:bg-white",
        "dark:shadow-[0_1px_1px_rgba(0,0,0,0.2),0_8px_16px_-4px_rgba(0,0,0,0.25),0_24px_32px_-8px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)]",
        "light:shadow-[0_1px_1px_rgba(0,0,0,0.02),0_8px_16px_-4px_rgba(0,0,0,0.04),0_24px_32px_-8px_rgba(0,0,0,0.06),inset_0_0_0_1px_rgba(0,0,0,0.02)]",
        "flex max-h-72 flex-col overflow-y-auto p-1.5",
      )}
      role="listbox"
      aria-label="Chats"
    >
      {titles.length === 0 ? (
        <div className="flex items-center gap-2 px-2 py-2">
          <MessageSquareIcon className="size-3 dark:text-[#737373] light:text-[#8a8a8a]" />
          <span className="font-mono text-[11px] dark:text-[#737373] light:text-[#8a8a8a]">
            No chats yet
          </span>
        </div>
      ) : (
        titles.map((title, i) => {
          const active = i === activeIndex;
          return (
            <button
              key={title}
              type="button"
              role="option"
              aria-selected={active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(title)}
              className={cn(
                "flex w-full items-center gap-2 rounded-[6px] px-2 py-2 text-start transition-colors",
                active
                  ? "dark:bg-white/[0.06] light:bg-black/[0.05]"
                  : "hover:dark:bg-white/[0.04] hover:light:bg-black/[0.03]",
              )}
            >
              <span
                className={cn(
                  "w-[2px] shrink-0 rounded-full bg-[#ffb400] transition-opacity",
                  active ? "opacity-100" : "opacity-0",
                )}
              />
              <MessageSquareIcon
                className={cn(
                  "size-3.5 shrink-0",
                  active
                    ? "dark:text-[#ffb400] light:text-[#d49600]"
                    : "dark:text-[#737373] light:text-[#8a8a8a]",
                )}
              />
              <span
                className={cn(
                  "truncate text-[13px] dark:text-[#e5e5e5] light:text-[#262626]",
                  active &&
                    "dark:text-[#ffb400] light:text-[#d49600]",
                )}
              >
                {title}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}