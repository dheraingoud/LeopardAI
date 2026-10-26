// Leopard MCP wire helpers — the pure parts of the MCP config that both the
// browser (config panel) and the server (chat route) need. stdio commands are split because the AI SDK spawns `command` as one path ("node script.mjs" would ENOENT).

export type McpTransport = "stdio" | "http";

export type McpServerConfig = {
  id: string;
  name: string;
  type: McpTransport;
  command?: string;
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
};

export function splitCommand(cmd: string): { command: string; args: string[] } {
  const parts = cmd.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  const unq = parts.map((p) => p.replace(/^"|"$/g, ""));
  return { command: unq[0] ?? cmd, args: unq.slice(1) };
}

export function toWireServers(
  servers: McpServerConfig[],
): Array<Record<string, unknown>> {
  return servers
    .filter((s) => s.enabled)
    .map((s) => ({
      name: s.name,
      type: s.type,
      ...(s.type === "stdio" && s.command ? splitCommand(s.command) : {}),
      ...(s.type === "http" && s.url ? { url: s.url } : {}),
      ...(s.headers ? { headers: s.headers } : {}),
    }));
}

export function asServerList(value: unknown): McpServerConfig[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter(
    (row): row is McpServerConfig =>
      !!row && typeof row === "object" && typeof (row as McpServerConfig).name === "string",
  );
}
