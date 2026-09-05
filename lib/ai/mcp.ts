// ═══════════════════════════════════════════════════════════════════════════
// MCP (Model Context Protocol) — external tool servers for the chat model.
//
// Ports the claude-code-docs mcp config + naming + gating model (docs/agent-sdk
// __mcp.md) onto the AI SDK's `@ai-sdk/mcp` client:
//   - Config: LEOPARD_MCP_SERVERS (JSON array) — operator-declarative, one
//     entry per server: { name, type: 'http'|'sse', url, headers? } or
//     { name, type: 'stdio', command, args?, env? }.
//   - Naming: tools surface as `mcp__<server>__<tool>` so approval rules can
//     scope them wholesale (e.g. TOOL_APPROVAL_RULES="^mcp__=deny") and the
//     audit trail records which server a tool came from.
//   - Gating: LEOPARD_MCP_ALLOWED_TOOLS (comma list with `*` wildcards) is an
//     OPTIONAL operator allowlist over the full `mcp__server__tool` names;
//     unset → all configured-server tools are exposed (and still hit the
//     per-tool toolApproval ask/deny gate in the route — the semi-agentic floor).
//   - Fail-closed: LEOPARD_MCP_SERVERS unset/invalid → NO MCP tools at all.
//     A per-server connect failure is logged + that server skipped; healthy
//     servers still contribute. Credentials in `headers`/`env` are never logged.
//
// Server-side only (Node route). Keeps the browser client zero-knowledge of MCP.
// ═══════════════════════════════════════════════════════════════════════════

import { createMCPClient, type MCPClient, type ListToolsResult } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";

export type McpServerConfig =
  | { name: string; type: "http" | "sse"; url: string; headers?: Record<string, string> }
  | { name: string; type: "stdio"; command: string; args?: string[]; env?: Record<string, string> };

/** A live MCP session: AI SDK tools (prefixed `mcp__server__tool`) + cleanup. */
export type McpHandle = {
  tools: Record<string, unknown>;
  toolNames: string[];
  serverNames: string[];
  instructions: string[];
  close(): Promise<void>;
};

const EMPTY: McpHandle = {
  tools: {},
  toolNames: [],
  serverNames: [],
  instructions: [],
  close: async () => {},
};

const errMsg = (e: unknown): string =>
  e instanceof Error ? e.message : e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);

function logWarn(msg: string, err?: unknown): void {
  const detail = err ? `: ${errMsg(err)}` : "";
  console.error(`[mcp] ${msg}${detail}`);
  try {
    const fs = require("node:fs");
    const p = process.env.LEOPARD_DEBUG_LOG;
    if (p) fs.appendFileSync(p, new Date().toISOString() + ` [mcp] ${msg}${detail}\n`);
  } catch {}
}

/** Parse LEOPARD_MCP_SERVERS → config list, or null when unset/invalid (fail-closed). */
export function parseMcpServers(envValue: string | undefined): McpServerConfig[] | null {
  if (!envValue) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(envValue);
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;
  const out: McpServerConfig[] = [];
  for (const s of raw) {
    if (!s || typeof s !== "object") continue;
    const rec = s as Record<string, unknown>;
    const name = typeof rec.name === "string" && rec.name.trim() ? rec.name.trim() : "";
    if (!name) continue;
    if ((rec.type === "http" || rec.type === "sse") && typeof rec.url === "string") {
      out.push({
        name,
        type: rec.type,
        url: rec.url,
        ...(rec.headers && typeof rec.headers === "object" ? { headers: rec.headers as Record<string, string> } : {}),
      });
    } else if (rec.type === "stdio" && typeof rec.command === "string") {
      out.push({
        name,
        type: "stdio",
        command: rec.command,
        ...(Array.isArray(rec.args) ? { args: rec.args.map(String) } : {}),
        ...(rec.env && typeof rec.env === "object" ? { env: rec.env as Record<string, string> } : {}),
      });
    }
  }
  return out.length ? out : null;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Match a `mcp__server__tool` name against LEOPARD_MCP_ALLOWED_TOOLS (comma
 * list, `*` wildcard per segment, e.g. `mcp__github__*`). Empty/unset → allow.
 */
// Φ-fallback/P1.1 · bound the MCP tool surface. External MCP servers can expose
// MANY tools with large JSON schemas, and on NIM (no prompt caching) every
// schema line reshots per request. LEOPARD_MCP_MAX_TOOLS caps the TOTAL number
// of `mcp__` tools mounted this request (deterministic server config order),
// so a chatty server can't bloat the request payload unboundedly. Default 48.
const MAX_TOOLS_DEFAULT = 48;

/** Resolve the per-request MCP tool cap from `LEOPARD_MCP_MAX_TOOLS` (default 48). */
export function maxMcpTools(env: string | undefined): number {
  const n = Number(env);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : MAX_TOOLS_DEFAULT;
}

export function isMcpToolAllowed(toolName: string, allowlistEnv: string | undefined): boolean {
  if (!allowlistEnv) return true;
  const patterns = allowlistEnv.split(",").map((p) => p.trim()).filter(Boolean);
  if (patterns.length === 0) return true;
  return patterns.some((pat) => {
    if (!pat.includes("*")) return pat === toolName;
    const re = new RegExp("^" + pat.split("*").map(escapeRe).join(".*") + "$");
    return re.test(toolName);
  });
}

/**
 * Connect every configured MCP server and expose its tools (prefixed) as an AI
 * SDK tool map. Best-effort per server: a failing server is skipped + logged,
 * never fatal to the generation. Returns EMPTY when unconfigured/fail-closed.
 */
export async function loadMcpTools(extraServers?: unknown): Promise<McpHandle> {
  // Env-configured servers first; caller-supplied extras (the MCP panel's
  // client-side config, dev-mode only — see route.ts) merge in after, env
  // winning name collisions.
  const envServers = parseMcpServers(process.env.LEOPARD_MCP_SERVERS) ?? [];
  const extra = Array.isArray(extraServers)
    ? (extraServers.filter(
        (s): s is McpServerConfig =>
          !!s &&
          typeof s === "object" &&
          typeof (s as { name?: unknown }).name === "string" &&
          ["http", "sse", "stdio"].includes(String((s as { type?: unknown }).type)),
      ) as McpServerConfig[])
    : [];
  const seen = new Set(envServers.map((s) => s.name));
  const servers = [...envServers, ...extra.filter((s) => !seen.has(s.name))];
  if (!servers.length) return EMPTY;
  const allowlistEnv = process.env.LEOPARD_MCP_ALLOWED_TOOLS;

  const clients: { name: string; client: MCPClient }[] = [];
  const tools: Record<string, unknown> = {};
  const toolNames: string[] = [];
  const instructions: string[] = [];
  // P1.1 · cap the total mounted MCP tool count across ALL servers (per-request
  // token economy on NIM — schemas reshot when there's no prompt caching).
  const budget = maxMcpTools(process.env.LEOPARD_MCP_MAX_TOOLS);
  let mounted = 0;

  for (const server of servers) {
    let client: MCPClient | null = null;
    try {
      const transport =
        server.type === "stdio"
          ? new Experimental_StdioMCPTransport({
              command: server.command,
              args: server.args,
              env: server.env,
            })
          : {
              type: server.type,
              url: server.url,
              ...(server.headers ? { headers: server.headers } : {}),
            };
      client = await createMCPClient({ transport, maxRetries: 2 });

      let defs: ListToolsResult;
      try {
        defs = await client.listTools();
      } catch (e) {
        logWarn(`MCP server '${server.name}' tools/list failed`, e);
        continue;
      }
      const filtered: ListToolsResult = {
        tools: defs.tools.filter((t) => isMcpToolAllowed(`mcp__${server.name}__${t.name}`, allowlistEnv)),
      };
      if (!filtered.tools.length) {
        await client.close();
        continue;
      }
      // Trim this server's contribution to the remaining budget BEFORE building
      // tool defs (deterministic order — don't construct unused schemas).
      const remaining = Math.max(0, budget - mounted);
      const trimmed: ListToolsResult = {
        tools: filtered.tools.slice(0, remaining),
      };
      if (!trimmed.tools.length) {
        await client.close();
        continue;
      }
      const set = client.toolsFromDefinitions(trimmed);
      for (const [toolName, tool] of Object.entries(set)) {
        const prefixed = `mcp__${server.name}__${toolName}`;
        if (mounted >= budget) break;
        tools[prefixed] = tool;
        toolNames.push(prefixed);
        mounted += 1;
      }
      if (client.instructions) instructions.push(`[${server.name}] ${client.instructions}`);
      clients.push({ name: server.name, client });
    } catch (e) {
      logWarn(`MCP server '${server.name}' connection failed`, e);
      try {
        await client?.close();
      } catch {}
    }
  }

  if (!clients.length) return EMPTY;
  return {
    tools,
    toolNames,
    serverNames: clients.map((c) => c.name),
    instructions,
    close: async () => {
      await Promise.allSettled(clients.map((c) => c.client.close()));
    },
  };
}

