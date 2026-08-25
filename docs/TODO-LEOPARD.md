# Leopard Living TODO

Updated each wave. Never lose context — read this first after a break.

## DONE (verified + committed)
- [x] aui→leopard fork: 94 files in components/chat/leopard/ (theme seam = surfaces.tsx, amber remap, no aui runtime deps)
- [x] ReasoningBlock → ReasoningPanel (SwapLabel shimmer, effort chip, no brain icon)
- [x] ThinkingMessage → ThinkingIndicator
- [x] MessageActions (copy/like/dislike/regen icon-swap bar) wired
- [x] Deferred-create: /chat mints no row until first send; sidebar New Chat → /chat
- [x] Convex purgeEmpty mutation (ran once, 0 empty rows)
- [x] StreamItDown block-memoized live render (48ms commits, per-block parse)
- [x] Flat message pairs, mermaid hardening, composer glass (commit a8708c4)

## ACTIVE BUGS (reported 2026-08-25)
- [~] Double blinking caret → fixed: streaming flag now tail-segment only (verify in browser)
- [~] No amber streaming tint → leopard-fresh-tail on tail block (verify)
- [~] Regen: old reply vanished then reappeared → regenerateMessage deletes server row first (verify)
- [ ] Timer chip: live counter while streaming + final time (genMs exists — verify visible)
- [ ] Sidebar: new chat appears only after first send + renames via data-chat-title (verify)

## PLAN REMAINDER (docs/superpowers/plans/2026-08-25-aui-plugin-overhaul.md)
- [ ] Task 4: ToolCard → leopard ToolCall + WebSearch + Sources (delete ToolCard/MeshGlobe)
- [ ] Task 5: ToolGroup + ToolTimeline for multi-tool bursts
- [ ] Task 6: ToolError + chat-level ErrorState
- [ ] Task 7: ApprovalCard + server resume path (goal #1: permission cards)
- [ ] Task 8: Suggestions (empty + finished turns)
- [ ] Task 9: ComposerContext popover + attachment chips
- [ ] Task 10: MCP status dots + ReasoningControl hooks-order fix
- [ ] Task 11: anti-slop grep audit + next build + full sweep (dark+light)
- [ ] Task 12: apple-design audit + polish

## WATCHDOG AGENDA
P1.1 lazy tool loading · P1.2 model fallback · P2.3 bound memory top-N ·
P2.4 per-chat usage readout · OTel telemetry · structured outputs ·
NIM semantic memory (LEOPARD_SEMANTIC_MEMORY) · empty Convex test tables ·
re-read claude-code docs

## /goal gate
1. approval cards/resume 2. DB skills (done) 3. stale thinking card
4. math LaTeX 5. mermaid live rendering

## RULES
Local commits only, never push. Port 3001 (3000 = MAYA). Verify before commit.
