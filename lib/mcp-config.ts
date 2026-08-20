"use client";

/**
 * McpConfig — local persistence for the user's MCP server list (the "+ → mcp
 * servers" overlay). A browser-local mirror of Claude Code's
 * `.claude/mcp.json` concept: each server is a name + an endpoint.
 *
 * Two transports:
 *   - stdio  — `command` (e.g. `npx`/`node script.mjs`), spawned server-side.
 *   - http   — `url` (+ optional `headers`), an SSE/JSON-RPC endpoint.
 *
 * Persisted to localStorage under one key. Read-only until real server-side
 * tool loading is wired — the modal is the config surface; the transport
 * handshake ships when the SDK integration lands.
 */

export type McpTransport = "stdio" | "http";

export type McpServerConfig = {
  id: string;
  name: string;
  type: McpTransport;
  /** stdio: executable + args */
  command?: string;
  /** http: base URL (SSE or streamable-http) */
  url?: string;
  /** http: optional static headers (e.g. bearer token) */
  headers?: Record<string, string>;
  enabled: boolean;
};

const KEY = "leopard.mcp.servers.v1";

const SAMPLES: McpServerConfig[] = [
  {
    id: "sample-filesystem",
    name: "filesystem",
    type: "stdio",
    command: "npx -y @modelcontextprotocol/server-filesystem ./",
    enabled: true,
  },
  {
    id: "sample-convex",
    name: "convex",
    type: "http",
    url: "https://your-deployment.convex.site/mcp",
    enabled: false,
  },
];

export function loadMcpConfig(): McpServerConfig[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as McpServerConfig[]) : null;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    /* corrupted — fall through to samples */
  }
  return SAMPLES;
}

export function saveMcpConfig(servers: McpServerConfig[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(servers));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

let _seq = 0;
export function nextMcpId(): string {
  _seq += 1;
  return `mcp-${Date.now().toString(36)}-${_seq}`;
}