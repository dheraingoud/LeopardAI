"use client";

import { TerminalIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { skillSlug, type SkillConfig } from "@/lib/skill-config";

/**
 * Slash-command popover (aui-forked, leopard-styled). Lists ENABLED skills as
 * `/slug` commands with the human name + truncated body. Inserting a match
 * places `/<slug> ` in the textarea — the token the server parses via
 * `getInvokedSkillBodies` (lib/skill-config). Pure presentational: the parent
 * owns input, open state, active index, and keyboard handling.
 */

export interface SlashMatch {
  skill: SkillConfig;
  slug: string;
}

/** Enabled skills whose slug (or display name) starts with the slash query.
 *  Mirrors `useSlashMatches` semantics — empty query yields every enabled skill. */
export function getSlashMatches(
  value: string,
  skills: readonly SkillConfig[] | undefined,
): SlashMatch[] {
  if (!skills || !value.startsWith("/")) return [];
  const query = value.slice(1).toLowerCase();
  return skills
    .filter((s) => s.enabled)
    .map((s) => ({ skill: s, slug: skillSlug(s) }))
    .filter(({ skill, slug }) => {
      if (!query) return true;
      return (
        skill.name.toLowerCase().startsWith(query) || slug.startsWith(query)
      );
    });
}

function oneLine(body: string): string {
  return body.replace(/\s+/g, " ").trim();
}

export function SlashMenu({
  matches,
  activeIndex,
  onSelect,
}: {
  matches: readonly SlashMatch[];
  activeIndex: number;
  onSelect: (match: SlashMatch) => void;
}) {
  return (
    <div
      data-slot="slash-menu"
      className={cn(
        "absolute bottom-full start-0 z-30 mb-2 w-80 max-w-[calc(100vw-2rem)] rounded-md border",
        "dark:border-white/[0.08] light:border-black/[0.08]",
        "dark:bg-[#141414] light:bg-white",
        "dark:shadow-[0_1px_1px_rgba(0,0,0,0.2),0_8px_16px_-4px_rgba(0,0,0,0.25),0_24px_32px_-8px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)]",
        "light:shadow-[0_1px_1px_rgba(0,0,0,0.02),0_8px_16px_-4px_rgba(0,0,0,0.04),0_24px_32px_-8px_rgba(0,0,0,0.06),inset_0_0_0_1px_rgba(0,0,0,0.02)]",
        "flex max-h-72 flex-col overflow-y-auto p-1.5",
      )}
      role="listbox"
      aria-label="Commands"
    >
      <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-1">
        <TerminalIcon className="size-3 dark:text-[#737373] light:text-[#8a8a8a]" />
        <span className="font-mono text-[10px] uppercase tracking-widest dark:text-[#737373] light:text-[#8a8a8a]">
          Commands
        </span>
      </div>
      {matches.map((match, i) => {
        const active = i === activeIndex;
        return (
          <button
            key={match.skill.id}
            type="button"
            role="option"
            aria-selected={active}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(match)}
            className={cn(
              "flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-start transition-colors",
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
            <span
              className={cn(
                "shrink-0 font-mono text-[11px]",
                active
                  ? "dark:text-[#ffb400] light:text-[#d49600]"
                  : "dark:text-[#a3a3a3] light:text-[#525252]",
              )}
            >
              /{match.slug}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span
                className={cn(
                  "truncate text-[13px] dark:text-[#e5e5e5] light:text-[#262626]",
                )}
              >
                {match.skill.name}
              </span>
              {match.skill.body && (
                <span className="truncate font-mono text-[11px] dark:text-[#737373] light:text-[#8a8a8a]">
                  {oneLine(match.skill.body)}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}