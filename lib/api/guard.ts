// ═══════════════════════════════════════════════════════════════════════════
// Φ-docs · fail-closed access guard for costly generation routes.
//
// `/api/generate/image`, `/api/generate/video` and `/api/analyze/video` burn
// paid provider capacity, but historically accepted any caller (an anonymous
// browser could hammer NVIDIA). They're ALSO invoked server-side by the chat
// route (an already-authenticated route), where there is no browser session to
// re-verify. The guard therefore accepts TWO and only two identities:
//
//   1. A valid Clerk session (the normal signed-in user), or the BYPASS_CLERK
//      dev escape hatch (same trust model as app/api/chat::route).
//   2. An internal service token (`x-leopard-internal-token` ==
//      LEOPARD_INTERNAL_GEN_SECRET) which the chat route attaches on its own
//      server→server fetch. The token exists so server-internal calls keep
//      working after the gate.
//
// Anything else → 401, fail-closed. When LEOPARD_INTERNAL_GEN_SECRET is unset
// the internal path is inert; the Clerk/BYPASS_CLERK path still governs, so
// production rejects anonymous callers.
// ═══════════════════════════════════════════════════════════════════════════

import { auth } from "@clerk/nextjs/server";
import { BYPASS_CLERK, DEV_USER_ID } from "@/lib/dev-user";

function internalSecret(): string | undefined {
  return process.env.LEOPARD_INTERNAL_GEN_SECRET;
}

export function isInternalRequest(req: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const h = req.headers.get("x-leopard-internal-token");
  return !!h && h === secret;
}

/**
 * Fold the fail-closed gate into a route: accepts a signed-in session (or the
 * internal service token / BYPASS_CLERK dev path). Returns `{ ok:true, userId }`
 * on success, else `{ ok:false, res }` — return the res directly.
 */
export async function requireGenAccess(
  req: Request,
): Promise<{ ok: true; userId: string | null; internal: boolean } | { ok: false; res: Response }> {
  const secret = internalSecret();
  if (isInternalRequest(req, secret)) {
    return { ok: true, userId: null, internal: true };
  }

  let userId: string | null = null;
  try {
    const session = await auth();
    userId = session.userId ?? null;
  } catch {
    userId = null;
  }
  if (!userId && !BYPASS_CLERK) {
    return {
      ok: false,
      res: Response.json(
        { error: "Unauthorized — a signed-in session is required for generation." },
        { status: 401 },
      ),
    };
  }
  return { ok: true, userId: userId ?? DEV_USER_ID, internal: false };
}

/** Convenience: attach the internal token to a server-initiated fetch. */
export function internalHeaders(requestUrlOrigin?: string): Record<string, string> {
  const secret = internalSecret();
  return {
    "Content-Type": "application/json",
    ...(secret ? { "x-leopard-internal-token": secret } : {}),
  };
}