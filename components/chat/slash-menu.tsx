"use client";

import { SlashIcon, CornerDownLeftIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { skillSlug, type SkillConfig } from "@/lib/skill-config";

/**
 * Slash-command popover (aui-forked, leopard-styled). Lists ENABLED skills as
 * `/slug` command cards. Inserting a match places `/<slug> ` in the textarea —
 * the token the server parses via `getInvokedSkillBodies` (lib/skill-config).
 * Pure presentational: the parent owns input, open state, active index, and
 * keyboard handling.
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

/** One short line: first sentence of the body, hard-capped. */
function blurb(body: string | undefined): string {
  if (!body) return "";
  const flat = body.replace(/\s+/g, " ").trim();
  const sentence = flat.split(/(?<=[.!?])\s/)[0] ?? flat;
  return sentence.length > 110 ? `${sentence.slice(0, 107)}…` : sentence;
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
        "absolute bottom-full start-0 z-30 mb-2.5 w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[14px] border",
        "dark:border-white/[0.09] light:border-black/[0.08]",
        "dark:bg-[#131210] light:bg-[#fdfaf2]",
        "dark:shadow-[0_1px_1px_rgba(0,0,0,0.25),0_12px_28px_-8px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)]",
        "light:shadow-[0_1px_1px_rgba(0,0,0,0.03),0_12px_28px_-8px_rgba(0,0,0,0.08),inset_0_0_0_1px_rgba(0,0,0,0.02)]",
        "flex max-h-[340px] flex-col",
      )}
      role="listbox"
      aria-label="Commands"
    >
      {/* header — mono eyebrow + count */}
      <div className="flex items-center justify-between border-b px-3.5 py-2.5 dark:border-white/[0.07] light:border-black/[0.06]">
        <div className="flex items-center gap-2">
          <span className="grid size-5 place-items-center rounded-md dark:bg-[#ffb400]/[0.12] light:bg-[#d49600]/[0.12]">
            <SlashIcon className="size-3 dark:text-[#ffb400] light:text-[#d49600]" />
          </span>
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] dark:text-[#8a8a8a] light:text-[#6a6a6a]">
            Commands
          </span>
        </div>
        <span className="font-mono text-[10px] tabular-nums dark:text-[#525252] light:text-[#a3a3a3]">
          {matches.length}
        </span>
      </div>

      {/* command list */}
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {matches.map((match, i) => {
          const active = i === activeIndex;
          const desc = blurb(match.skill.body);
          return (
            <button
              key={match.skill.id}
              type="button"
              role="option"
              aria-selected={active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(match)}
              className={cn(
                "group flex w-full items-start gap-3 rounded-[9px] px-2.5 py-2.5 text-start transition-colors duration-100",
                active
                  ? "dark:bg-white/[0.07] light:bg-black/[0.045]"
                  : "hover:dark:bg-white/[0.04] hover:light:bg-black/[0.03]",
              )}
            >
              {/* amber tick rail */}
              <span
                className={cn(
                  "mt-[7px] h-3.5 w-[2.5px] shrink-0 rounded-full bg-[#ffb400] transition-all duration-150 light:bg-[#d49600]",
                  active ? "opacity-100 scale-y-100" : "opacity-0 scale-y-50",
                )}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <span className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "truncate text-[13px] font-medium leading-5 transition-colors",
                      active
                        ? "dark:text-white light:text-black"
                        : "dark:text-[#e5e5e5] light:text-[#262626]",
                    )}
                  >
                    {match.skill.name}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-mono text-[10.5px] leading-5 transition-colors",
                      active
                        ? "dark:text-[#ffb400] light:text-[#d49600]"
                        : "dark:text-[#737373] light:text-[#8a8a8a]",
                    )}
                  >
                    /{match.slug}
                  </span>
                </span>
                {desc && (
                  <span className="truncate text-[11.5px] leading-4 dark:text-[#808080] light:text-[#737373]">
                    {desc}
                  </span>
                )}
              </span>
              {/* enter hint on active row */}
              <span
                className={cn(
                  "mt-1 shrink-0 transition-opacity duration-100",
                  active ? "opacity-100" : "opacity-0",
                )}
              >
                <CornerDownLeftIcon className="size-3 dark:text-[#606060] light:text-[#a3a3a3]" />
              </span>
            </button>
          );
        })}
      </div>

      {/* footer — keyboard legend */}
      <div className="flex items-center gap-3 border-t px-3.5 py-2 dark:border-white/[0.07] light:border-black/[0.06]">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] dark:text-[#525252] light:text-[#a3a3a3]">
          ↑↓ navigate
        </span>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] dark:text-[#525252] light:text-[#a3a3a3]">
          ↵ select
        </span>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] dark:text-[#525252] light:text-[#a3a3a3]">
          esc dismiss
        </span>
      </div>
    </div>
  );
}
