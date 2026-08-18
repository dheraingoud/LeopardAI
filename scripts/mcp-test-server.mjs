// Minimal in-repo MCP server used by scripts/verify-mcp.ts to prove the
// LEOPARD MCP client wiring end-to-end over stdio: tools/list + a live
// tools/call round-trip through real stdio pipes. NOT part of the app runtime.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "leopard-mcp-test", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

const TOOLS = [
  {
    name: "echo",
    description: "Returns the text you pass unchanged.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
  },
  {
    name: "get_time",
    description: "Returns a stable mock timestamp string.",
    inputSchema: { type: "object", properties: {} },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = req.params.arguments ?? {};
  if (name === "echo") {
    return { content: [{ type: "text", text: "echo:" + String(args.text ?? "") }] };
  }
  if (name === "get_time") {
    return { content: [{ type: "text", text: "mock-time: 2026-08-18T00:00:00Z" }] };
  }
  return { content: [{ type: "text", text: `unknown tool '${name}'` }], isError: true };
});

const transport = new StdioServerTransport();
await server.connect(transport);