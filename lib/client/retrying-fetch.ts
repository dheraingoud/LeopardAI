// ═══════════════════════════════════════════════════════════════════════════
// Φ-docs · authenticated fetch with token-refresh-once.
//
// Expired Clerk sessions make authed API calls 401. The clean fix is to refresh
// the token (reissue, skipCache) and retry ONCE — but only when the request
// carried a token we can refresh. `retryOnceAuth` is a pure, DI-driven core so
// the retry policy is unit-testable without a browser or Clerk; `retryingFetch`
// is the thin browser wrapper over window.fetch + a caller-supplied getToken().
//
// Statuses treated as "token problem": 401, 419 (Clerk expired-token), 498.
// ═══════════════════════════════════════════════════════════════════════════

export const AUTH_STATUSES: ReadonlySet<number> = new Set([401, 419, 498]);

const isAuthStatus = (s: number): boolean => AUTH_STATUSES.has(s);

export interface RetryOnceDeps {
  /** First request, carrying the (maybe-expired) token. */
  run: (token: string | undefined) => Promise<{ status: number }>;
  /** Current token (undefined => not authed). */
  getToken: () => Promise<string | undefined>;
  /** Refresh + return the new token (or undefined if refresh failed). */
  refreshToken: () => Promise<string | undefined>;
}

export type RetryOnceResult = { status: number; retried: boolean };

/** Core retry policy: refresh once on an auth status, re-issue, retry once.
 * Never retries when there was no token to refresh; never loops. */
export async function retryOnceAuth(deps: RetryOnceDeps): Promise<RetryOnceResult> {
  const token = await deps.getToken();
  const first = await deps.run(token);

  if (!isAuthStatus(first.status) || !token) {
    return { status: first.status, retried: false };
  }

  // Token present but rejected → it's stale. Refresh once, retry once.
  const fresh = await deps.refreshToken().catch(() => undefined);
  if (!fresh) return { status: first.status, retried: false };

  const second = await deps.run(fresh);
  return { status: second.status, retried: true };
}

/**
 * Browser helper over window.fetch: adds `Authorization: Bearer` from the
 * provided getToken(), and refreshes + retries once on an auth-status response.
 * Returns the LAST response actually made.
 */
export async function retryingFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  opts: { getToken: () => Promise<string | undefined>; refreshToken: () => Promise<string | undefined> },
): Promise<Response> {
  let last: Response | null = null;
  const run = async (token: string | undefined): Promise<{ status: number }> => {
    const headers = new Headers(init?.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(input, { ...init, headers });
    last = res;
    return { status: res.status };
  };

  await retryOnceAuth({ run, getToken: opts.getToken, refreshToken: opts.refreshToken });
  return last!;
}