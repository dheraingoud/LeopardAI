"use client";

import { CornerDownLeftIcon, SlashIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { field, floating, mono } from "./leopard/surfaces";
import { skillSlug, type SkillConfig } from "@/lib/skill-config";

/**
 * Slash-command menu — Leopard's port of the assistant-ui composer command
 * menu (ComposerMenu / ComposerCommandItem shape, 2026-10-09): a floating card
 * above the composer, one row per `/command` (icon + /name + blurb + ↵ on the
 * active row), keyboard-driven. No header/legend — the aui look is quieter.
 * The parent owns input/open/activeIndex/keyboard handling; selecting a row
 * places `/<slug> ` in the textarea (parsed server-side by getInvokedSkillBodies).
 */

export interface SlashMatch {
  skill: SkillConfig;
  slug: string;
}

/** Enabled skills whose slug (or display name) starts with the slash query.
 *  Empty query yields every enabled skill. */
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

/** Render `text` with the leading `query` match highlighted (amber, like the
 *  active row's slash icon). Case-insensitive prefix match; falls back to a
 *  substring match so "/diag" still lights up "diagram" mid-word. */
function HighlightedSlug({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const at = lower.startsWith(q) ? 0 : lower.indexOf(q);
  if (at < 0) return <>{text}</>;
  const end = at + q.length;
  return (
    <>
      {text.slice(0, at)}
      <span className="dark:text-[#ffb400] light:text-[#d49600]">
        {text.slice(at, end)}
      </span>
      {text.slice(end)}
    </>
  );
}

export function SlashMenu({
  matches,
  activeIndex,
  onSelect,
  query = "",
}: {
  matches: readonly SlashMatch[];
  activeIndex: number;
  onSelect: (match: SlashMatch) => void;
  query?: string;
}) {
  return (
    <div
      data-slot="slash-menu"
      role="listbox"
      aria-label="Commands"
      className={cn(
        floating,
        "absolute bottom-full start-0 z-30 mb-2 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-0.5 rounded-2xl p-1.5",
        "origin-bottom-left transition-[opacity,scale] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
      )}
    >
      {matches.length === 0 && (
        <div className="px-3.5 py-5 text-center text-[12.5px] text-foreground/45">
          No matching commands
        </div>
      )}
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
              "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13.5px] transition-colors",
              active ? field : "hover:bg-foreground/[0.04]",
            )}
          >
            <SlashIcon
              className={cn(
                "size-3.5 shrink-0",
                active
                  ? "dark:text-[#ffb400] light:text-[#d49600]"
                  : "text-foreground/35",
              )}
            />
            <span className="font-medium">
              <HighlightedSlug text={`/${match.slug}`} query={query} />
            </span>
            {desc && (
              <span className="text-foreground/45 flex-1 truncate text-start text-xs">
                {desc}
              </span>
            )}
            {active && (
              <kbd
                className={cn(
                  mono,
                  "shrink-0 rounded bg-foreground/[0.06] px-1 text-[10px] text-foreground/45",
                )}
              >
                ↵
              </kbd>
            )}
          </button>
        );
      })}
    </div>
  );
}
