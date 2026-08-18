// Φ-docs · fail-closed guard verify — pure logic that doesn't need Clerk or a
//   server: the token-refresh-once retry policy (retryOnceAuth, DI-driven) and
//   the internal-token recognizer (isInternalRequest).
//
// Run: cd next-frontend && npx tsx scripts/verify-guard.ts
import { retryOnceAuth } from "../lib/client/retrying-fetch";
import { isInternalRequest } from "../lib/api/guard";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (ok) pass++;
  else {
    fail++;
    console.error(`FAIL ${name}${extra ? " — " + extra : ""}`);
  }
};

async function main() {
  // Happy path: 200, no retry.
  const happy = await retryOnceAuth({ run: async () => ({ status: 200 }), getToken: async () => "t", refreshToken: async () => "t2" });
  check("retry: 200 does not retry", happy.status === 200 && !happy.retried);

  // Stale token → 401 → refreshed once → 200.
  let runs = 0;
  let refreshes = 0;
  const stale = await retryOnceAuth({
    run: async () => ({ status: ++runs === 1 ? 401 : 200 }),
    getToken: async () => "t",
    refreshToken: async () => { refreshes++; return "t2"; },
  });
  check("retry: 401 refreshed + retried once", stale.status === 200 && stale.retried);
  check("retry: exactly one refresh", refreshes === 1);
  check("retry: exactly two requests", runs === 2);

  // No token at all → no retry, keep 401.
  const notoken = await retryOnceAuth({ run: async () => ({ status: 401 }), getToken: async () => undefined, refreshToken: async () => "t2" });
  check("retry: no token → no retry", notoken.status === 401 && !notoken.retried);

  // Refresh fails → no retry, keep 419, one request touched.
  let rf = 0;
  const refreshfail = await retryOnceAuth({
    run: async () => ({ status: 419 }),
    getToken: async () => "t",
    refreshToken: async () => { rf++; return undefined; },
  });
  check("retry: refresh failure → keep auth status", refreshfail.status === 419 && !refreshfail.retried);
  check("retry: refresh failure touched once", rf === 1);

  // 500 is NOT an auth status → no retry.
  const nopage = await retryOnceAuth({ run: async () => ({ status: 500 }), getToken: async () => "t", refreshToken: async () => "t2" });
  check("retry: 500 not retried", nopage.status === 500 && !nopage.retried);

  // Internal token recognizer.
  const mk = (h?: string) => new Request("http://x", { headers: h ? { "x-leopard-internal-token": h } : {} });
  check("internal: matching token allowed", isInternalRequest(mk("abc123"), "abc123"));
  check("internal: wrong token denied", !isInternalRequest(mk("nope"), "abc123"));
  check("internal: missing header denied", !isInternalRequest(mk(), "abc123"));
  check("internal: no secret configured → denied", !isInternalRequest(mk("abc123"), undefined));

  console.log(`\nfail-closed guard: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("GUARD VERIFY FAIL:", e?.message ?? e);
  process.exit(1);
});