# Leopard AI — Full Overhaul Design Spec

> Date: 2026-04-21
> Status: Approved — Moving to implementation

---

## Sub-Project A: Theme System Overhaul

### A1. Light Mode Palette

Cream-based warm palette (#fdf6e3) with paper-grain texture:

| Token | Dark | Light |
|-------|------|-------|
| `--background` | #000000 | #fdf6e3 |
| `--foreground` | #f5f5f5 | #171717 |
| `--card` | #0a0a0a | #f5edd6 |
| `--popover` | #111111 | #f5edd6 |
| `--secondary` | #1a1a1a | #efe8d4 |
| `--muted` | #1a1a1a | #efe8d4 |
| `--border` | rgba(255,255,255,0.12) | rgba(0,0,0,0.1) |
| `--input` | rgba(255,255,255,0.12) | rgba(0,0,0,0.1) |
| `--leopard-surface` | #0a0a0a | #f5edd6 |
| `--leopard-surface-elevated` | #111111 | #efe8d4 |
| `--leopard-surface-glass` | rgba(255,255,255,0.03) | rgba(0,0,0,0.02) |
| `--leopard-border-subtle` | rgba(255,255,255,0.08) | rgba(0,0,0,0.06) |
| `--leopard-text` | #f5f5f5 | #171717 |
| `--leopard-text-muted` | #737373 | #737373 |
| `--leopard-text-dim` | #525252 | #a3a3a3 |
| `--leopard-amber` | #ffb400 | #d49600 |
| `--leopard-amber-dim` | #b37e00 | #9e7200 |

### A2. Grainy Paper Texture (Light Mode Only)

Static paper-grain SVG for light mode. No animation — caches in GPU. Dark mode keeps animated noise.

### A3. Inline Style Fixes

Schema canvas grid inline `rgba(255,255,255,0.06)` → CSS variable `--canvas-grid-color`.

### A4. Remaining Hardcoded Pattern Audit

- Dynamic classnames in ternaries — manual fix per component
- ClerkProvider appearance — add `.light` variant
- Edge colors in schema canvas JSX — theme-aware

### A5. Shadow System

All shadow vars get light-mode counterparts in `.light` block.

---

## Sub-Project B: NIM API Fix

### B1. Model String Verification

Use Tavily to browse build.nvidia.com/models for exact API strings. Critical mismatches exist between route.ts MODEL_MAP and the spec doc.

### B2. Create `lib/modelCapabilities.ts`

MODEL_REGISTRY with reasoning control params (from spec §1.3).

### B3. Implement `lib/nim.ts`

`buildNIMPayload`, `NIMError`, `streamWithRetry` from spec §1.4-1.6.

### B4. Timeout Fixes

Verify timeouts after model string correction.

---

## Sub-Project C: Schema Viz — ReactFlow Overhaul

**Quality bar: Supabase table designer × Figma canvas. Zero jank. 60fps.**

### C1. Migration: Custom Canvas → @xyflow/react (ReactFlow)

The current schema/page.tsx (1549 lines) uses a custom HTML/SVG canvas. Replace with ReactFlow which provides:
- Built-in node drag with GPU-accelerated transforms
- Pan/zoom with momentum and smooth transitions
- Minimap component
- Node selection and focus system
- Edge rendering with animated paths

**Architecture (from spec §7.1):**
```
ParsedSchema (§6) → schemaToReactFlow() → applyDagreLayout() → ReactFlow canvas
  → Focus/selection system → Inspector panel → Toolbar
```

### C2. Theme System — SchemaVizTheme

Schema Viz has its own theme context (from spec §7.2). The `LIGHT_THEME` uses these values:

| Token | Dark | Light |
|-------|------|-------|
| canvasBg | #0d0d0d | #f5edd6 (cream variant) |
| dotColor | #1e1e1e | #e2e8f0 |
| nodeBg | #1a1a1a | #ffffff |
| nodeHeaderBg | #111111 | #f8fafc |
| nodeBorder | #2a2a2a | #e2e8f0 |
| nodeBorderSelected | #f59e0b | #f59e0b |
| nodeBorderNeighbor | #6366f1 | #6366f1 |
| nodeBorderDimmed | #161616 | #f1f5f9 |
| nodeOpacityDimmed | 0.12 | 0.18 |
| textPrimary | #e5e5e5 | #111827 |
| textSecondary | #a3a3a3 | #6b7280 |
| edgeDefault | #3a3a3a | #cbd5e1 |
| glowSelected | amber ring 24px | amber ring 20px |
| glowNeighbor | indigo ring 14px | indigo ring 12px |

Light mode canvas bg changes from `#f8fafc` (spec) to `#f5edd6` (cream variant) for consistency with app theme.

### C3. Focus / Neighborhood Mode — The Hero Feature

When user clicks a table node (from spec §7.4):
1. Selected table gets amber glow ring + `nodeBorderSelected`
2. Directly connected tables (1 FK hop) get indigo glow ring + `nodeBorderNeighbor`
3. Connecting edges pulse with animated dash stroke in indigo
4. All other tables/edges fade to `nodeOpacityDimmed` (12% dark, 18% light)
5. Dim overlay on canvas — focused neighborhood floats above
6. Inspector panel slides in from right with full table details
7. Clicking canvas area clears focus — all transitions reverse smoothly
8. Clicking a neighbor shifts focus — neighborhood recomputes

**All transitions**: `transition: opacity 220ms ease, box-shadow 200ms ease, border-color 200ms ease`.

### C4. Node Types — Visual Differentiation

| Object Type | Left border accent | Header icon |
|---|---|---|
| table | transparent | Grid icon |
| view | border-blue-500 | Eye icon |
| materialized_view | border-blue-700 | Cached eye |
| procedure/function | border-purple-500 | Code block |
| trigger | border-orange-400 | Lightning |
| sequence | border-green-500 | Number |
| enum | border-pink-400 | List |

Triggers rendered as badges on parent table node, not standalone.

### C5. TableNode Component

From spec §7.5. Uses `@xyflow/react` Handle/Position for edge connections. Memoized with `React.memo`. Inline styles (not Tailwind) for theme-reactivity — the `SchemaVizTheme` object controls all visual tokens.

### C6. SchemaVizStore (Zustand)

From spec §7.4. Manages: `focusedTableId`, `neighborIds`, `focusedEdgeIds`, `theme`, `hiddenObjectTypes`, `layoutDirection`, `searchQuery`. Persisted theme in localStorage.

### C7. Drag Performance

ReactFlow handles drag natively with GPU transforms — no manual pointer event management needed. No more `setWorkspaces` on every mousemove pixel.

### C8. Smooth Zoom

ReactFlow provides `animate` option on `setViewport` — smooth zoom transitions built-in.

### C9. Toolbar

Search, filter by object type, layout direction toggle (LR/TB), theme toggle, export. Lives in ReactFlow `<Panel>` component.

### C10. Inspector Panel

Slides in from right. Shows: full column list, constraints, indexes, triggers, relationships. Uses `AnimatePresence` from framer-motion for enter/exit animations.

---

## Sub-Project D: Context Management + Memory

### D1. Token Estimator (Phase 1A)

`lib/token-estimator.ts`: Pure utility. ~4 chars/token English, ~2.5 CJK. Image token estimation. `getContextBudget()` = contextWindow - 1K system - 3K response.

### D2. Context Budget Hook (Phase 1C)

`hooks/use-context-budget.ts`: Live token usage display. `usedTokens`, `maxTokens`, `percentUsed`, `isNearBudget(>85%)`, `isOverBudget`.

### D3. Large File Intelligence (Phase 3)

`lib/file-chunker.ts`: Split on natural boundaries. `extractOutline()` for signatures. `selectRelevantChunks()` with keyword matching.

### D4. Context Usage Bar (Phase 4A)

3px bar above InputBar. Green <50%, amber 50-80%, red >80%. Framer-motion animated width. Tooltip on hover.

### D5. Cross-Chat Memory (Phase 5)

From spec §5. System prompt injection of relevant memories. `lib/memory.ts` + `lib/memoryUpdater.ts` + `lib/systemPrompt.ts`. Memory stored in Convex per user. Summarized background task on every 5th message using utility model.

---

## Execution Order

| Step | Task | Sub-Project | Parallelizable |
|------|------|-------------|---------------|
| 1 | Update .light CSS vars to cream palette | A | Yes (with 2,3) |
| 2 | Verify NIM model strings via Tavily | B | Yes (with 1,3) |
| 3 | Create lib/modelCapabilities.ts | B | Yes (with 1,2) |
| 4 | Fix remaining hardcoded patterns | A | Depends on 1 |
| 5 | Create lib/nim.ts (buildNIMPayload + NIMError) | B | Depends on 3 |
| 6 | Install @xyflow/react + migrate schema canvas | C | Depends on 1 |
| 7 | Create SchemaVizStore + TableNode + theme | C | Depends on 6 |
| 8 | Focus/neighborhood system + Inspector | C | Depends on 7 |
| 9 | Create lib/token-estimator.ts | D | Yes (with 6-8) |
| 10 | Context budget hook + usage bar | D | Depends on 9 |
| 11 | Convex messages:send race condition fix | Bug | Immediate |
| 12 | Playwright TDD loop on all features | Test | Depends on 1-11 |

---

## Verification Plan (Playwright)

1. **Theme toggle**: Click light/dark toggle → entire UI switches. Screenshot both modes.
2. **Light mode visual**: Cream bg, dark text, warm amber, paper grain, visible borders.
3. **Dark mode regression**: No visual regressions from current.
4. **NIM API**: Each model responds to test prompt within timeout.
5. **Schema canvas**: Nodes draggable, zoom smooth, focus/neighborhood glows, inspector slides.
6. **Context overflow**: Upload 2000-line file → truncation notice, no crash.
7. **Chat streaming**: Start chat, verify streaming works, stop button works.
