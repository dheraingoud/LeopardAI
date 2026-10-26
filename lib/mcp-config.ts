"use client";

/**
 * McpConfig — persistence for the user's MCP server list (the "+ → mcp
 * servers" overlay). A mirror of Claude Code's `.claude/mcp.json` concept:
 * each server is a name + an endpoint.
 *
 * Two transports:
 *   - stdio  — `command` (e.g. `npx`/`node script.mjs`), spawned server-side.
 *   - http   — `url` (+ optional `headers`), an SSE/JSON-RPC endpoint.
 *
 * Persisted in Convex (`userPrefs.mcpServers`) through the prefs cache, so
 * the list follows the account instead of one browser.
 */

import { getPrefsSnapshot, writePrefs } from "./prefs-cache.ts";
import {
  asServerList,
  toWireServers,
  type McpServerConfig,
  type McpTransport,
} from "@/lib/mcp-wire";

export type { McpServerConfig, McpTransport };

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
  return asServerList(getPrefsSnapshot().mcpServers) ?? SAMPLES;
}

/** Enabled servers in the route's wire shape (lib/ai/mcp.ts McpServerConfig). */
export function getEnabledMcpServers(): Array<Record<string, unknown>> {
  return toWireServers(loadMcpConfig());
}

export function saveMcpConfig(servers: McpServerConfig[]): void {
  if (typeof window === "undefined") return;
  writePrefs({ mcpServers: servers });
}

let _seq = 0;
export function nextMcpId(): string {
  _seq += 1;
  return `mcp-${Date.now().toString(36)}-${_seq}`;
}

/** One-click presets shown under "add server" (copy-on-add). */
export const MCP_PRESETS: { name: string; server: Omit<McpServerConfig, "id" | "enabled"> }[] = [
  {
    name: "filesystem",
    server: { name: "filesystem", type: "stdio", command: "npx -y @modelcontextprotocol/server-filesystem ./" },
  },
  {
    name: "github",
    server: { name: "github", type: "http", url: "https://api.githubcopilot.com/mcp/" },
  },
  {
    name: "sequential-thinking",
    server: { name: "sequential-thinking", type: "stdio", command: "npx -y @modelcontextprotocol/server-sequential-thinking" },
  },
  {
    name: "convex",
    server: { name: "convex", type: "http", url: "https://your-deployment.convex.site/mcp" },
  },
];

/** Parse a user-pasted JSON array (or {"mcpServers":{...}}) into config rows. */
export function parseMcpJson(raw: string): { ok: true; servers: McpServerConfig[] } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Invalid JSON" };
  }
  const arr =
    Array.isArray(data)
      ? data
      : data && typeof data === "object" && Array.isArray((data as { mcpServers?: unknown }).mcpServers)
        ? (data as { mcpServers: unknown[] }).mcpServers
        : null;
  if (!arr) return { ok: false, error: "Expected an array (or { mcpServers: [...] })" };

  const servers: McpServerConfig[] = [];
  for (const rawItem of arr) {
    if (!rawItem || typeof rawItem !== "object") continue;
    const it = rawItem as Record<string, unknown>;
    const name = String(it.name || it.title || `server-${servers.length + 1}`).trim();
    const type: McpTransport = it.type === "stdio" ? "stdio" : it.type === "http" ? "http" : "http";
    const server: McpServerConfig = {
      id: nextMcpId(),
      name,
      type,
      command: type === "stdio" ? String(it.command ?? "").trim() || undefined : undefined,
      url: type === "http" ? String(it.url ?? it.endpoint ?? "").trim() || undefined : undefined,
      headers: it.headers && typeof it.headers === "object" ? (it.headers as Record<string, string>) : undefined,
      enabled: it.enabled !== false,
    };
    if ((type === "http" && !server.url) || (type === "stdio" && !server.command)) continue;
    servers.push(server);
  }
  if (servers.length === 0) return { ok: false, error: "No valid servers in JSON" };
  return { ok: true, servers };
}

export function toMcpJson(servers: McpServerConfig[]): string {
  return JSON.stringify({ mcpServers: servers }, null, 2);
}