// ═══ Upstream NIM concurrency governor ═══
// build.nvidia.com workers admit 32 concurrent requests; past that they throw
// ResourceExhausted ("Worker local total request limit reached (N/32)"),
// which surfaced to users as dead streams. Leopard fans out per message
// (attempts × fallback models + title calls), so a few users could blow the
// cap. This FIFO semaphore caps in-flight upstream calls below the ceiling;
// waiters time out with `upstream_busy` so the client shows a retryable error
// card instead of hanging forever.
//
// Process-local: under multi-instance deploys divide by instance count via
// NIM_MAX_IN_FLIGHT (e.g. 2 instances → 12 each).

const MAX_IN_FLIGHT = Number(process.env.NIM_MAX_IN_FLIGHT ?? 24);
const ACQUIRE_TIMEOUT_MS = 20_000;

let inFlight = 0;
type Waiter = { resolve: () => void; id: number };
const queue: Waiter[] = [];
let nextWaiterId = 1;

export class UpstreamBusyError extends Error {
  constructor() {
    super("upstream_busy");
    this.name = "UpstreamBusyError";
  }
}

export async function withUpstreamSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_IN_FLIGHT) {
    const me: Waiter = { resolve: () => {}, id: nextWaiterId++ };
    const acquired = await Promise.race([
      new Promise<"ok">((res) => {
        me.resolve = () => res("ok");
        queue.push(me);
      }),
      new Promise<"timeout">((res) =>
        setTimeout(() => res("timeout"), ACQUIRE_TIMEOUT_MS),
      ),
    ]);
    if (acquired === "timeout") {
      // Remove ourselves so a later release can't over-admit a dead waiter.
      const i = queue.findIndex((w) => w.id === me.id);
      if (i >= 0) queue.splice(i, 1);
      throw new UpstreamBusyError();
    }
  }
  inFlight++;
  try {
    return await fn();
  } finally {
    inFlight--;
    const next = queue.shift();
    if (next) next.resolve();
  }
}
