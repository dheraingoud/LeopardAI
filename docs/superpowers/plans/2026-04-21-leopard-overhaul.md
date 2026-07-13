# Leopard Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Fix theme system (cream light mode), verify NIM API model strings, wire ReactFlow schema viz into schema page, integrate context management into chat.

**Architecture:** 4 parallel tracks — Theme (CSS vars + component fixes), NIM (model string verification), Schema Viz (wire ReactFlow + focus system), Context (wire existing hooks into UI).

**Tech Stack:** Next.js 15, Tailwind v4, @xyflow/react, Zustand, Convex, Framer Motion, Playwright MCP

---

## Track A: Theme System — Cream Light Mode

### Task A1: Update .light CSS variables to cream palette

**Files:**
- Modify: `app/globals.css:129-162` (.light block)

- [ ] **Step 1: Update .light block with cream values**
Replace the `.light` CSS variable block:
```css
.light {
  --background: #fdf6e3;
  --foreground: #171717;
  --card: #f5edd6;
  --card-foreground: #171717;
  --popover: #f5edd6;
  --popover-foreground: #171717;
  --primary: #d49600;
  --primary-foreground: #ffffff;
  --secondary: #efe8d4;
  --secondary-foreground: #171717;
  --muted: #efe8d4;
  --muted-foreground: #737373;
  --accent: #d49600;
  --accent-foreground: #ffffff;
  --destructive: #ef4444;
  --border: rgba(0, 0, 0, 0.1);
  --input: rgba(0, 0, 0, 0.1);
  --ring: #d49600;
  --sidebar: #f5edd6;
  --sidebar-foreground: #171717;
  --sidebar-primary: #d49600;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: rgba(212, 150, 0, 0.08);
  --sidebar-accent-foreground: #d49600;
  --sidebar-border: rgba(0, 0, 0, 0.1);
  --sidebar-ring: #d49600;
  --chart-1: #d49600;
  --chart-2: #cc5500;
  --chart-3: #b34700;
  --chart-4: #993d00;
  --chart-5: #803300;

  /* Cream-mode brand tokens */
  --leopard-amber: #d49600;
  --leopard-amber-dim: #9e7200;
  --leopard-amber-glow: #d4960040;
  --leopard-amber-subtle: rgba(212, 150, 0, 0.08);
  --leopard-amber-muted: rgba(212, 150, 0, 0.15);
  --leopard-black: #fdf6e3;
  --leopard-surface: #f5edd6;
  --leopard-surface-elevated: #efe8d4;
  --leopard-surface-glass: rgba(0, 0, 0, 0.02);
  --leopard-border-subtle: rgba(0, 0, 0, 0.06);
  --leopard-border: rgba(0, 0, 0, 0.1);
  --leopard-border-strong: rgba(0, 0, 0, 0.15);
  --leopard-border-bright: rgba(212, 150, 0, 0.2);
  --leopard-text: #171717;
  --leopard-text-muted: #737373;
  --leopard-text-dim: #a3a3a3;
  --leopard-overlay-faint: rgba(0, 0, 0, 0.015);
  --leopard-overlay-light: rgba(0, 0, 0, 0.03);
  --leopard-overlay-medium: rgba(0, 0, 0, 0.05);
  --leopard-border-faint: rgba(0, 0, 0, 0.04);

  --radius: 0.75rem;
}
```

- [ ] **Step 2: Update shadow system in .light**
Add to `.light` block:
```css
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.06);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.1);
  --shadow-xl: 0 16px 48px rgba(0, 0, 0, 0.12);
  --shadow-glow: 0 0 20px rgba(212, 150, 0, 0.1);
  --shadow-glow-intense: 0 0 40px rgba(212, 150, 0, 0.2);
```

- [ ] **Step 3: Add canvas grid CSS variable**
Add to `:root` (dark) block and `.light` block:
```css
/* In :root (dark) */
--canvas-grid-color: rgba(255, 255, 255, 0.06);

/* In .light */
--canvas-grid-color: rgba(0, 0, 0, 0.08);
```

- [ ] **Step 4: Update light mode overrides section**
Update the `.light` override rules to use cream values:
- Glass backgrounds → cream-tinted white
- Canvas bg → `#f5edd6`
- Node bg → `#ffffff`
- Scrollbar → cream tones

- [ ] **Step 5: Add paper grain SVG for light noise**
Replace the `.light .noise-overlay::before` with static paper grain:
```css
.light .noise-overlay::before {
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
  opacity: 0.08;
  animation: none;
}
```

- [ ] **Step 6: Verify with dev server**
Run: `bun run dev` → toggle theme → screenshot light/dark

---

### Task A2: Fix remaining hardcoded patterns in ternary/dynamic classnames

**Files:**
- Modify: `components/sidebar.tsx` — dynamic chat list item classes
- Modify: `components/canvas-panel.tsx` — dynamic tab classes
- Modify: `app/app/schema/page.tsx` — inline styles and dynamic classes
- Modify: `app/layout.tsx` — ClerkProvider appearance inline strings

- [ ] **Step 1: Fix sidebar dynamic class ternaries**
Find patterns like `"text-[#a3a3a3] hover:bg-white/[0.04] hover:text-white"` in ternary expressions. These survived the bulk sed because they're in string concatenations. Replace each manually.

- [ ] **Step 2: Fix canvas-panel dynamic tab classes**
Same pattern — find ternary class assignments and add `dark:`/`light:` prefixes.

- [ ] **Step 3: Fix schema page inline styles**
The grid background at `schema/page.tsx ~L1092` uses inline `backgroundImage` with hardcoded `rgba(255,255,255,0.06)`. Replace with CSS variable:
```tsx
style={{
  backgroundImage: `linear-gradient(var(--canvas-grid-color) 1px, transparent 1px), linear-gradient(90deg, var(--canvas-grid-color) 1px, transparent 1px)`,
  backgroundSize: `${40 * zoom}px ${40 * zoom}px`,
}}
```

- [ ] **Step 4: Fix ClerkProvider appearance for light mode**
In `app/layout.tsx`, the ClerkProvider `appearance` prop is hardcoded to dark. Make it reactive to theme by reading from `themeStore` (requires converting to client-side rendering or using CSS variable approach).

- [ ] **Step 5: Verify all components render correctly in both modes**

---

## Track B: NIM API — Model String Verification + Fix

### Task B1: Verify and fix model API strings via Tavily

**Files:**
- Modify: `app/api/chat/route.ts:49-67` (MODEL_MAP)
- Modify: `types/index.ts:72-200` (MODELS array)
- Read: `lib/nim.ts:38-100` (MODEL_REGISTRY)

- [ ] **Step 1: Use Tavily to verify each model string on build.nvidia.com**
Browse `https://build.nvidia.com/models` for each model in MODEL_MAP. Record exact `model` param string the API expects.

- [ ] **Step 2: Fix MODEL_MAP strings in route.ts**
Update any mismatched model strings. Key suspects:
- `stepfun-ai/step-3.5-flash` vs `stepfun/step-3-5-flash`
- `qwen/qwen3.5-397b-a17b` vs `qwen/qwen3-300b-a22b`
- `z-ai/glm-5.1` vs `zhipuai/glm-5-1`
- `minimaxai/` vs `minimax/` prefix

- [ ] **Step 3: Fix MODELS array in types/index.ts**
Sync `nimId` values with corrected MODEL_MAP.

- [ ] **Step 4: Fix MODEL_REGISTRY in lib/nim.ts**
Sync registry keys with corrected model strings.

- [ ] **Step 5: Test each model via API call**
Send a minimal test prompt to each model endpoint to verify it responds.

---

### Task B2: Ensure route.ts uses lib/nim.ts correctly

**Files:**
- Modify: `app/api/chat/route.ts` (POST handler)
- Read: `lib/nim.ts` (exports)

- [ ] **Step 1: Verify route.ts imports from lib/nim.ts**
Check that `buildNIMPayload`, `NIMError`, `streamWithRetry` are imported and used.

- [ ] **Step 2: Fix any redundant model logic in route.ts**
Remove duplicated MODEL_MAP in route.ts if lib/nim.ts has the authoritative registry. Keep route.ts's `resolveModel()` but point it at nim.ts data.

- [ ] **Step 3: Test a real chat with one model end-to-end**

---

## Track C: Schema Viz — Wire ReactFlow into Schema Page

### Task C1: Replace custom canvas in schema/page.tsx with ReactFlow SchemaVizCanvas

**Files:**
- Modify: `app/app/schema/page.tsx` (main canvas section ~L1078-1200)
- Read: `components/schema-viz/SchemaVizCanvas.tsx`
- Read: `store/schemaVizStore.ts`
- Read: `lib/schema-viz/toReactFlow.ts`

- [ ] **Step 1: Import SchemaVizCanvas component in schema/page.tsx**
Add import: `import { SchemaVizCanvas } from "@/components/schema-viz/SchemaVizCanvas";`

- [ ] **Step 2: Replace the custom canvas div with SchemaVizCanvas**
Replace the ~120 lines of custom canvas JSX (grid, svg edges, table nodes, floating nodes) with:
```tsx
<SchemaVizCanvas schema={activeWorkspace.graph} />
```

- [ ] **Step 3: Pass workspace state through SchemaVizStore**
Ensure the schema viz store (Zustand) connects to the workspace state so node positions persist in localStorage (existing workspace persistence).

- [ ] **Step 4: Remove dead canvas code from schema/page.tsx**
Remove: `handleWheel`, `handleCanvasPointerDown`, `handleNodePointerDown`, the `useEffect` for pointer events, `edges` memo, `canvasSize` memo, and all the SVG/HTML canvas JSX. Keep workspace management code.

- [ ] **Step 5: Test canvas renders correctly with real SQL schema**

---

### Task C2: Add focus/neighborhood mode to SchemaVizCanvas

**Files:**
- Modify: `store/schemaVizStore.ts` (add setFocusedTable)
- Modify: `components/schema-viz/TableNode.tsx` (add focus glow)
- Modify: `components/schema-viz/SchemaVizCanvas.tsx` (wire focus system)
- Modify: `components/schema-viz/InspectorPanel.tsx` (add slide-in animation)

- [ ] **Step 1: Verify SchemaVizStore has setFocusedTable**
Read store file. Ensure `setFocusedTable(id, relationships)` computes neighborIds and focusedEdgeIds.

- [ ] **Step 2: Update TableNode with focus/neighbor/dimmed states**
Add CSS transitions: `transition: opacity 220ms ease, box-shadow 200ms ease, border-color 200ms ease`.
Apply focus glow via `theme.glowSelected`, neighbor glow via `theme.glowNeighbor`.
Apply dimming via `opacity: isDimmed ? theme.nodeOpacityDimmed : 1`.

- [ ] **Step 3: Wire edge highlighting in SchemaVizCanvas**
When `focusedEdgeIds` is non-empty, apply animated dash stroke and indigo color to focused edges.

- [ ] **Step 4: Add canvas click-to-defocus**
On ReactFlow pane click: `setFocusedTable(null, [])`.

- [ ] **Step 5: Add InspectorPanel slide-in**
When `focusedTableId` is set, render InspectorPanel with framer-motion `AnimatePresence` slide animation.

- [ ] **Step 6: Test focus mode — click table → glow + dim + inspector**

---

### Task C3: Add SchemaVizToolbar to canvas

**Files:**
- Read: `components/schema-viz/Toolbar.tsx`
- Verify it renders in SchemaVizCanvas

- [ ] **Step 1: Ensure Toolbar is rendered inside ReactFlow Panel**
Position: top-left. Contains: search, type filters, layout direction, theme toggle, export.

- [ ] **Step 2: Test toolbar interactions**
Search highlights matching nodes. Type filter hides/shows. Layout direction re-runs dagre. Theme toggles canvas + nodes.

---

## Track D: Context Management — Wire into Chat UI

### Task D1: Add context usage bar to input bar

**Files:**
- Modify: `components/input-bar.tsx` (add usage bar above textarea)
- Read: `components/context-usage-bar.tsx`
- Read: `hooks/use-context-budget.ts`

- [ ] **Step 1: Verify useContextBudget hook works**
Import and call `useContextBudget({ messages, modelId })` in the chat page.

- [ ] **Step 2: Verify ContextUsageBar component renders**
Check `components/context-usage-bar.tsx` exists and renders a 3px bar with green/amber/red color.

- [ ] **Step 3: Wire ContextUsageBar into input-bar.tsx**
Place `<ContextUsageBar budget={budget} />` at the top of the InputBar component, above the textarea.

- [ ] **Step 4: Test — send many messages until bar turns amber/red**

---

### Task D2: Add context overflow handling to streaming hook

**Files:**
- Modify: `hooks/use-streaming.ts` (detect CONTEXT_OVERFLOW error)
- Modify: `app/api/chat/route.ts` (return CONTEXT_OVERFLOW on 400)

- [ ] **Step 1: Check route.ts returns CONTEXT_OVERFLOW error code**
Verify the POST handler catches NIM 400 context errors and returns `{ error, code: "CONTEXT_OVERFLOW" }`.

- [ ] **Step 2: Add CONTEXT_OVERFLOW detection to use-streaming.ts**
When stream error contains `CONTEXT_OVERFLOW`, show toast with "Compact & Continue" and "New Chat" buttons.

- [ ] **Step 3: Test by sending a very long conversation**

---

### Task D3: Add large file mode to input bar

**Files:**
- Modify: `components/input-bar.tsx` (add file mode popover)
- Read: `lib/file-chunker.ts`

- [ ] **Step 1: Detect large files in processFile**
Files >500 lines or >20K chars → set `isLarge: true` on attachment.

- [ ] **Step 2: Add mode chooser popover for large files**
When `isLarge`, show 3 options: [Full file] [Smart digest] [Just signatures].

- [ ] **Step 3: Implement digest mode**
Uses `extractOutline()` + `selectRelevantChunks()` from file-chunker.ts.

- [ ] **Step 4: Test with a 2000-line .ts file upload**

---

## Track E: Bug Fixes (Immediate)

### Task E1: Fix Convex messages:send race condition

**Files:**
- Modify: `app/app/schema/page.tsx:753-798` (handleAskSchema function)

- [ ] **Step 1: Capture user.id before any await**
After `if (!user)` guard, add: `const userId = user.id;`
Then replace all `user.id` references with `userId` in the function.

- [ ] **Step 2: Add try-catch around the sendMessage call**
Wrap lines 784-796:
```typescript
try {
  const userMessageId = await sendMessage({
    chatId: targetChatId as Id<"chats">,
    userId,
    role: "user",
    content: sanitized.content,
  });
  // ... image persistence
  router.push(`/app/chat/${targetChatId}`);
  toast.success("Opened schema-aware chat.");
} catch (err) {
  console.error("sendMessage failed:", err);
  toast.error("Failed to send message. Please try again.");
}
```

- [ ] **Step 3: Test "Ask this schema" button works**

---

## Track F: Playwright TDD Loop

### Task F1: Write and run Playwright tests for all features

**Files:**
- Create: `e2e/theme-toggle.spec.ts`
- Create: `e2e/schema-viz.spec.ts`
- Create: `e2e/chat-streaming.spec.ts`

- [ ] **Step 1: Start dev server with bun**
Run: `bun run dev` → wait for ready

- [ ] **Step 2: Test theme toggle**
Navigate to app, click theme toggle, verify light mode renders cream background, dark text, amber accents. Toggle back to dark.

- [ ] **Step 3: Test schema canvas**
Upload SQL file, verify ReactFlow renders nodes, click a table → focus glow appears, inspector slides in.

- [ ] **Step 4: Test NIM chat**
Select each model, send a test prompt, verify streaming response appears.

- [ ] **Step 5: Test context overflow**
Send many long messages until context bar turns red.

- [ ] **Step 6: Fix any failures found, re-run until all pass**

---

## Parallel Execution Map

```
Time →  T1          T2          T3          T4
─────────────────────────────────────────────────
A1:  [cream CSS vars]
A2:              [fix remaining patterns]
B1:  [verify model strings via Tavily]
B2:                          [route.ts fix]
C1:              [wire ReactFlow]
C2:                          [focus mode]
C3:                                  [toolbar]
D1:              [context bar]
D2:                          [overflow handling]
D3:                                  [file modes]
E1:  [Convex fix]
F1:                                      [Playwright loop]
```

- A1, B1, E1 can start immediately (no dependencies)
- A2, C1, D1 depend on A1
- C2 depends on C1, B2 depends on B1
- F1 runs after all others
