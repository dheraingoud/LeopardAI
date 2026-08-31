# Chat Overhaul — Bug/UX Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every observed chat defect (tool termination, dead chats, rendering leaks, visual regressions) and lock the UI down with a repeatable dark-mode visual sweep.

**Architecture:** Next.js App Router chat on AI SDK v7 (`ai` package) + Convex persistence; leopard fork components under `components/chat/leopard/`; probes in `scripts/dbg-*.ts` (tsx + Playwright against http://localhost:3001).

**Tech Stack:** Next.js (custom, see AGENTS.md), AI SDK v7, Tailwind v4, Convex, Playwright.

**Spec:** User bug reports 2026-08-31/09-01 (screenshots in session transcript); DESIGN.md at repo root (`C:\Users\HP\OneDrive\Desktop\leopard\DESIGN.md`).

## Global Constraints

- DESIGN.md law: Geist for all sans text (weight ceiling 600), Geist Mono for code/technical labels (weight 400). Amber `#ffb400` dark / `#d49600` light.
- NEVER git push. Commit locally in next-frontend with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`, then parent-repo `chore: bump` commit.
- Port 3000 is MAYA — never touch. Dev server on 3001 (log /tmp/leopard-3001.log).
- Probes: `npx tsx scripts/dbg-*.ts` from next-frontend. Playwright screenshots to `shots/`.
- No dead code: deleting usage means deleting the component file + fork-kit entry.
- Never show subagent/utility model names anywhere in UI.
- `npx tsc --noEmit` must pass after every task.

## Root Causes (verified 2026-08-31/09-01)

- **RC-SEARCH:** `html.duckduckgo.com/html/` POST returns HTTP 202 (bot wall) → 0 parsed results → every webSearch "fails". `lite.duckduckgo.com/lite/?q=` GET returns real results (markup: `<a rel="nofollow" href="//duckduckgo.com/l/?uddg=<enc>" class='result-link'>title</a>`; snippets in `td.result-snippet`).
- **RC-STEPCAP:** `app/api/chat/route.ts:825` `stopWhen: stepCountIs(3)` — 3 tool steps (even failures) end the turn with no synthesis text → "auto-terminates".
- **RC-STOPICON:** `composer.tsx:118` SquareIcon `dark:text-[#ffb400]` on amber `inkButton` bg → invisible in dark mode.
- **RC-GROUP:** `message.tsx:955-971` merges consecutive tool segs into one collapsed "N× webSearch" pill → hides per-call rows (user: trash).
- **RC-DSL:** master model (nemotron/kimi) sometimes emits Hermes `<tool_call>` DSL or mangled JSON for `spawn_agents` → `AI_TypeValidationError` (stream error) and/or raw JSON dumped as a text code block (image 3).
- **RC-EDIT:** `saveEdit` (message.tsx:1035) only refills the composer via `composer:set-text`; user must press Enter — expected: auto-resend.
- **RC-CHIP:** `chat-shell.tsx` GeneratingChip (top-right "generating" pill) — user wants it gone.
- **RC-MODELCHIP:** AgentRunCard footer chip prints `subagents run on <model>` — forbidden.
- **RC-FLOW:** FlowGraph mounted with `visibleCount` < total → pending agent nodes hidden → master node + dangling edges in an empty box (ugly).
- **RC-BEAM:** composer-beam (orbiting amber ring, added 6d9bccb) — revert to plain paper + focus ring.
- **RC-DEADCHAT:** after a failed/terminated turn, later sends do nothing. Suspects: status stuck, broken trailing parts confusing approval-resume, or server detached stream blocking the next POST. Needs live repro (Task 11).
- **RC-SCROLL:** auto-scroll effect only depends on `[messages, status]`; height growth that doesn't touch messages (reasoning expand, images, markdown layout) un-pins the view.
- **RC-SPACE:** "Working on it…" indicator + cards have no breathing room; transcript bottom spacer `h-32` too small while streaming → cards clipped under composer.

---

### Task 1: Web search backend → DDG lite GET + raise step cap

**Files:**
- Modify: `lib/ai/tools/web-search.ts`
- Modify: `app/api/chat/route.ts:825`
- Test: `scripts/dbg-ddg.ts` (exists)

**Interfaces:**
- Produces: `searchWeb()` unchanged signature; must return ≥3 results for "spiking neural network ecg".

- [ ] **Step 1: Switch endpoint + parser**

In `web-search.ts`:
- `const DDG_ENDPOINT = "https://lite.duckduckgo.com/lite/";`
- Fetch with **GET** `?q=<encoded>` (drop POST + form body; keep UA header + timeout).
- `parseResults`: match both quote styles and href-before-class order:
  `/<a[^>]*href="([^"]+)"[^>]*class='result-link'[^>]*>([\s\S]*?)<\/a>/g`
  URL comes as `//duckduckgo.com/l/?uddg=<enc>&rut=…` — keep existing uddg decode; prepend nothing (uddg gives absolute URL).
- `parseSnippets`: `/<td[^>]*class='result-snippet'[^>]*>([\s\S]*?)<\/td>/g`.
- 0 parsed results on HTTP 200 → return `{ error: "search_empty", detail: "parser found no results" }` (distinguishes bot-wall from empty query intent).

- [ ] **Step 2: Raise step cap**

`route.ts:825`: `stopWhen: stepCountIs(8),` with comment: search→fetch bursts + retries must not eat the synthesis step.

- [ ] **Step 3: Verify**

Run: `npx tsx scripts/dbg-ddg.ts` — expect ≥3 results per query. `npx tsc --noEmit` clean.

- [ ] **Step 4: Commit**

`fix(chat): web search via DDG lite GET (html POST bot-walled) + stepCountIs 3→8`

---

### Task 2: Stop button icon visible

**Files:** Modify `components/chat/leopard/composer.tsx:118`

- [ ] **Step 1:** `<SquareIcon className="size-3 fill-current text-black" />` (amber bg both themes → black glyph).
- [ ] **Step 2:** `npx tsc --noEmit`.
- [ ] **Step 3:** Commit `fix(chat): visible stop glyph on amber send button`.

---

### Task 3: Revert composer beam

**Files:**
- Modify: `components/chat/leopard/composer.tsx` (ComposerBar `beam` prop + `beam={placement === "center"}` call)
- Modify: `app/globals.css` (`.composer-beam` block ~lines 1790-1860, `@property --beam-angle`, `@keyframes beam-orbit`, reduced-motion block)

- [ ] **Step 1:** Remove `beam` prop + class application; call site back to `<ComposerBar>`.
- [ ] **Step 2:** Delete all `composer-beam` / `--beam-angle` / `beam-orbit` CSS.
- [ ] **Step 3:** Verify: `npx tsc --noEmit`; probe screenshot of `/` empty state shows plain paper composer with focus ring only.
- [ ] **Step 4:** Commit `revert(chat): composer beam → plain paper shell`.

---

### Task 4: Thinking indicator — shimmer label, no dot, Geist

**Files:**
- Modify: `components/chat/leopard/thinking-indicator.tsx`
- Modify: reasoning header row in `components/chat/message.tsx` ("Thought for Ns" label)

- [ ] **Step 1:** Delete the pulsing dot span. Label: `font-sans text-[13px] font-medium tracking-[-0.01em]` keeping `ShimmerLabel` (this is the "glimmering thinking"). Elapsed stays mono.
- [ ] **Step 2:** "Thought for Ns" header: Geist 13px medium (`font-sans`), `HIGH`/effort chip stays Geist Mono 10-11px uppercase.
- [ ] **Step 3:** tsc + screenshot reasoning row (dark).
- [ ] **Step 4:** Commit `feat(chat): shimmering Geist thinking label, dot removed`.

---

### Task 5: Kill tool-group pill — per-call rows

**Files:**
- Modify: `components/chat/message.tsx` (remove grouping pass 955-971, `ToolGroupSeg`, `toolTarget`, imports of ToolGroup/ToolTimeline, and `grouped` map at 571)
- Delete: `components/chat/leopard/tool-group.tsx`, `components/chat/leopard/tool-timeline.tsx` (after grep confirms no other importers)

- [ ] **Step 1:** Remove grouping loop; `segments` = `out` directly.
- [ ] **Step 2:** Delete `ToolGroupSeg` + helpers; remove imports; delete component files after `grep -rn "tool-group\|tool-timeline\|ToolGroup\|ToolTimeline" components/ app/ hooks/` shows only message.tsx.
- [ ] **Step 3:** tsc + probe: send a 2-search prompt, screenshot shows separate rows per call (interleaved with reasoning).
- [ ] **Step 4:** Commit `fix(chat): drop tool-call grouping — per-call rows always`.

---

### Task 6: Tool-DSL leak repair (server) + text sanitizer + spawn_agents dedupe (client)

**Files:**
- Create: `lib/ai/repair-tool-call.ts`
- Modify: `app/api/chat/route.ts` (streamText options)
- Modify: `components/chat/message.tsx` (text sanitize + spawn_agents dedupe)

**Interfaces:**
- Produces: `export const repairToolCall: ToolCallRepairFunction<any>` used as `repairToolCall` in streamText.

- [ ] **Step 1: repair function**

```ts
import type { ToolCallRepairFunction } from "ai";

// Salvage spawn_agents args when the master emits Hermes DSL or mangled JSON:
// pull name/kind/task triples out with regex; null → SDK surfaces the error.
export const repairToolCall: ToolCallRepairFunction<any> = async ({ toolCall }) => {
  if (toolCall.toolName !== "spawn_agents") return null;
  const raw = typeof toolCall.input === "string" ? toolCall.input : JSON.stringify(toolCall.input ?? "");
  const tasks: { name: string; kind: string; task: string }[] = [];
  const re = /"?(?:name)"?\s*:\s*"([^"]+)"[\s\S]{0,400}?"?(?:task)"?\s*:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) tasks.push({ name: m[1], kind: "general", task: m[2] });
  if (tasks.length === 0) return null;
  return { ...toolCall, input: JSON.stringify({ tasks }) };
};
```

Route: add `repairToolCall,` next to `tools`/`stopWhen` inside the `supportsTools` spread (must apply even when approval off).

- [ ] **Step 2: client sanitizer** — in `message.tsx` where text segments are built, strip DSL from rendered text:

```ts
const stripToolDsl = (t: string) =>
  t.replace(/<tool_call>[\s\S]*?(?:<\/tool_call>|$)/g, "").trim();
```
Apply to text parts. Also: if a text part parses as JSON with a `tasks` array AND the message already has a spawn_agents tool seg → drop that text part.

- [ ] **Step 3: dedupe** — in the segments builder, if multiple `spawn_agents` tool segs exist, keep the LAST one only.

- [ ] **Step 4:** tsc + `npx tsx scripts/dbg-orchestrate.ts` — single card, no JSON block.
- [ ] **Step 5:** Commit `fix(chat): repair mangled spawn_agents calls + scrub DSL/JSON from text + dedupe card`.

---

### Task 7: AgentRunCard — kill model chip, fix flow graph

**Files:** Modify `components/chat/leopard/agent-run-card.tsx`

- [ ] **Step 1:** Delete footer model chip span + `UTILITY_MODEL` import. Keep coverage %.
- [ ] **Step 2:** `flowOf`: `visible = nodes.length` (all nodes always rendered; pending ones are dimmed by the component already). Remove the visible-filter const.
- [ ] **Step 3:** tsc + orchestrate probe screenshot expanded: master + N agent nodes all visible, edges fine.
- [ ] **Step 4:** Commit `fix(chat): agent card drops model chip; flow graph shows all nodes`.

---

### Task 8: Remove GeneratingChip

**Files:** Modify `components/chat/chat-shell.tsx`

- [ ] **Step 1:** Delete both `{generating && <GeneratingChip />}`, the `GeneratingChip` fn, and the `generating` const if unused after.
- [ ] **Step 2:** tsc. **Step 3:** Commit `fix(chat): remove top-right generating chip`.

---

### Task 9: Auto-scroll that survives layout growth

**Files:** Modify `components/chat/messages.tsx`

- [ ] **Step 1:** Wrap the transcript column (`<div className="max-w-3xl mx-auto py-6">`) in a ref; attach `ResizeObserver`: on any size change, if `stickToBottomRef.current` → `scrollRef.current.scrollTop = scrollHeight`. Keep the existing messages-effect as well.
- [ ] **Step 2:** Disconnect observer on unmount.
- [ ] **Step 3:** Verify: probe streams a long answer with reasoning; assert `scrollHeight - scrollTop - clientHeight < 4` at end without any manual scroll.
- [ ] **Step 4:** Commit `fix(chat): ResizeObserver auto-scroll pinned to bottom`.

---

### Task 10: Edit → auto-resend

**Files:**
- Modify: `hooks/use-active-chat.tsx` (add `editAndResend`)
- Modify: `components/chat/message.tsx` (`saveEdit` uses it)

**Interfaces:**
- Produces: `editAndResend(messageId: string, text: string): void` on the active-chat context (add to `ActiveChatContextValue` type + value object).

- [ ] **Step 1:** In `use-active-chat.tsx`:

```ts
const editAndResend = useCallback((messageId: string, text: string) => {
  editMessage(messageId); // stops stream, deletes server rows, truncates state
  // status can lag a tick after stopGeneration — retry until the gate opens.
  let tries = 0;
  const attempt = () => {
    const s = chat.status;
    if (s === "streaming" || s === "submitted") {
      if (++tries < 50) setTimeout(attempt, 100);
      return;
    }
    sendMessage({ text });
  };
  setTimeout(attempt, 0);
}, [editMessage, sendMessage, chat.status]);
```
(If `sendMessage` wrapper takes a different shape, match it — see line ~540.)

- [ ] **Step 2:** `saveEdit` → `chat.editAndResend(message.id, trimmed)`; drop the `composer:set-text` dispatch + "press Enter" toast (toast: "Resending…").
- [ ] **Step 3:** Probe: send msg → edit it via UI → assert a NEW assistant response streams without pressing Enter.
- [ ] **Step 4:** Commit `feat(chat): edit-and-resend fires automatically`.

---

### Task 11: Dead-chat-after-failure — repro, root cause, fix

**Files:**
- Create: `scripts/dbg-fail-recover.ts`
- Modify: wherever the evidence points (`hooks/use-active-chat.tsx` / `app/api/chat/route.ts` / approval-resume path)

- [ ] **Step 1: Repro probe.** Script: new chat → send prompt that forces tool failure (webSearch while `ENABLE_WEB_SEARCH` on but network blocked via `page.route` aborting `lite.duckduckgo.com`) → wait for termination → capture `data-slot` states, `chat status` (expose via `window.__leopardChatStatus` if needed), console errors → send follow-up "ping" → assert whether a response streams. Print a verdict JSON.
- [ ] **Step 2: Root cause from evidence.** Candidates in order: (a) status stuck `streaming`/`submitted` (send guard at use-active-chat.tsx:551 silently drops) — fix: on terminal error/termination force SDK status back via `chat.stop()`-equivalent or clear the guard; (b) server detached generation still holds the chat's stream lock — next POST must abort the stale generation first; (c) persisted errored tool parts poison the next turn's seed — strip errored/pending tool parts when seeding.
- [ ] **Step 3: Fix + re-probe** until follow-up sends work after any failure.
- [ ] **Step 4:** Also cover the approval-flash case: approval card visible <1s then terminate = same termination path; ensure pending approval rows for the chat are resolved/deleted on failure.
- [ ] **Step 5:** Commit `fix(chat): chat stays usable after failed/terminated turns`.

---

### Task 12: Spacing pass (indicator, cards, composer clearance)

**Files:** Modify `components/chat/message.tsx`, `components/chat/messages.tsx`, maybe `components/chat/leopard/message-pair.tsx`

- [ ] **Step 1:** "Working on it…" / ThinkingIndicator rows get `mt-2 mb-2`; gap between indicator and following card ≥ 8px.
- [ ] **Step 2:** Bottom spacer `h-32` → `h-44` while `status === "streaming" || "submitted"` (cards must clear the floating composer).
- [ ] **Step 3:** After-failure crowding: ensure ErrorState/StoppedRun rows have `my-3` and the next turn's first block has top margin ≥ 12px.
- [ ] **Step 4:** Probe screenshots before/after (dark) — measure pixels, no card under composer.
- [ ] **Step 5:** Commit `fix(chat): spacing around thinking rows, cards, composer clearance`.

---

### Task 13: Graceful error UX

**Files:** Modify `components/chat/messages.tsx` (auto-retry policy), `components/chat/leopard/error-state.tsx` (copy), `components/chat/leopard/stopped-run.tsx` (copy)

- [ ] **Step 1:** Auto-retry once (exists) → on second failure show ErrorState with copy: title "That didn't go through", detail naming the failing stage when known (search/fetch/model), working Retry button (uses regenerate).
- [ ] **Step 2:** Stopped-run copy: "Stopped before anything landed" + Continue / Discard (exists — verify buttons work after Task 11 fix).
- [ ] **Step 3:** Tool failure rows: failed ToolCard shows `Retry` only if cheap (dispatch regenerate of the turn); otherwise omit — no fake affordances.
- [ ] **Step 4:** Probe: force failure → screenshot error card → click retry → response lands.
- [ ] **Step 5:** Commit `feat(chat): honest error states with working retry`.

---

### Task 14: Subagent reliability

**Files:** Modify `lib/ai/agents/orchestrator.ts` (per-agent timeout + partial completion), maybe `lib/ai/tools/agents.ts`

- [ ] **Step 1:** Wrap each agent's `generateText` in a 120s timeout; on timeout/error mark that agent `error` with note, continue others; card must always reach a settled state (never stuck `running · 0/3`).
- [ ] **Step 2:** Verify with `npx tsx scripts/dbg-orchestrate.ts` (default model = nemotron-lightning): running → settled 3/3 or partial-with-errors, reload persists.
- [ ] **Step 3:** If user-selected model (e.g. kimi-k3) hangs the master before spawn, confirm the route's fallback chain engages; if not, log + fall back after the stall watchdog.
- [ ] **Step 4:** Commit `fix(chat): subagents always settle (per-agent timeout, partial results)`.

---

### Task 15: Dark-mode visual sweep (repeatable)

**Files:** Create `scripts/dbg-visual-sweep.ts`

- [ ] **Step 1:** Probe captures: `/` empty state (focused + unfocused composer), streaming mid-token, reasoning row, web-search rows, subagent card collapsed/expanded, error state, after-edit resend, sidebar open, model selector open. Dark mode only. Screenshots to `shots/sweep/`.
- [ ] **Step 2:** I review every screenshot; any visual defect → fix → re-run sweep until clean.
- [ ] **Step 3:** Commit `test(chat): dark visual sweep probe + fixes`.

---

### Task 16: Final gate

- [ ] `npx tsc --noEmit` clean; all probes green; parent `chore: bump` commit; report with screenshot list.
