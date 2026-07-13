# Liquid-Glass Redesign + Feature Additions — Design Spec

> Status: APPROVED 2026-07-10. Brainstorming terminal state: design record for the 5-subproject build.
> Constraints honored: paper-grain dark bg (not hard black), same amber `#ffb400` palette, `@liquid-glass` integrated wherever it fits (chat included), streaming-markdown not left behind, reasoning button = liquid-glass, focus-driven (gallery density, not cockpit), webfetch + MCP feature additions, file-attachment end-to-end repair.

## Goal

Transform the leopard Next.js chat app from a pure-black glassmorphism shell into a paper-grain, liquid-glass, focus-driven product; fix the broken file-attachment pipeline end-to-end; add a webfetch/websearch tool layer and MCP support; overhaul the streaming-markdown renderer. Use the `@lore-glass` shadcn copy-in registry as the surface material, preserve the amber identity, and apply the four design skills (gpt-taste for bento/landing/auth/settings, design-taste-frontend-v1 for product density, high-end-visual-design for double-bezel/motion, shadcn for tokens/primitives).

## Architecture

Five dependency-ordered sub-projects, each spec→plan→implement→smoke-test as its own /loop iteration:

1. **P1 Visual foundation** — tokens, `next/font`, paper-grain layer, `@lore-glass` install + `GlassSurface` on global surfaces (input bar, popovers, side panel), delete the dead inversion block. Unblocks all others.
2. **P2 Streamitdown** — `react-markdown` `components` override (shiki code blocks w/ headers + copy, tables/links/img/blockquote, reasoning-as-md collapsed, inline streaming cursor, generic `tool-*` card, source-citation card).
3. **P3 File attachments** — Convex `fileStorage` + `/api/files/upload` route → real http URL, accept gating, render file parts in the user bubble, persist `attachments`.
4. **P4 Webfetch** — `webSearch` (Tavily) + `webFetch` tools decoupled from `ENABLE_ARTIFACTS`, prompt section, citation rendering (consumes P2).
5. **P5 MCP support** — `@ai-sdk/mcp` server-side memoized client, env-driven remote-server registry, merged into route tools block.

## Tech Stack

Next.js 16.2.1, React 19, Tailwind v4 (`@tailwindcss/postcss`), `@base-ui/react`, `ai@6.0.116` + `@ai-sdk/openai-compatible@3.0.5` + `@ai-sdk/react@3.0.118`, Convex + Clerk, `react-markdown@10` + `remark-gfm` + `shiki@4`, `@lore-glass` (shadcn copy-in; `@base-ui/react`-based), `next-themes` (class strategy, `storageKey:leopard-theme`).

## Global Constraints

- **NO emojis** anywhere in code/comments/output/markup (all 4 design skills mandate).
- **No `Inter` font** (banned). Keep brand fonts: Bricolage Grotesque (display), Instrument Sans (body), Iosevka Charon (mono), Momo Signature (greeting). Migrate Google Fonts `<link>`s → `next/font` with LITERAL names in `@theme inline`, font vars on `<html>` not `<body>`.
- **No pure black `#000000`**. Use warm near-black paper `#0a0907` (dark). Light keeps cream `#fdf6e3`.
- **Amber preserved**: `--leopard-amber:#ffb400` dark / `#d49600` light; `--ring`, `--shadow-glow`, `--primary` all stay amber.
- **GPU-safe motion**: animate `transform`/`opacity` only; `backdrop-blur` only on fixed/sticky/portal surfaces; grain on fixed `pointer-events-none` z-system layer; cubic-bezier only (no `linear`/`ease-in-out`). Use `glassEase = cubic-bezier(0.22,1.15,0.36,1.06)` from `@lore-glass`.
- **Dev server ALWAYS on port 3001** (leopard). Port 3000 = MAYA — never kill/rebuild/.next-regen it.
- **`NVIDIA_API_KEY` is a real secret in `next-frontend/.env`** — mask in any echoed output; never commit/paste plaintext.
- **Tavily `tvly-dev-…`** copied to `.env.local:TAVILY_API_KEY` — sensitive, never in commits/logs.
- **`BYPASS_CLERK=true`** stays for now (testing) — revert to real Clerk auth post-build.
- **git=false on working dir** — no commits unless the user asks. Plan commit steps are conditional.
- **Browser verify** uses `browser_snapshot` (playwright MCP), NOT `browser_take_screenshot`.
- **`/gpt-taste`** governs bento/landing/auth/settings layout surfaces (AIDA, gapless bento `grid-flow-dense`, 2-line hero, Python-RNG variance). **`design-taste-frontend-v1`** governs product/chat density (gallery ~2-3, focus-driven, one-thing-at-a-time). Never cockpit-dense in chat.
- **`ai@6.0.116` has NO `maxSteps`** — use `stopWhen: stepCountIs(N)`. Per-model `supportsTools:false` = cosmos×2 only.
- **Per-model reasoning routing unchanged** (lib/nim.ts MODEL_REGISTRY stays source of truth): effort/think/locked-on shapes intact through the redesign.

---

## P1 — Visual Foundation

### Background + grain

Lift `--background` dark from `#000000` → `#0a0907` (warm near-black paper). `--card:#100e0b`, `--popover:#14110d`, `--sidebar:#070605`. Amber tokens untouched. Re-tune the existing inline `feTurbulence` `.noise-overlay::before` (already on `<body>`, `globals.css:687-701`): `baseFrequency` 0.9 → 0.7 (paper-fiber), warm-tint the layer via `feColorMatrix` amber multiply, opacity 0.25 → 0.18 dark / light static 0.06. Pull the unused `.leopard-texture` amber radial "spots" (`globals.css:533-540`) into the chat `main` bg at ~0.015 opacity as the paper identity. Both layers: `position:fixed; inset:0; pointer-events:none; z-index` system-layer only.

### liquid-glass surfaces

Register `@lore-glass` in `components.json:registries`. Install via `npx shadcn@latest add @lore-glass/glass @lore-glass/glass-button @lore-glass/glass-input @lore-glass/glass-popover @lore-glass/glass-dialog @lore-glass/glass-tooltip @lore-glass/glass-slider @lore-glass/glass-tabs @lore-glass/glass-switch` (non-interactive `-d`/`-y`; glass auto-pulls as registryDependency). Replace inline `dark:bg-[#0c0c0c]/80 backdrop-blur-xl` surfaces with `GlassSurface` (amber tint via `tintColor`):

- **Input bar** (`multimodal-input.tsx:142` form): double-bezel — outer shell `ring-1 ring-white/5 rounded-[1.75rem] p-1.5` + inner `GlassSurface rounded-[calc(1.75rem-0.375rem)]` + inset rim `shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]`.
- **Model selector / plus-menu / reasoning popovers**: `glass-popover` (portal, floats over content, survives text reflow). Reasoning **button** = `GlassButton` icon variant (amber tint when active), click → `glass-popover` w/ `glass-slider` (tiered) or binary list. THIS IS THE THINKING BUTTON → liquid-glass.
- **Send** = `GlassButton capsule` (amber). **Plus/Stop** = `GlassButton icon`.
- **Context indicator ring** stays self-contained SVG (already theme-aware) — no glass needed.
- **Side artifact panel** (`artifact-panel.tsx:84`): currently solid `dark:bg-[#0a0a0a]` → `GlassSurface` (subtle tint), double-bezel header.
- **Sidebar** (`sidebar.tsx`): rail `dark:bg-[#050505]` → `GlassSurface` (low tint), dropdown `glass-elevated` already → swap to `glass-popover`. Brand header stays signature font (amber glow).
- **ReasoningBlock** (`message.tsx:142-196`): `border-l-2 border-[#ffb400]/15` → glass-toned left rail; collapsible stays, default collapsed post-P2.

The refracting `Glass` (SVG `feDisplacementMap`, Chromium-only) = accent-ONLY: greeting hero (`messages.tsx:66-83` "How can I help?") and landing/auth hero. NEVER on the scrolling transcript or input bar content (PerfGuard + blur-only-on-fixed). WebGL fallback auto on Safari for `video/canvas/img` wraps.

### Tokens + fonts

`app/globals.css` `@theme inline`: add literal font declarations (`--font-sans:"Instrument Sans","Bricolage Grotesque","Segoe UI"` etc. — NOT `var(--font-*)`). Move font var classNames from `<body>` to `<html>` in `app/layout.tsx` (shadcn gotcha). Swap Google Fonts `<link>`s (layout.tsx:40-51) → `next/font` imports (`Bricolaage_Grotesque`, `Instrument_Sans`, `Iosevka_CCharon` if available else `JetBrains_Mono`, `Momo_Signature` if available else fallback). Set on `<html>`.

Delete `globals.css:400-515` (115-line `.light [class*=bg-black]` inversion block) — dead/conflicting under token-driven paper redesign. Re-express the user-bubble hardcoded `#1f1607` gradient (`message.tsx:252`) → amber-tinted `GlassSurface` (not literal hex). Verify `@custom-variant dark (&:where(.dark, .dark *))` present in `globals.css` (next-themes `.dark`); add if missing.

### Acceptance (P1)

- `pnpm tsc --noEmit` clean; lint clean (minus pre-existing `.next/types LayoutRoutes` noise).
- Port 3001 dev server boots; no console errors.
- browser_snapshot: input bar + popovers show liquid-glass refraction (Chromium) / frosted blur (Safari); amber preserved; paper-grain bg warm (not pure black); no layout shift; reasoning button is a glass pill + opens glass popover.
- Sidebar + side panel are glass; landing `.leopard-texture`/greeting uses refracting `Glass`.
- Font flash none; FOUT clean (next/font).

---

## P2 — Streamitdown (streaming-markdown renderer)

Wire `shiki@4` (already installed, dead) via `react-markdown` `components` override (NOT `rehypePlugins` — per-component control, theme-matched). Concrete deliverables in `components/chat/message.tsx` PreviewMessage:

- **Code blocks**: `pre`/`code` override → `GlassSurface` panel + header (lang badge + copy button + collapse/max-height scroll). Shiki dual-theme (dark/light via `next-themes` `useTheme`), memoized highlighter (`useMemo`, singleton — shiki is sync-heavy).
- **Rich elements**: port legacy `components/message.tsx:667-721` overrides — `table` (amber borders, striped), `a` (amber underline), `img` (reuse the working IndexedDB hydrate path `message.tsx:223-235`), `blockquote` (amber left rail).
- **Reasoning**: render reasoning content AS markdown (not raw `whitespace-pre-wrap`), stream line-by-line, default COLLAPSED w/ "Thinking…" summary + 3 amber pulsing dots → expand on click.
- **Streaming cursor**: inline at last rendered token (not after tree). Memoize parse (stable substring key) to cut re-parse cost per token-delta.
- **Generic `tool-*` card**: `tool-call` (calling state, amber spinner) → `tool-output-available` (args JSON collapsible + output). Required for P4/P5.
- **Source-citation card**: render `source-url`/`source` parts (title + favicon + url) — for webfetch results.

### Acceptance (P2)

- tsc/lint clean; 3001 boots.
- browser_snapshot: assistant md renders w/ syntax-highlighted code (amber-accented theme), styled tables/links/img/blockquote; reasoning collapsed by default, expands, renders md; streaming cursor inline; webfetch (once P4 shipped) tool-call + sources cards render.

---

## P3 — File Attachments End-to-End Repair

- **Backend (Convex file storage — locked)**: create `convex.config.ts` w/ `fileStorage` component; convex `generateUploadUrl` mutation + `store`/`getFileUrl` helpers. New `/api/files/upload` route: get Convex generateUploadUrl → stream bytes → return `{url,name,mediaType}` (public http Convex URL). **Kill the silent `blob:` fallback** in `lib/upload.ts:22-28` (root bug F1/F3) — throw on real failure; explicit `data:` path only for tiny files (under env-tunable threshold).
- **Send (F3/F5)**: real http URL passes SDK `validateDownloadUrl` → NIM gets native `image_url` (VLM images) / inline base64 (audio/PDF/text). Fix client `name`→`filename` in the file-part shape (`multimodal-input.tsx:84`).
- **Accept gating (F10)**: plus-menu `accept` per `visionModalities` — media `image/*,video/*` for image+video models, `image/*` only for step-3.7 (card: text+image); file `text/*,application/pdf` etc. Disable media pickers for `supportsVision:false` LLMs; text-file picker stays for all.
- **Render (F6)**: `message.tsx` user bubble renders `file` parts — image thumbnail (reuse IndexedDB hydrate) + non-image chip (name + mediaType icon). Native v6 parts, NOT the legacy regex parser.
- **Persist (F8/F9)**: populate Convex `attachments:[{url,name,mediaType}]` on `messagesSend` (slot exists `schema.ts:66`, unused). Convex URL survives reload.

### Acceptance (P3)

- tsc/lint clean; 3001 boots; `npx convex dev` deploys (confirm before push — schema change).
- browser_snapshot E2E: attach image to minimax-m3 → upload to Convex (http URL in network tab) → send → model sees image → user bubble shows thumbnail → reload → thumbnail resolves (no dead blob). PDF to text model → chip + inline base64 to NIM. Non-VLM media picker disabled.

---

## P4 — Webfetch (webSearch + webFetch tools)

- Two tools in route `tools:{}`, **decoupled from `ENABLE_ARTIFACTS`**:
  - `webSearch` — Tavily REST (`TAVILY_API_KEY` in `.env.local`, copied from `~/.tavily/config.json`; mask in logs). Returns text + `sources` (emit `source-url` parts → P2 citation cards).
  - `webFetch` — raw `fetch(url)` + `@mozilla/readability` + `turndown` (HTML→md). Returns truncated md + `source-url`.
- Advertise web tools ALWAYS for text models where `capabilities[modelId].tools === true`; suppress for cosmos×2 (`supportsTools:false`). Add a web-tools section to `systemPrompt` (`prompts.ts`) — separate from the artifacts block, NOT coupled to `ENABLE_ARTIFACTS`.
- `stopWhen: stepCountIs(5)` stays (no `maxSteps` in v6).
- Route tool results through P2 generic tool-card + citation card.

### Acceptance (P4)

- tsc/lint clean; 3001 boots.
- browser_snapshot E2E: ask "search the web for X" → model calls `webSearch` → tool-call card (calling→result) → sources citation card → answer cites sources. `webFetch` on a URL → fetched md. Cosmos models: no web tools advertised.

---

## P5 — MCP Support

- Install `@ai-sdk/mcp`. Server-side `createMCPClient` in route, memoized per-server at module level (runtime `nodejs` pinned → stdio OK, but **ship remote HTTP/SSE servers only** — no arbitrary local binaries from the client). Env `MCP_SERVERS` CSV (mirrors `NIM_MODELS` pattern) → `lib/ai/mcp/registry.ts`.
- Merge MCP `.tools` into route `tools:{}` + `experimental_activeTools`. Decoupled from artifacts flag (same as P4).
- Settings toggle (env-gated start; runtime-configurable via Convex later).
- Start with the machinery + one default remote server. Generic tool-card (P2) renders MCP tool calls.

### Acceptance (P5)

- tsc/lint clean; 3001 boots.
- browser_snapshot E2E: `MCP_SERVERS=<remote-url>` env → model sees MCP tools → one fires → tool-call card renders → result. No MCP env → no MCP tools, zero overhead.

---

## Build + verify order

P1 → P2 → P3 → P4 → P5. Each: code → `pnpm tsc --noEmit` → lint → dev server (3001) → browser-snapshot E2E → smoke. `/loop` + workflows + ultracode throughout. Convex schema/config changes = `npx convex dev` (confirm before push). No git commits unless asked (git=false).
