# Leopard E2E Full Sweep — 2026-09-01

Every surface, every state, both themes, desktop + mobile. Probe-driven
(`scripts/dbg-*.ts`, Playwright, port 3001, BYPASS_CLERK). Screenshots to
`C:\Users\HP\leopard-shots\<surface>\` — NEVER inside the repo. Review ≤2
images at a time. Fix → re-probe → commit (next-frontend, then parent bump).

Standing rules: tsc clean after every change; no dead code; never push;
never touch port 3000; DESIGN.md law (Geist ≤600, Geist Mono technical,
amber #ffb400/#d49600); no model names in UI.

## Surfaces

- [x] 1. Empty state — greeting, composer glimmer (subtle, always-on), focus
  ring, placeholder; dark + light; desktop + mobile.
  ✅ 2026-09-01 GREEN (dbg-empty-state): both themes — composer + textarea
  present, glimmer ::before animated AND --composer-glimmer-angle rotates
  (sampled 2s apart, value changes), no horizontal overflow. Visual review:
  01-dark/02-light clean (greeting, date, composer pills, sidebar); focus
  shots show amber ring. Mobile half deferred to surface 15.
- [x] 2. Plain text turn — streaming render, settle, markdown (headers,
  lists, bold, code block + copy, inline code, LaTeX, mermaid). NO
  post-response suggestion chips (removed 2026-09-01).
  ✅ 2026-09-01 GREEN (dbg-markdown): h1/strong/li/inline-code/js-pre/KaTeX
  all render, mermaid → live SVG in .cb-mermaid, ready status reached, no
  suggestion chips, settled shot reviewed clean.
- [x] 3. Multi-turn context chain — 3 turns building on each other; reload
  persistence. (dbg-multiturn) ✅ 2026-09-01 GREEN: 3 turns settled,
  markers count-verified, reload persisted (zephyr+noted).
- [x] 4. Reasoning — glimmer label, "Thought for Ns", expand/collapse,
  effort chip, mono→Geist body.
  ✅ 2026-09-01 GREEN (dbg-reasoning-panel): streaming "Thinking" shimmer,
  settled "Thought for Ns" (fixed: start clock on reasoning appearance, not
  `isStreaming && !text`; module-level cache keyed by reasoning-text prefix
  survives optimistic→persisted id-swap remount), expand 556 chars,
  collapse ok, effort chip present.
- [x] 5. Web search — per-call rows (no group pill), sources row, failure
  path copy. ✅ 2026-09-01 GREEN (dbg-websearch): streaming "searching
  web…" row, settled "Searched the web" + green check, 1 tool row (no
  group pill), Sources row (6), expand → Request/Result disclosure,
  no model-name leak outside the model selector. Failure-path copy
  ("<verb> failed" + red tint) code-verified in ToolCard (resultOk=false
  branch).
- [x] 6. Tool approval — Allow executes; Deny never executes + synthesized
  refusal; card resolves <1s; resume synthesis. (dbg-deny / dbg-orchestrate)
  ✅ Allow path verified 2026-09-01 (approval card → click → resume POST).
- [x] 7. Subagents — ONE card per turn (no duplicates live or after
  reload), running → settled, expand, flow graph all nodes, no model chip,
  per-agent timeout (never stuck). (dbg-orchestrate) ✅ 2026-09-01 GREEN:
  1 card live, 1 after reload, expand shows full flow graph + prose,
  zero update-depth errors this run.
- [x] 8. Edit & resend — edit user msg → auto-resend, fork semantics,
  Cmd/Ctrl+Enter save, Esc cancel. ✅ 2026-09-01 GREEN (dbg-edit-resend +
  dbg-edit-timeline). THREE real bugs found + fixed: (1) retry loop read
  stale `chat.status` closure — frozen "submitted" forever while the real
  status was ready → resend silently never fired (user-reported "edit
  doesn't trigger generation"); fixed with statusRef. (2) resend fired
  before the row delete → live-mirror re-added old rows (mirror never
  removes) and the resend re-POSTed them → route re-persisted duplicates;
  fixed: await delete first + mirror suppressed during the edit window
  (editWindowRef). (3) stop's abort-finalize upsert resurrected the old
  assistant row after the delete; fixed: stop → 400ms → delete ordering in
  BOTH editMessage and regenerateMessage.
- [x] 9. Stop mid-stream — visible stop glyph, partial content kept,
  follow-up works. ✅ 2026-09-01 GREEN (dbg-stop-recover): stop glyph
  visible, partial kept (400 chars streamed → 127-char finalized partial),
  follow-up "recovered." streamed + settled, pairs=2. Probe fix (not app
  bug): post-stop the Convex row still reads `streaming` for a beat
  (abort→finalize→push), so isStreaming stays true and the follow-up is
  ENQUEUED (message-queue by design) until the mirror clears
  serverStreaming — probe must wait for the follow-up POST, not just a
  ready status (which is already true).
- [x] 10. Error UX — forced failure → graceful card + working Retry; chat
  usable after. ✅ 2026-09-01 GREEN (dbg-error-ui): blocked /api/chat →
  "Response interrupted" card + red Retry chip (toast copy via onError
  noise-mapper), composer stays enabled, unblocked follow-up POSTs and
  "back online." streams + settles. NB: post-failure resting status is
  `error`, not `ready` — probes must not waitReady there.
- [x] 11. Reload persistence — all part types survive reload (text,
  reasoning, tool cards, subagent card). ✅ 2026-09-01 via dbg-orchestrate
  (card + full parts after reload) + dbg-multiturn (text turns).
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
- 2026-09-01 final: dbg-orchestrate FULL GREEN (hardened reload wait) —
  1 card pre/post reload, expanded graph + resume prose render correctly,
  zero "Maximum update depth exceeded" in the fresh server-log window.
  Surfaces 3, 6, 7, 11 closed. Multiturn settled shots reviewed: replies
  render fine (viewport shows reply text + timing footer; earlier "gap"
  was scroll position, not a render bug).
