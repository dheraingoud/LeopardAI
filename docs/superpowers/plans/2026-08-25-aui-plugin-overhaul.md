# assistant-ui Plug-In Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace leopard's chat chrome (thinking blocks, reasoning panels, tool cards, approval cards, message actions, suggestions, error surfaces) with the assistant-ui `elements/` kit, forked into leopard's amber/liquid-glass theme, and fix the approval server-resume path so Allow/Deny actually works.

**Architecture:** assistant-ui is a shadcn-style copy-in kit — we copy the element `.tsx` files into `next-frontend/components/chat/aui/` (never import from `addons/`), keep their originals as reference only, and re-theme the whole kit through ONE forked `surfaces.tsx` (paper→glass, inkButton→amber, blue→amber). StreamItDown stays the sole prose/math/mermaid pipeline. The approval fix is a new request shape in `/api/chat`: an `addToolApprovalResponse` follow-up arrives with the last message being the *assistant* message carrying an `approval-responded` tool part; the route detects this, skips user-message persistence, reuses the assistant row id, and launches a fresh `backgroundServe` pass whose `convertToModelMessages` now includes the granted tool call.

**Tech Stack:** Next.js 16 (App Router), AI SDK v7 (`@ai-sdk/react`, `streamText`, `backgroundServe` detached generation), Convex cloud (expert-vulture-839), Tailwind v4 (`@custom-variant dark/light` in `app/globals.css`, `tw-animate-css` already installed), Radix Collapsible (new dep), lucide-react, framer-motion.

**Spec:** conversation + audit output (31-agent workflow `wf_5393c071-bdf`, summarized in chat). User decisions: keep StreamItDown; fix approval resume + ApprovalCard now; apple-design audit AFTER the swap; skip dead-data components (CodeRunner, TerminalBlock, MemoryChips, ReasoningEffort budget bar, message-branches, QuoteReply, artifact-card).

## Global Constraints

- NEVER git push. Commit locally in `next-frontend` (message ends with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`), then a separate `chore: bump next-frontend` commit in the parent leopard repo for the submodule pointer.
- Port 3000 is MAYA — never kill/rebuild it. Dev server for this work: port 3001.
- Verify with `npx tsc --noEmit` (from `next-frontend/`) after every task; `next build` at the end of each wave; browser checks use snapshot/DOM/console, never screenshots.
- Env-gated fail-closed defaults; NIM has no prompt caching — do not add always-on system-prompt/tool-schema lines.
- Anti-slop rules (from audit, binding on every task): (1) staggered entrance ONLY on Suggestions/ToolTimeline first mount — strip `animate-in` from rows appearing mid-stream; (2) ONE shimmer at a time — only the currently-active element shimmers; (3) transcript-inline aui components get `className="max-w-none"` to override their `max-w-sm` (leopard transcript column is `max-w-3xl`); (4) amber = live/active/send only; status stays emerald/red; (5) all prose/math/mermaid renders through StreamItDown — aui components own chrome only.
- `cn` exists at `@/lib/utils` in leopard and uses tailwind-merge — aui's `@/lib/utils` imports resolve unchanged.
- `tw-animate-css@^1.4.0` is already a leopard dependency (provides `animate-in fade-in slide-in-from-bottom-1 fill-mode-both zoom-in-90`).

---

### Task 1: Scaffold — copy kit, radix collapsible, shimmer CSS, forked surfaces

**Files:**
- Create: `next-frontend/components/chat/aui/` directory; copy from `addons/assistant-ui/packages/ui/src/components/elements/` these files VERBATIM (then adjust imports/accents per steps below): `range.ts`, `approval-card.tsx`, `tool-call.tsx`, `tool-group.tsx`, `tool-timeline.tsx`, `tool-error.tsx`, `reasoning-panel.tsx`, `thinking-indicator.tsx`, `streaming-text.tsx`, `error-state.tsx`, `suggestions.tsx`, `web-search.tsx`, `sources.tsx`, `message-actions.tsx`, `message-attachment.tsx`
- Create: `next-frontend/components/chat/aui/surfaces.tsx` (forked, NOT copied — full content below)
- Create: `next-frontend/components/ui/collapsible.tsx`
- Modify: `next-frontend/package.json` (add `@radix-ui/react-collapsible`)
- Modify: `next-frontend/app/globals.css` (port shimmer utility)

**Interfaces:**
- Produces: `components/chat/aui/surfaces.tsx` exporting `paper, floating, field, fieldInteractive, pressable, ghostButton, inkButton, iconSwap, iconSwapIn, iconSwapOut, labelSwap, labelSwapIn, labelSwapOut, collapsePanel, live, mono, codeScroll, codeSurface, ShimmerLabel, SwapLabel` — identical names to aui's so copied files import unchanged from `./surfaces`.
- Produces: `components/ui/collapsible.tsx` exporting `Collapsible, CollapsibleTrigger, CollapsibleContent` (Radix re-export, shadcn-canonical).

- [ ] **Step 1: Add radix dep + collapsible wrapper**

```bash
cd next-frontend && npm install @radix-ui/react-collapsible
```

`components/ui/collapsible.tsx`:
```tsx
"use client";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
const Collapsible = CollapsiblePrimitive.Root;
const CollapsibleTrigger = CollapsiblePrimitive.Trigger;
const CollapsibleContent = CollapsiblePrimitive.Content;
export { Collapsible, CollapsibleTrigger, CollapsibleContent };
```

- [ ] **Step 2: Copy the 15 element files**

```bash
cd "C:/Users/HP/OneDrive/Desktop/leopard"
SRC=addons/assistant-ui/packages/ui/src/components/elements
DST=next-frontend/components/chat/aui
mkdir -p $DST
for f in range.ts approval-card.tsx tool-call.tsx tool-group.tsx tool-timeline.tsx tool-error.tsx reasoning-panel.tsx thinking-indicator.tsx streaming-text.tsx error-state.tsx suggestions.tsx web-search.tsx sources.tsx message-actions.tsx message-attachment.tsx; do cp "$SRC/$f" "$DST/$f"; done
```

- [ ] **Step 3: Port shimmer utility into `app/globals.css`**

Copy VERBATIM from `addons/assistant-ui/packages/tw-shimmer/src/index.css`: the two `@property` blocks, the `@theme inline { @keyframes tw-shimmer }` block, and the `@utility shimmer` block ONLY (skip `shimmer-bg`, `shimmer-speed-*`, `shimmer-duration-*`, `shimmer-repeat-delay-*`, `shimmer-invert`, `shimmer-color-*`, `shimmer-spread-*`, `shimmer-angle-*`, `shimmer-container` — unused by the copied set). Append at the end of globals.css.

- [ ] **Step 4: Write forked `components/chat/aui/surfaces.tsx`**

Same exports/logic as aui's (ShimmerLabel + SwapLabel components copied verbatim from `addons/.../elements/surfaces.tsx`), with these recipe replacements:

```ts
// Glass card — leopard liquid-glass diagonal wash + hairline + inset top highlight.
export const paper =
  "border dark:border-white/[0.08] light:border-black/[0.08] " +
  "dark:bg-[linear-gradient(160deg,rgba(255,255,255,0.045)_0%,rgba(255,255,255,0.02)_100%)] " +
  "light:bg-[linear-gradient(160deg,rgba(255,255,255,0.85)_0%,rgba(246,243,235,0.75)_100%)] " +
  "dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] light:shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] " +
  "backdrop-blur-md";
export const floating = paper;
export const field = "dark:bg-white/[0.04] light:bg-black/[0.035]";
export const fieldInteractive =
  "dark:bg-white/[0.04] light:bg-black/[0.035] transition-colors hover:dark:bg-white/[0.07] hover:light:bg-black/[0.055]";
// pressable, iconSwap*, labelSwap*, collapsePanel, codeScroll, codeSurface: copy verbatim from aui.
export const ghostButton =
  "flex items-center justify-center rounded-full dark:text-[#737373] light:text-[#8a8a8a] outline-none transition-[background-color,color,scale] duration-150 hover:dark:bg-white/[0.06] hover:light:bg-black/[0.05] hover:dark:text-white hover:light:text-black active:scale-[0.96] focus-visible:ring-1 focus-visible:ring-[#ffb400]/40 motion-reduce:transition-none";
// The ONE solid-amber action (Allow once / selected suggestion) — matches leopard's send-button tint.
export const inkButton =
  "bg-[#ffb400] light:bg-[#d49600] text-black transition-[filter,scale] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:brightness-110 active:scale-[0.96] motion-reduce:transition-none";
// Live/active accent — blue→amber remap.
export const live = "dark:text-[#ffb400] light:text-[#d49600]";
export const mono = "font-mono text-[11px] tracking-tight";
```

- [ ] **Step 5: Remap inline blue accents in the copied files**

In `components/chat/aui/`, replace every occurrence (grep `blue-`):
- `bg-blue-500 dark:bg-blue-400` → `dark:bg-[#ffb400] light:bg-[#d49600]`
- `text-blue-500 dark:text-blue-400` → `dark:text-[#ffb400] light:text-[#d49600]`

Files with inline blue: `reasoning-panel.tsx` (active dot), `thinking-indicator.tsx` (dot), `streaming-text.tsx` (fresh word + caret), `message-pair.tsx` — message-pair was NOT copied; skip. `sources.tsx`, `error-state.tsx`, `tool-error.tsx` keep emerald/red as-is.

- [ ] **Step 6: Verify**

Run: `cd next-frontend && npx tsc --noEmit`
Expected: PASS (files unused so far — no import errors; if `noUnusedLocals` complains about anything, it's only within copied files — fix by keeping exports, which are used via barrel-free direct import later).

- [ ] **Step 7: Commit**

```bash
cd next-frontend && git add -A && git commit -m "feat(chat): scaffold aui element kit (forked glass surfaces, shimmer, collapsible)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: ReasoningBlock → ReasoningPanel (forked body)

**Files:**
- Modify: `next-frontend/components/chat/aui/reasoning-panel.tsx` (fork: steps→single StreamItDown body)
- Modify: `next-frontend/components/chat/message.tsx:327-480` (delete `ReasoningBlock`), `:1170-1188` (swap render site)

**Interfaces:**
- Consumes: `StreamItDown` from `@/components/chat/streamitdown` (props `{content: string; streaming?: boolean}`); `ReasoningLevel` from `@/lib/nim`; existing `EFFORT_LABEL` map in message.tsx.
- Produces: forked `ReasoningPanel({content, streaming, elapsedMs?, effort?, open, onOpenChange, className?})`.

- [ ] **Step 1: Fork reasoning-panel.tsx**

Replace the `steps`/`visibleSteps` props with leopard's shape; keep Collapsible + SwapLabel + ShimmerLabel trigger verbatim. New props + body:

```tsx
export interface LeopardReasoningPanelProps {
  content: string;          // normalized reasoning text
  streaming: boolean;       // live reasoning tail
  open: boolean;
  onOpenChange: (open: boolean) => void;
  elapsedMs?: number;
  effortBadge?: string;     // e.g. "HIGH" — rendered as mono chip after the label
  className?: string;
}
```

Trigger: `<SwapLabel active={streaming ? 0 : 1}>` with layer 0 = `<ShimmerLabel active={streaming}>Thinking</ShimmerLabel>` + elapsed mono span; layer 1 = `Thought for {s}s` (or "Thought process" when no elapsed). Keep the ChevronDown rotate. Content: replace the `<ol>` with

```tsx
<div className="max-h-[420px] overflow-y-auto pt-2 pb-1 text-[13.5px] leading-[1.7] [&_.markdown-body]:text-[13.5px]">
  <StreamItDown content={content} streaming={streaming} />
</div>
```

Add `import { StreamItDown } from "@/components/chat/streamitdown";`. Remove `take`/`range` import (unused in fork).

- [ ] **Step 2: Swap the render site in message.tsx**

At message.tsx:1170-1188, replace `<ReasoningBlock .../>` with:

```tsx
const live = isStreaming && isLast;
return (
  <ReasoningPanel
    key={`r-${i}`}
    className="max-w-none"
    content={compactWhitespace(seg.content)}
    streaming={live}
    open={reasoningOpen[i] ?? live}
    onOpenChange={(o) => setReasoningOpen((m) => ({ ...m, [i]: o }))}
    elapsedMs={reasoningMs}
    effortBadge={!live && currentReasoning && currentReasoning !== "off" ? EFFORT_LABEL[currentReasoning] : undefined}
  />
);
```

Add to PreviewMessage: `const [reasoningOpen, setReasoningOpen] = useState<Record<number, boolean>>({});` — this preserves the stale-card fix semantics (derived default = live; explicit click overrides; completed cards default collapsed) without the old `manualToggle ?? live` per-component state.

Delete the `ReasoningBlock` function (message.tsx:327-480) and now-unused imports (`Brain`, `EFFORT_LABEL` stays if used by badge, `compactWhitespace` stays).

- [ ] **Step 3: Verify**

`npx tsc --noEmit` PASS. Then `NODE_OPTIONS=--max-old-space-size=8192 npx next dev --webpack -p 3001` (background), browser snapshot: send a thinking-model prompt (kimi-k3 effort high), confirm: shimmer "Thinking" while live → "Thought for Ns" collapsed after; expand shows markdown-rendered body; NO stale card from previous turn after a second send.

- [ ] **Step 4: Commit** `refactor(chat): replace ReasoningBlock with forked aui ReasoningPanel`

---

### Task 3: ThinkingMessage → ThinkingIndicator

**Files:**
- Modify: `next-frontend/components/chat/message.tsx:1293-1308`
- Modify: `next-frontend/components/chat/messages.tsx` (ThinkingMessage usage stays; component internals change)

**Interfaces:**
- Consumes: `ThinkingIndicator({label, elapsed?, className?})` from `./aui/thinking-indicator`.
- Produces: `ThinkingMessage` export unchanged (messages.tsx imports it).

- [ ] **Step 1: Rewrite ThinkingMessage body**

```tsx
export function ThinkingMessage() {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto">
      <div className="flex items-start gap-3 py-5">
        <ThinkingIndicator label="Working on it…" className="fade-in animate-in duration-300" />
      </div>
    </motion.div>
  );
}
```

Keep `PulseLoader` for the streaming-empty fallback at message.tsx:1166 (different affordance — the aui dot+shimmer is the pre-stream state; PulseLoader stays the in-message gap filler).

- [ ] **Step 2: Verify + Commit** — tsc PASS; browser: "Working on it…" shows amber pulsing dot + shimmer label (not three-dot pulse). Commit `refactor(chat): ThinkingMessage → aui ThinkingIndicator`.

---

### Task 4: ToolCard → ToolCall + WebSearch + Sources

**Files:**
- Modify: `next-frontend/components/chat/message.tsx:488-728` (delete `ToolCard` non-ask branch; KEEP `MeshGlobe` — unused after swap? No: MeshGlobe only used by ToolCard → delete both), `:1189-1210` (swap render site)

**Interfaces:**
- Consumes: `ToolCall({label, activeLabel, query, request, result, running, open, onOpenChange})` from `./aui/tool-call`; `WebSearch({query, results, visibleResults, searching, cycle})` from `./aui/web-search`; `Sources({sources, open, onOpenChange})` from `./aui/sources`.
- Tool segment shape (existing): `{kind:"tool", toolName, state, input, output, toolCallId?, approvalId?}` where state ∈ `"ask"|"streaming"|"pending"|"complete"` (ask handled in Task 7).

- [ ] **Step 1: Write the new tool renderer in message.tsx**

Replace the `seg.kind === "tool"` branch (and delete the `if (state === "ask")` early-return pattern — ask moves to Task 7's ApprovalCard):

```tsx
if (seg.kind === "tool") {
  const live = isStreaming && isLast && seg.state !== "complete";
  const running = live || seg.state === "pending" || seg.state === "streaming";
  if (seg.state === "ask") {
    return <ApprovalGate key={`t-${i}`} seg={seg} chat={chat} />; // Task 7
  }
  if (seg.toolName === "webSearch") {
    const q = (seg.input as { query?: string } | undefined)?.query ?? "";
    const res = (seg.output as { results?: Array<{ url?: string; title?: string }> } | undefined)?.results ?? [];
    const results = res.map((r) => ({
      title: r.title ?? r.url ?? "",
      domain: (r.url ?? "").replace(/^https?:\/\//, "").split("/")[0] ?? "",
    }));
    return (
      <WebSearch key={`t-${i}`} className="max-w-none" query={q}
        results={results} visibleResults={results.length}
        searching={running} cycle={0} />
    );
  }
  // webFetch / other tools → ToolCall
  const u = (seg.input as { url?: string } | undefined)?.url ?? "";
  const summary = typeof u === "string" ? u.replace(/^https?:\/\//, "") : "";
  const o = seg.output as { status?: number; bytes_read?: number; truncated?: boolean; error?: string } | undefined;
  const resultLine = o?.error ? String(o.error) : o ? `HTTP ${o.status} · ${o.bytes_read ?? 0} B${o.truncated ? " (truncated)" : ""}` : "";
  return (
    <ToolCall key={`t-${i}`} className="max-w-none"
      label={o?.error ? "Failed" : "Fetched"} activeLabel={`${seg.toolName}…`}
      query={summary} request={JSON.stringify(seg.input ?? {}, null, 0)}
      result={resultLine} running={running}
      open={toolOpen[i] ?? false}
      onOpenChange={(op) => setToolOpen((m) => ({ ...m, [i]: op }))} />
  );
}
```

Add `const [toolOpen, setToolOpen] = useState<Record<number, boolean>>({});` in PreviewMessage.

- [ ] **Step 2: Delete ToolCard + MeshGlobe** (message.tsx:488-756). Remove now-unused imports (`MeshGlobe`, `Check`/`Copy` if unused elsewhere — grep first; the copy-URL affordance dies with ToolCard).

- [ ] **Step 3: Sources under completed search answers**

After the segments map, when the message is complete and any tool seg was a webSearch with results, render ONE `<Sources sources={...} open={false} onOpenChange={...}>` collecting all results across that message's search calls. Local state `sourcesOpen`.

- [ ] **Step 4: Verify + Commit** — tsc PASS; browser: a real `webSearch` turn shows query pill → "Searching" shimmer → "Read N sources" + result rows with domain avatars; webFetch shows ToolCall with chevron, mono query chip, expandable Request/Result panel. Commit `refactor(chat): ToolCard → aui ToolCall/WebSearch/Sources`.

---

### Task 5: ToolGroup + ToolTimeline for multi-tool bursts

**Files:**
- Modify: `next-frontend/components/chat/message.tsx` (segments grouping pre-pass before render)

**Interfaces:**
- Consumes: `ToolGroup({label, tools: GroupedTool[], open, onOpenChange})`, `GroupedTool = {id, name, target, state: "running"|"done"|"failed", durationMs?}`; `ToolTimeline({steps, visibleSteps, streaming, open, onOpenChange, restingLabel, activeLabel, stats})` + `TimelineStep = {verb, chip, icon: LucideIcon}`.

- [ ] **Step 1: Group consecutive tool segments**

In the segments `useMemo` (message.tsx:~1023), after building `out`, add a grouping pass: maximal runs of ≥2 consecutive `kind:"tool"` segments (state != "ask") become `{kind:"toolGroup", tools: ToolSeg[]}`. Single tool segs and ask segs stay flat. Update the `Seg` union + `textSegCount` logic accordingly.

- [ ] **Step 2: Render toolGroup**

```tsx
if (seg.kind === "toolGroup") {
  const tools = seg.tools.map((t, j) => ({
    id: t.toolCallId ?? `t-${i}-${j}`,
    name: t.toolName,
    target: String((t.input as any)?.query ?? (t.input as any)?.url ?? "").slice(0, 60),
    state: (t.output as any)?.error ? "failed" : t.state === "complete" ? "done" : "running",
  }));
  return (
    <ToolGroup key={`g-${i}`} className="max-w-none" label="Tool activity"
      tools={tools} open={groupOpen[i] ?? tools.some((t) => t.state === "running")}
      onOpenChange={(o) => setGroupOpen((m) => ({ ...m, [i]: o }))} />
  );
}
```

- [ ] **Step 3: ToolTimeline for research_ bursts** — when a toolGroup's tools are ALL `research_*`, render `ToolTimeline` instead: `steps = tools.map(t => ({verb: t.name.replace(/^research_/, ""), chip: t.target, icon: SearchIcon}))`, `activeLabel="Researching"`, `restingLabel={`${tools.length} research steps`}`, `stats={[]}` (no diff data — do NOT fake it). Stagger classes already inside the copied file only fire on mount — acceptable per anti-slop rule 1.

- [ ] **Step 4: Verify + Commit** — tsc PASS; browser: a multi-search turn collapses into one "Tool activity 2/3" card; expanding shows per-tool rows with state icons. Commit `feat(chat): ToolGroup/ToolTimeline for multi-tool bursts`.

---

### Task 6: ToolError + chat-level ErrorState

**Files:**
- Modify: `next-frontend/components/chat/message.tsx` (tool seg error branch)
- Modify: `next-frontend/components/chat/messages.tsx` (chat error surface)

**Interfaces:**
- Consumes: `ToolError({name, target, message, attempt, maxAttempts, retrying, onRetry?, onSkip?})`; `ErrorState({title, detail, retrying, onRetry})`; `useActiveChat()` exposing `chat.error` and `chat.regenerate` (verify names in `hooks/use-active-chat.tsx` before writing).

- [ ] **Step 1: ToolError branch** — in the tool renderer (Task 4 code), when `!running && o?.error`, render `<ToolError className="max-w-none" name={seg.toolName} target={summary} message={String(o.error)} attempt={1} maxAttempts={1} retrying={false} onRetry={handleRegenerate} onSkip={undefined} />` INSTEAD of ToolCall.

- [ ] **Step 2: ErrorState in messages.tsx** — after the messages map + ThinkingMessage:

```tsx
{chat.error && chat.status !== "streaming" && chat.status !== "submitted" && (
  <ErrorState className="max-w-none" title="Response failed"
    detail={String(chat.error.message ?? chat.error)}
    retrying={retrying}
    onRetry={() => { setRetrying(true); void chat.regenerate?.(); }} />
)}
```

Local `retrying` state resets when status becomes streaming (useEffect).

- [ ] **Step 3: Verify + Commit** — tsc PASS; browser: force an error (stop the dev server's network or pick the flagged-down deepseek model) → red inline banner with Retry; retry spins then recovers. Commit `feat(chat): ToolError + chat ErrorState surfaces`.

---

### Task 7: ApprovalCard + server resume path (goal item #1 — the real fix)

**Files:**
- Create: `next-frontend/components/chat/approval-gate.tsx` (client card + local decided state)
- Modify: `next-frontend/components/chat/message.tsx:1189-1210` (render `<ApprovalGate>` for `state==="ask"`)
- Modify: `next-frontend/app/api/chat/route.ts` (approval-resume request detection + re-run; ~120-160 conversion area + ~400-560 persistence area + ~820 backgroundServe call)
- Modify: `next-frontend/lib/skill-config.ts`-adjacent: add `lib/tool-allowlist.ts` (localStorage always-allow store)
- Modify: `next-frontend/hooks/use-active-chat.tsx` (include `autoAllow` in transport body)
- Test: `next-frontend/scripts/test-approval-resume.ts`

**Interfaces:**
- Consumes: `ApprovalCard({state, command, title, subtitle, onAllowOnce, onAlwaysAllow, onDeny})` from `./aui/approval-card`; existing `chat.addToolApprovalResponse({id, approved})`.
- Produces: `loadAutoAllow(): string[]`, `addAutoAllow(toolName: string)` in `lib/tool-allowlist.ts`; route reads optional `body.autoAllow: string[]`.

- [ ] **Step 1: Read SDK v7 approval docs before coding the route**

Read `node_modules/ai/dist/docs` (or Context7 `/vercel/ai` query "tool approval addToolApprovalResponse server resume") for the exact UIMessage part shape when an approval is responded: confirm the tool part state becomes `"approval-responded"` with `approval: {id, approved}` and that `convertToModelMessages` turns an approved response into an executable tool call on the next `streamText` pass. Write findings as a comment in route.ts.

- [ ] **Step 2: Client — `lib/tool-allowlist.ts`**

```ts
const KEY = "lf:tool-auto-allow";
export function loadAutoAllow(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}
export function addAutoAllow(toolName: string) {
  if (typeof window === "undefined") return;
  const cur = loadAutoAllow();
  if (!cur.includes(toolName)) window.localStorage.setItem(KEY, JSON.stringify([...cur, toolName]));
}
```

- [ ] **Step 3: Client — ApprovalGate component**

```tsx
export function ApprovalGate({ seg, chat }: { seg: ToolSeg; chat: ReturnType<typeof useActiveChat>["chat"] }) {
  const [decided, setDecided] = useState<"running" | "denied" | null>(null);
  const summary = String((seg.input as any)?.query ?? (seg.input as any)?.url ?? JSON.stringify(seg.input ?? {})).slice(0, 120);
  const decide = (approved: boolean, always: boolean) => {
    if (!seg.approvalId) return;
    if (always && approved) addAutoAllow(seg.toolName);
    setDecided(approved ? "running" : "denied");
    chat.addToolApprovalResponse?.({ id: seg.approvalId, approved });
  };
  return (
    <ApprovalCard className="max-w-none"
      state={decided ?? "request"}
      title="Permission request" subtitle={seg.toolName} command={summary}
      onAllowOnce={() => decide(true, false)}
      onAlwaysAllow={() => decide(true, true)}
      onDeny={() => decide(false, false)} />
  );
}
```

The segment-merge logic at message.tsx:983-996 already morphs the ask seg into the running tool card when the approved tool-call arrives — so `decided==="running"` is only a bridge until that morph; keep it.

- [ ] **Step 4: Transport — include autoAllow**

In `use-active-chat.tsx` transport body builder (where `skills:` is added), add `autoAllow: loadAutoAllow()`.

- [ ] **Step 5: Route — detect + serve approval-resume requests**

In `app/api/chat/route.ts`, after parsing `messages`:

```ts
const lastMsg = messages[messages.length - 1];
const isApprovalResume =
  lastMsg?.role === "assistant" &&
  Array.isArray((lastMsg as any).parts) &&
  (lastMsg as any).parts.some((p: any) => p?.state === "approval-responded" || p?.type === "tool-approval-response");
```

When `isApprovalResume`:
- SKIP user-message persistence (no new user turn exists).
- Reuse `assistantId = lastMsg.id` so `backgroundServe` patches the SAME Convex row (verify how the current code derives/persists assistantId and mirror that path).
- In `toolApprovalDecision`, BEFORE the rules engine: `if (toolName && body.autoAllow?.includes(toolName)) return "approved";` (still runs `recordAudit` with reason "auto-allow (client pref)").
- Ensure `hasModelWorthyAssistantContent` keeps the approval-responded assistant message (it matches on `tool-approval-request` today — add the responded part type too if the SDK emits a distinct one, per Step 1 findings).
- Everything downstream (buildStream, backgroundServe, broadcast) runs unchanged — the resumed pass executes the granted tool server-side and continues the model turn.

- [ ] **Step 6: Write failing test `scripts/test-approval-resume.ts`**

Mirror `scripts/test-server-generation.ts`: fake `streamText` result whose first pass emits a tool part with `state:"approval-requested"`; then simulate the resume POST shape (assistant last message with approval-responded part) and assert the route's detection branch classifies it (`isApprovalResume === true`) and does NOT write a user message. Run: `npx tsx scripts/test-approval-resume.ts` → INTEGRATION PASS.

- [ ] **Step 7: Verify end-to-end** — tsc PASS; set `ENABLE_TOOL_APPROVAL=1` + `TOOL_APPROVAL_POLICY=ask` in `.env.local`, restart 3001; browser: add a test MCP tool (or temporarily remove webFetch from the low-risk list), trigger it, Allow once → card flips to "Approved, running" → tool executes → response continues (NO freeze, NO settle timeout). Deny → "Denied" and the model continues without the tool. Restore env after.

- [ ] **Step 8: Commit** `fix(chat): approval card end-to-end — ApprovalCard UI + server resume path + always-allow prefs`

---

### Task 8: Suggestions (empty + finished turns)

**Files:**
- Modify: `next-frontend/components/chat/messages.tsx`

**Interfaces:**
- Consumes: `Suggestions({suggestions, selectedSuggestion, cycle, onSuggestion, variant})`; `useActiveChat()` `sendMessage`.

- [ ] **Step 1: Mount under Greeting (empty) and after completed assistant turn**

```tsx
const SUGGESTIONS = ["Explain a concept simply", "Search the web for…", "Draft a document", "Brainstorm ideas"];
// empty state:
{messages.length === 0 && (
  <Suggestions suggestions={SUGGESTIONS} selectedSuggestion={null} cycle={0}
    onSuggestion={(s) => void sendMessage({ text: s })} />
)}
// after a completed turn (last msg assistant, not streaming):
{messages.length > 0 && !isStreaming && messages[messages.length-1]?.role === "assistant" && (
  <Suggestions suggestions={SUGGESTIONS} selectedSuggestion={null} cycle={messages.length}
    onSuggestion={(s) => void sendMessage({ text: s })} className="justify-start" />
)}
```

Verify `sendMessage` signature in use-active-chat before writing (it wraps the SDK chat send).

- [ ] **Step 2: Verify + Commit** — tsc PASS; browser: greeting shows 4 glass pills with stagger; click sends. Commit `feat(chat): aui Suggestions on empty + completed turns`.

---

### Task 9: Composer augment — ContextIndicator popover + attachment chips

**Files:**
- Modify: `next-frontend/components/chat/multimodal-input.tsx`
- Modify: `next-frontend/components/chat/context-indicator.tsx`
- Read first: `addons/assistant-ui/packages/ui/src/components/elements/composer.tsx` (extract ONLY the `ComposerContext` segmented-bar markup + `ComposerAttachmentChip` state markup — do not copy the whole file)

**Interfaces:**
- Consumes: existing `ContextIndicator({contextWindow, text, attachmentCount})`; existing upload loop in multimodal-input.
- Produces: `ContextIndicator` gains `onHover` popover content; attachment chip component `AttachmentChip({name, state: "uploading"|"done"|"error", progress?})` local to multimodal-input.

- [ ] **Step 1: Segmented context popover** — keep the 22px SVG ring untouched; on hover/focus mount a small glass popover (reuse `components/ui/glass-popover.tsx`) with a segmented bar: System / Tools / Messages / Attachments shares of `contextWindow`, each a colored segment + mono label + token count. Data source: extend ContextIndicator's caller to pass the existing token-estimate breakdown (grep `estimateConversationTokens` usage; if no per-segment data exists client-side, show total only and SKIP the segments — do not fake numbers).

- [ ] **Step 2: Attachment chips** — replace the silent-skip upload loop's render with chips: paperclip icon + name + progress bar while `state==="uploading"`, check on done, red retry on error (wire the existing `console.error` path to set error state).

- [ ] **Step 3: Verify + Commit** — tsc PASS; browser: attach a file → chip shows progress → done; hover the ring → popover. Commit `feat(chat): composer context popover + honest attachment chips`.

---

### Task 10: MessageActions bar + MCP status dots + ReasoningControl hooks fix

**Files:**
- Modify: `next-frontend/components/chat/message.tsx:1240-1286` (assistant action bar → MessageActions)
- Modify: `next-frontend/components/chat/mcp-config-modal.tsx` (McpRow status dots)
- Modify: `next-frontend/components/chat/reasoning-control.tsx` (hoist early return below hooks)

**Interfaces:**
- Consumes: `MessageActions({copied, reaction, regenerating, onCopy, onReactionChange, onRegenerate, onMore})`; existing `handleCopy/handleLike/handleDislike/handleRegenerate/feedbackStore` in message.tsx.

- [ ] **Step 1: Swap the assistant action bar** — replace the four hand-rolled buttons with:

```tsx
<MessageActions copied={copied} reaction={feedbackVote} regenerating={false}
  onCopy={handleCopy}
  onReactionChange={(r) => (r === "up" ? handleLike() : r === "down" ? handleDislike() : feedbackVote === "up" ? handleLike() : handleDislike())}
  onRegenerate={handleRegenerate}
  onMore={() => toast("More actions coming soon")} />
```

Keep `action-reveal` wrapper class. Keep the USER-message Copy/Edit bar as-is (aui has no edit; don't regress it).

- [ ] **Step 2: MCP status dots** — in `McpRow`, add a status dot with the aui vocabulary: `bg-emerald-500` connected, `animate-pulse bg-foreground/30` connecting, `bg-[#ffb400]` needs-auth, `bg-red-500` failed. Source the state from the existing config/health fields; if only enabled/disabled exists, map enabled→emerald, disabled→foreground/30 (do NOT fabricate transport states).

- [ ] **Step 3: ReasoningControl hooks fix** — move the early `return null` (conditional on model support) BELOW all hook calls, or hoist the condition into the parent. Read the file, find the early return, relocate it.

- [ ] **Step 4: Verify + Commit** — tsc PASS; browser: hover a completed reply → ghost-icon bar (copy/thumbs/regen/ellipsis), copy icon swaps to check; open MCP modal → status dots. Commit `refactor(chat): MessageActions bar, MCP status dots, hooks-order fix`.

---

### Task 11: Anti-slop + build gate + browser sweep

- [ ] **Step 1: Anti-slop grep audit** — in `components/chat/`: confirm (a) no aui component renders prose outside StreamItDown; (b) `max-w-none` passed at every transcript-inline aui call site; (c) only ONE active shimmer possible per message (reasoning XOR tool XOR search — the segment liveness logic already enforces tail-only liveness; verify); (d) `animate-in` stagger only in Suggestions/ToolTimeline.
- [ ] **Step 2: `npx tsc --noEmit` PASS, then `NODE_OPTIONS=--max-old-space-size=8192 npx next build` PASS.**
- [ ] **Step 3: Browser sweep on 3001** — snapshot/DOM/console: full turn with reasoning + webSearch + webFetch + math ($x^2$) + mermaid + multi-tool burst; dark AND light mode; verify no console errors, amber accents (no blue), glass cards.
- [ ] **Step 4: Commits** — wave commit in next-frontend + `chore: bump next-frontend` in parent leopard repo.

---

### Task 12: Apple-design audit pass (runs AFTER the swap)

- [ ] **Step 1:** Invoke the `apple-design` skill against the running app (port 3001): motion (springs, interruptibility), materials (glass blur/vibrancy), typography (tracking/leading), restraint (animation budget), reduced-motion coverage.
- [ ] **Step 2:** Apply the audit's concrete fixes as a final polish commit (e.g. ease curves → spring physics, focus rings, `motion-reduce` gaps).
- [ ] **Step 3:** Final tsc + build + browser verify; wave commit + parent bump.

---

## Self-Review Notes

- Spec coverage: replacements (reasoning/thinking/tool/approval/actions) ✓ Tasks 2-7,10; additions (ToolGroup/Timeline, ToolError/ErrorState, Suggestions, WebSearch/Sources, composer augment) ✓ Tasks 5,6,8,9; theme seam ✓ Task 1; approval server fix ✓ Task 7; apple audit ✓ Task 12; dead-data components excluded per user decision.
- Type consistency: `ToolSeg` = existing segment union member in message.tsx (`{kind:"tool", toolName, state, input, output, toolCallId?, approvalId?}`); new `{kind:"toolGroup", tools: ToolSeg[]}` extends it in Task 5 — executors must update the `Seg` union type where declared.
- Known risk: Task 7 Step 1 (SDK approval-resume semantics) is the one place the plan argues from docs the executor must confirm against `node_modules/ai` — the route code shape is conditional on that finding.
