/* Mechanical fork: assistant-ui kit elements → components/chat/leopard/.
 * Transforms: header comment, import remaps (cn/utils, collapsible, surfaces,
 * range), blue→amber class remap. Files needing runtime shims are reported. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SRC = "C:/Users/HP/OneDrive/Desktop/leopard/addons/assistant-ui/packages/ui/src/components/elements";
const DST = "C:/Users/HP/OneDrive/Desktop/leopard/next-frontend/components/chat/leopard";

const FILES = [
  "activity-graph","agent-card","agent-handoff","agent-plan","agent-status",
  "background-inbox","checkpoint-history","command-palette","comparison-card",
  "confidence-marker","connection-state","context-breakdown","conversation-search",
  "cost-meter","data-table","day-separator","diagram","document-reference",
  "draft-restore","edit-message","empty-state",
  "feedback-dialog","file-tree","flow-graph","guardrail-notice",
  "image-generation","inline-citation","job-progress",
  "loading-state","map-answer","math-block","mcp-server-panel","memory-chips",
  "message-branches","message-pair","message-queue","message-timing",
  "onboarding",
  "permission-grant","quota-banner","quote-reply",
  "read-aloud","reasoning-effort","recommendation-card","regenerate-menu",
  "research-report","retrieval-chunks","reviewable-diff","schedule-card",
  "score-breakdown","scroll-anchor","settings-panel","shared-conversation",
  "speaker-identity","timeline","todo-list","trace-waterfall",
  "voice-conversation","chart","code-diff",
  "composer","computer-use",
];

const AMBER_BG = "dark:bg-[#ffb400] light:bg-[#d49600]";
const AMBER_TEXT = "dark:text-[#ffb400] light:text-[#d49600]";

function fork(name: string): { wrote: boolean; notes: string[] } {
  const srcPath = join(SRC, `${name}.tsx`);
  const dstPath = join(DST, `${name}.tsx`);
  if (!existsSync(srcPath)) return { wrote: false, notes: ["missing source"] };
  if (existsSync(dstPath)) return { wrote: false, notes: ["already forked"] };
  let s = readFileSync(srcPath, "utf8");
  const notes: string[] = [];

  // Import remaps
  s = s.replace(/from "@\/lib\/utils"/g, 'from "@/lib/utils"');
  s = s.replace(/from "\.\/surfaces"/g, 'from "./surfaces"');
  s = s.replace(/from "\.\/range"/g, 'from "./range"');
  s = s.replace(
    /from "@\/components\/ui\/collapsible"/g,
    'from "@/components/ui/collapsible"',
  );
  if (/@assistant-ui\/react/.test(s)) {
    notes.push("NEEDS SHIM: @assistant-ui/react import");
  }

  // Blue → amber (leopard hue). Order matters: longest first.
  s = s
    .replace(/text-blue-500 dark:text-blue-400/g, AMBER_TEXT)
    .replace(/text-blue-400 dark:text-blue-300/g, AMBER_TEXT)
    .replace(/bg-blue-500 dark:bg-blue-400/g, AMBER_BG)
    .replace(/bg-blue-500(?!\/)/g, "dark:bg-[#ffb400] light:bg-[#d49600]")
    .replace(/bg-blue-400(?!\/)/g, "dark:bg-[#ffb400] light:bg-[#d49600]")
    .replace(/text-blue-500(?!\/)/g, "dark:text-[#ffb400] light:text-[#d49600]")
    .replace(/text-blue-400(?!\/)/g, "dark:text-[#ffb400] light:text-[#d49600]")
    .replace(/text-blue-600(?!\/)/g, "dark:text-[#ffb400] light:text-[#d49600]")
    .replace(/border-blue-500(?!\/)/g, "dark:border-[#ffb400] light:border-[#d49600]")
    .replace(/ring-blue-500(?!\/)/g, "dark:ring-[#ffb400] light:ring-[#d49600]")
    .replace(/fill-blue-500(?!\/)/g, "dark:fill-[#ffb400] light:fill-[#d49600]")
    .replace(/stroke-blue-500(?!\/)/g, "dark:stroke-[#ffb400] light:stroke-[#d49600]")
    // blue-with-opacity → amber-with-opacity (same alpha)
    .replace(/\b(text|bg|border|ring|fill|stroke)-blue-(\d{3})\//g, (_, p, n) =>
      `${p}-[#ffb400]/`,
    );

  const header = `// Leopard fork of assistant-ui ${name} — originals in addons/ are reference-only.\n`;
  writeFileSync(dstPath, header + s, "utf8");
  return { wrote: true, notes };
}

const shims: string[] = [];
let count = 0;
for (const f of FILES) {
  const { wrote, notes } = fork(f);
  if (wrote) count++;
  if (notes.length) shims.push(`${f}: ${notes.join(", ")}`);
}
console.log(JSON.stringify({ wrote: count, shims }, null, 2));
