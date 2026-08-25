// Retry-gate verification for backgroundServe (docs/errors.md idempotency).
//
// Proves: when the FIRST model attempt produces NO content before it ends, the
// generation RE-INVOKES the streamFactory for a fresh attempt (bounded), emits a
// client-visible `retry` signal, and only commits the attempt that produced real
// output. Also proves the NEGATIVE: once content commits, the factory is never
// re-invoked (no duplicate side-effects).
//
// No env needed: without NEXT_PUBLIC_CONVEX_URL/CONVEX_DEPLOY_KEY, convexClient()
// stays null and persistence is a no-op — this tests the retry CONTROL FLOW only.
//
// Run: cd next-frontend && npx tsx scripts/verify-retry.ts
import { backgroundServe, createGenerationController } from "../lib/ai/server-generation";

type Chunk = { type?: string; [k: string]: unknown };

function fake(producer: () => Iterable<Chunk>, parts: unknown[] = []): any {
  return {
    toUIMessageStream: () => ({
      async *[Symbol.asyncIterator]() {
        for (const c of producer()) yield c;
      },
    }),
    parts,
  };
}

let fail = 0;
let pass = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.error(`FAIL ${name}${extra ? " — " + extra : ""}`);
  }
};

async function run() {
  // ── Case A: first attempt empty → factory re-invoked → attempt 2 commits ──
  let factoryCalls = 0;
  const streamFactory = () => {
    factoryCalls++;
    if (factoryCalls === 1) {
      // attempt 1: streams ONLY structural chunks, zero model output
      return Promise.resolve(
        fake(() => [
          { type: "text-start", id: "t1" },
          { type: "text-end", id: "t1" },
        ]),
      );
    }
    // attempt 2: real output
    return Promise.resolve(
      fake(
        () => [
          { type: "text-start", id: "t2" },
          { type: "text-delta", id: "t2", delta: "recovered " },
          { type: "text-delta", id: "t2", delta: "on attempt 2" },
          { type: "text-end", id: "t2" },
        ],
        [{ type: "text", text: "recovered on attempt 2" }],
      ),
    );
  };

  const received: Chunk[] = [];
  const gen = backgroundServe({
    streamFactory,
    maxAttempts: 3,
    sendReasoning: true,
    assistantId: "retry-test-" + Date.now(),
    chatId: "a",
    userId: "retry-user",
    model: "unit",
    abortController: createGenerationController("retry-test"),
  });
  gen.subscribe((c) => received.push(c));
  await gen.done;

  check("factory invoked exactly twice (1 empty + 1 success)", factoryCalls === 2, `calls=${factoryCalls}`);
  const hasRetrySignal = received.some((c) => c.type === "data-retry");
  check("a `retry` signal chunk was emitted", hasRetrySignal);
  const retried = received.find((c) => c.type === "data-retry") as Chunk | undefined;
  check("retry signal carries attempt/maxRetries for UX", !!retried && typeof retried.attempt === "number" && typeof retried.maxRetries === "number");
  const text = received
    .filter((c) => c.type === "text-delta")
    .map((c) => c.delta)
    .join("");
  check("text from attempt 2 landed", text === "recovered on attempt 2", JSON.stringify(text));
  check("no error emitted on the winning path", !received.some((c) => c.type === "error"));

  // ── Case B: committed content → factory NOT re-invoked (idempotent) ───────
  let factoryCallsB = 0;
  const streamFactoryB = () => {
    factoryCallsB++;
    return Promise.resolve(
      fake(() => [
        { type: "text-delta", id: "t", delta: "committed immediately" },
        { type: "tool-call-start", id: "tc", toolCallId: "c", toolName: "webSearch" },
        { type: "tool-call-end", id: "tc", toolCallId: "c", toolName: "webSearch", args: {} },
      ]),
    );
  };
  const receivedB: Chunk[] = [];
  const genB = backgroundServe({
    streamFactory: streamFactoryB,
    maxAttempts: 5,
    sendReasoning: true,
    assistantId: "retry-test-b-" + Date.now(),
    chatId: "a",
    userId: "retry-user",
    model: "unit",
    abortController: createGenerationController("retry-test-b"),
  });
  genB.subscribe((c) => receivedB.push(c));
  await genB.done;
  check("committed turn does NOT retry (idempotency)", factoryCallsB === 1, `calls=${factoryCallsB}`);
  check("no retry signal on committed turn", !receivedB.some((c) => c.type === "data-retry"));

  console.log(`\nretry gate: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("VERIFY FAIL:", e?.message ?? e);
  process.exit(1);
});