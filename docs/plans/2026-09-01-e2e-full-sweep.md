# Leopard E2E Full Sweep — 2026-09-01

Every surface, every state, both themes, desktop + mobile. Probe-driven
(`scripts/dbg-*.ts`, Playwright, port 3001, BYPASS_CLERK). Screenshots to
`C:\Users\HP\leopard-shots\<surface>\` — NEVER inside the repo. Review ≤2
images at a time. Fix → re-probe → commit (next-frontend, then parent bump).

Standing rules: tsc clean after every change; no dead code; never push;
never touch port 3000; DESIGN.md law (Geist ≤600, Geist Mono technical,
amber #ffb400/#d49600); no model names in UI.

## Surfaces

- [ ] 1. Empty state — greeting, composer glimmer (subtle, always-on), focus
  ring, placeholder; dark + light; desktop + mobile.
- [ ] 2. Plain text turn — streaming render, settle, markdown (headers,
  lists, bold, code block + copy, inline code, LaTeX, mermaid). NO
  post-response suggestion chips (removed 2026-09-01).
- [ ] 3. Multi-turn context chain — 3 turns building on each other; reload
  persistence. (dbg-multiturn)
- [ ] 4. Reasoning — glimmer label, "Thought for Ns", expand/collapse,
  effort chip, mono→Geist body.
- [ ] 5. Web search — per-call rows (no group pill), sources row, failure
  path copy.
- [ ] 6. Tool approval — Allow executes; Deny never executes + synthesized
  refusal; card resolves <1s; resume synthesis. (dbg-deny / dbg-orchestrate)
- [ ] 7. Subagents — ONE card per turn (no duplicates live or after
  reload), running → settled, expand, flow graph all nodes, no model chip,
  per-agent timeout (never stuck). (dbg-orchestrate)
- [ ] 8. Edit & resend — edit user msg → auto-resend, fork semantics,
  Cmd/Ctrl+Enter save, Esc cancel.
- [ ] 9. Stop mid-stream — visible stop glyph, partial content kept,
  follow-up works. (dbg-stop-recover)
- [ ] 10. Error UX — forced failure → graceful card + working Retry; chat
  usable after. (dbg-error-ui, dbg-fail-recover)
- [ ] 11. Reload persistence — all part types survive reload (text,
  reasoning, tool cards, subagent card). 
- [ ] 12. Sidebar — history list, switch chats, new chat; always-on.
- [ ] 13. Model selector — 8 models, switch, popover styling both themes.
  (dbg-light-selector)
- [ ] 14. Composer extras — @mention menu, quote-reply pill, attachments
  UI, send disabled states, feedback (👍/👎 + modal), copy button.
- [ ] 15. Mobile 390×844 — no horizontal overflow, composer usable, stream
  settles. (dbg-mobile)
- [ ] 16. Theme toggle — no flash, tokens swap clean.
- [ ] 17. Auto-scroll — pinned during stream + layout growth
  (ResizeObserver).
- [ ] 18. Full dark sweep + light sweep regression. (dbg-visual-sweep,
  dbg-visual-sweep-light)

## Log

- 2026-09-01 eve: dbg-orchestrate live run found (a) 3 agent-run-cards live
  (dup across messages, NOT seg-level — dedup only splices within one
  message's parts), (b) React "Maximum update depth exceeded" x2 during run
  (infinite setState loop, suspect live-mirror effect in use-active-chat),
  (c) reload = 0 cards was a FALSE ALARM (probe counted at 1.5s before
  Convex hydration; dbg-orch-parts with body-text wait shows 1 card + full
  parts persisted correctly).
- 2026-09-01: suggestions removed (message.tsx + suggestions.tsx deleted);
  composer glimmer restored subtle (composer-glimmer CSS, 8s conic sweep,
  reduced-motion off). dbg-multiturn + dbg-orchestrate re-pointed to
  external shots dir.
- 2026-09-01 late: (a) dup AgentRunCard FIXED via cross-message
  `hideSpawnCard` gate (messages.tsx lastSpawnIdx + message.tsx prop) —
  rerun: 1 card live, 0 update-depth errors (loop was dup-card side effect,
  gone after dedup). (b) multiturn "turn-2 no reply" ROOT-CAUSED: not an app
  bug — nemotron streams occasionally run 5+ min; probe pressed Enter
  mid-stream → message queued (by design, message-queue.tsx) → read as
  missing reply. Probe hardened: waits __chatStatus==="ready" pre-send,
  marker occurrence-counts (user prompts echo markers), POST /api/chat
  watch, body dump on timeout, hydration waits before reload assertions.
  (c) dbg-draft-flow + dbg-status-stuck probes prove draft→nav→pickup→ready
  and existing-chat send both settle clean.
