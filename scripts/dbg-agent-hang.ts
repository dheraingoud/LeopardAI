// @ts-nocheck
import * as dotenv from "dotenv";
dotenv.config({ path: ".env" }); dotenv.config({ path: ".env.local" });

async function main() {
  const { runOrchestration } = await import("../lib/ai/agents/orchestrator");
  const t0 = Date.now();
  const agents = await runOrchestration({
    toolCallId: "dbg",
    tasks: [{ name: "scout", kind: "research", task: "Find one fact about Next.js 16 caching." }],
    emit: (e) => console.log(`[t+${((Date.now()-t0)/1000).toFixed(1)}s] phase=${e.phase}`, e.agents.map(a=>`${a.name}:${a.status}${a.note?`(${a.note.slice(0,60)})`:""}`).join(" | ")),
  });
  console.log("DONE in", ((Date.now()-t0)/1000).toFixed(1), "s");
  console.log(JSON.stringify(agents, null, 1).slice(0, 1200));
  process.exit(0);
}
void main();
