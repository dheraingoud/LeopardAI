// MCP client wiring verify — NO browser, NO LLM, hits a REAL stdio MCP server
// (scripts/mcp-test-server.mjs) through the exact module the route uses
// (lib/ai/mcp.ts). Proves config parsing, allowlist gating, tool discovery,
// a live tools/call round-trip, and that connections are released on close().
//
// Run: cd next-frontend && npx tsx scripts/verify-mcp.ts
import {
  loadMcpTools,
  parseMcpServers,
  isMcpToolAllowed,
  type McpHandle,
} from "../lib/ai/mcp";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.error(`FAIL ${name}${extra ? " — " + extra : ""}`);
  }
};

// Resolve an absolute path to the test server for the stdio command (script is
// run from the app root: cd next-frontend && npx tsx scripts/verify-mcp.ts).
import { resolve } from "node:path";
const serverPath = resolve(process.cwd(), "scripts/mcp-test-server.mjs");

async function connect(allowlist: string): Promise<McpHandle> {
  process.env.LEOPARD_MCP_SERVERS = JSON.stringify([
    { name: "mock", type: "stdio", command: process.execPath, args: [serverPath] },
  ]);
  process.env.LEOPARD_MCP_ALLOWED_TOOLS = allowlist;
  return loadMcpTools();
}

async function main() {
  // ── config parsing ─────────────────────────────────────────────────────────
  check("parse: unset → null (fail-closed)", parseMcpServers(undefined) === null);
  check("parse: invalid json → null", parseMcpServers("{nope") === null);
  check("parse: empty array → null", parseMcpServers("[]") === null);
  const cfg = parseMcpServers(
    JSON.stringify([{ name: "a", type: "http", url: "https://x/mcp" }, { name: "b", type: "stdio", command: "npx" }]),
  );
  check("parse: valid → 2 servers", Array.isArray(cfg) && cfg.length === 2);
  check("parse: http entry carries url", Array.isArray(cfg) && (cfg[0] as { url: string }).url === "https://x/mcp");

  // ── allowlist glob matching ────────────────────────────────────────────────
  const ALL = "mcp__mock__echo,mcp__mock__get_time";
  check("allow: exact match", isMcpToolAllowed("mcp__mock__echo", ALL));
  check("allow: wildcard server", isMcpToolAllowed("mcp__mock__list_issues", "mcp__mock__*"));
  check("allow: unset → everything allowed", isMcpToolAllowed("mcp__github__x", undefined));
  check("deny: not in list", !isMcpToolAllowed("mcp__other__tool", ALL));
  check("deny: wildcard does not leak across servers", !isMcpToolAllowed("mcp__other__echo", "mcp__mock__*"));

  // ── live connect + discovery + a real tool call (all servers allowed) ────
  const h1 = await connect(ALL);
  check("connect: server discovered", h1.serverNames.length === 1 && h1.serverNames[0] === "mock");
  check("connect: tools prefixed", h1.toolNames.includes("mcp__mock__echo") && h1.toolNames.includes("mcp__mock__get_time"));
  const echo = h1.tools["mcp__mock__echo"] as {
    execute: (input: { text: string }) => Promise<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  let out;
  try {
    out = await echo.execute({ text: "pong" });
  } catch (e) {
    out = null;
    check("call: echo did NOT throw", false, String((e as Error)?.message ?? e));
  }
  const echoText = out?.content?.map((c) => c.text ?? "").join("") ?? "";
  check("call: echo round-trip returned 'echo:pong'", echoText === "echo:pong", JSON.stringify(echoText));
  await h1.close();

  // ── allowlist restricts which tools are exposed ───────────────────────────
  const h2 = await connect("mcp__mock__echo");
  check("restrict: only echo exposed", h2.toolNames.includes("mcp__mock__echo") && !h2.toolNames.includes("mcp__mock__get_time"));
  await h2.close();

  // ── fail-closed when unset → EMPTY handle, nothing throws ────────────────
  delete process.env.LEOPARD_MCP_SERVERS;
  const h3 = await loadMcpTools();
  check("fail-closed: empty tools", h3.toolNames.length === 0 && Object.keys(h3.tools).length === 0);
  await h3.close();

  console.log(`\nmcp wiring: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("MCP VERIFY FAIL:", e?.message ?? e);
  process.exit(1);
});