// Φ-docs · deep-research worker verify — pure, no live model / no network:
// injection drives the full plan→search→synthesize loop with canned responses.
//
// Run: cd next-frontend && npx tsx scripts/verify-research.ts
import {
  spawnResearch,
  getResearchJob,
  parsePlan,
  type LLMCall,
  type SearchCall,
} from "../lib/ai/research/worker";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.error(`FAIL ${name}${extra ? " — " + extra : ""}`);
  }
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function waitDone(id: string, ms = 6000): Promise<any> {
  const deadline = Date.now() + ms;
  let j: any = null;
  while (Date.now() < deadline) {
    j = getResearchJob(id);
    if (j && (j.status === "done" || j.status === "error")) return j;
    await sleep(30);
  }
  return j;
}

function main() {
  // parsePlan unit
  check("plan: strips bullets + numbers", parsePlan("- Alpha\n2. Beta\n3) Gamma", "q").length === 3);
  check("plan: blank/empty → fallback", parsePlan("\n\n   \n", "q").join() === "q");
  check("plan: caps at MAX", parsePlan(Array.from({ length: 30 }, (_, i) => `${i}. q${i}`).join("\n"), "q").length <= 6);

  return (async () => {
    let searches = 0;
    const search: SearchCall = async (q) => {
      searches++;
      return [{ title: `Title ${q}`, url: `https://example.com/${encodeURIComponent(q)}`, content: `Snippet about ${q}.` }];
    };
    const llm: LLMCall = async (prompt, opts) =>
      prompt.includes("Break this down into searchable")
        ? "First sub query\nSecond sub query\nThird sub query"
        : "## Report\n# Synthesis\nDeep, sourced findings about Q.";

    const { id } = spawnResearch({ query: "Q", modelId: "unused-model", deps: { llm, search, now: () => 100 } });

    // Detached: spawn returns a queued job well before the loop finishes.
    const immediate = getResearchJob(id);
    check("detached: spawn returned a jobId", id.startsWith("rsch_"));
    check("detached: not yet done at spawn", immediate?.status === "queued" || immediate?.status === "running");

    const done = await waitDone(id);
    check("loop: reached done", done?.status === "done", done?.error ? `err: ${done.error}` : "");
    check("loop: report synthesized", !!done?.report && done.report.includes("Report"), done?.report?.slice(0, 60));
    check("loop: planned 3 sub-queries", done?.totalSteps === 3, `totalSteps=${done?.totalSteps}`);
    check("loop: progress step == total", done?.step === 3);
    check("loop: search ran per sub-query", searches === 3, `searches=${searches}`);
    check("loop: step labels stored", Array.isArray(done?.steps) && done.steps.length === 3);

    // Error path: search returns nothing → explicit error, never silent.
    const e = spawnResearch({
      query: "Q",
      modelId: "m",
      deps: { llm, search: async () => [], now: () => 200 },
    });
    const errored = await waitDone(e.id);
    check("error: empty evidence → status error", errored?.status === "error");
    check("error: message present", !!errored?.error);

    console.log(`\ndeep-research (injected): ${pass} pass, ${fail} fail`);
    process.exit(fail > 0 ? 1 : 0);
  })().catch((err) => {
    console.error("RESEARCH VERIFY FAIL:", err?.message ?? err);
    process.exit(1);
  });
}

main();