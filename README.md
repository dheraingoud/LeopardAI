# Leopard

Leopard is a fast, local-first AI chat client built on Next.js, the Vercel AI SDK, and Convex.

## Features

- **Multi-model chat** via NVIDIA NIM (reasoning on/off per model, model picker with effort tiers)
- **Detached server-side generation** — replies survive reloads and closed tabs; stop/resume anywhere
- **Artifacts** — createDocument streams documents into a side panel (live preview, download, rehydrate after reload)
- **Tool approvals** — AskCard gate for risky tools with allow/deny resume
- **MCP server bridge** — add MCP servers (stdio/http) from the composer panel; their tools reach the model
- **Orchestration** — spawn parallel research agents (multi-agent turns)
- **Memory, output styles, context compaction** (flag-gated)
- **Sidebar** — search, rename, unread/generating indicators, delete

## Stack

- Next.js (App Router) + React, Vercel AI SDK (useChat + streamText)
- Convex (messages, chats, documents, memory) — dev/prod deployment split
- Clerk auth (dev bypass via `BYPASS_CLERK`)
- NIM upstream for models

## Development

```bash
npm install
npx next dev -p 3001
```

Key env vars (see `.env.example`): `NVIDIA_API_KEY`, `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOY_KEY` (prod) / `CONVEX_DEPLOY_KEY_DEV` (dev deployment), feature flags (`ENABLE_ARTIFACTS`, `ENABLE_TOOL_APPROVAL`, `LEOPARD_MULTI_AGENTS`, `LEOPARD_MEMORY`, …).

Dev vs prod Convex: local dev points at the dev deployment (`patient-elephant-642`); production picks up the prod deployment from Vercel env (`expert-vulture-839`). Schema/function changes: `npx convex dev`/`deploy` against dev first, verify, then prod.

## QA

Browser probe suite lives outside the repo (Playwright, `leopard-shots/qa/`): x1 detached lifecycle, x2 approval edges, x3 NIM quirks, x4 artifacts, x5 MCP bridge, x6–x8 extras, x9 sidebar flags, x10 probe handles.
