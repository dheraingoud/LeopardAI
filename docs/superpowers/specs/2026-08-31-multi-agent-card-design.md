# Multi-agent orchestration card — design

2026-08-31 · status: approved (hybrid trigger, approach A)

## Goal

User asks to research / find something multi-source → master model proposes
spawning subagents → approval card → N lighter-model subagents run → an
**inline card** in the message stream shows agent count, live per-agent
activity, and progress. Expandable for detail. Not a chat-inside-a-chat.

## Trigger (hybrid)

- Master model gets a `spawn_agents` tool:
  `tasks: [{ name, kind, task }]` where `kind` is
  `"research" | "write" | "verify" | "general"`. Agents are MULTIPURPOSE —
  one can gather info, one drafts a doc, one verifies the master's work,
  etc., in any combination. Research-kind agents get web search; the rest
  run LLM-only with the shared task context.
- System prompt steers it to genuinely parallelizable multi-part work.
- Tool call is gated by the existing approval-card machinery
  (resolvePendingApprovalRowId) — user approves before spawn.

## Stream protocol

New typed data parts on the existing chat stream (AI SDK data parts):

- `data-orchestration` `{ phase: "proposed", agents: [{id, name, task}] }`
- `data-orchestration` `{ phase: "agent", id, status: "running"|"done"|"error", note? }`
- `data-orchestration` `{ phase: "handoff", from, to, reason }`
- `data-orchestration` `{ phase: "synthesizing" }`
- `data-orchestration` `{ phase: "done", summary }`

Parts are transient-rendered (live card) and persisted with the message so a
reload shows the final settled card.

## Backend

New `lib/ai/agents/orchestrator.ts` (reuses the research worker's injectable
llm/search defaults, not a second job system):

- On approved `spawn_agents`, each named subagent runs a bounded agentic
  loop (utility model, stepCountIs(5)) with the app's read-side tools
  (web search + web fetch) and prior agents' outputs as context — chains
  like research → write → verify compose. Sequential to respect NIM rate
  limits; data parts stream per transition.
- Subagents are TEMPORARY and have no chat display. Everything user-visible
  (final text, code blocks, artifacts) is the master model's job: it gets
  compacted per-agent outputs as the tool result and synthesizes normally.

## Inline card UI (mounts 6 orphan fork components)

`AgentRunCard` (new, `components/chat/leopard/agent-run-card.tsx`):

- Collapsed: header "N agents · running/done" + live `SubagentList` (per-agent
  progress bars + spinner).
- Expanded: `FlowGraph` (orchestration DAG: spawn → agents → synthesis),
  `AgentHandoff` chips for handoff events, per-agent `AgentCard` rows.
- Done state: synthesis text renders normally; footer shows
  `ConfidenceMarker` on key claims + `ScoreBreakdown` (coverage/quality).

All components themed with existing amber tokens; no new colors.

## Error handling

- Subagent failure → agent row error state, orchestrator continues, synthesis
  notes the gap.
- Stream abort → card freezes in last state with "interrupted" marker.

## Testing

- tsc clean.
- Playwright probe: prompt forcing the tool call, approve, screenshot card
  running + settled, expand, both themes.
- Reload → settled card persists.
