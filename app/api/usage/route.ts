// Φ-docs / P2.4 · per-chat usage readout.
//
// GET /api/usage?chatId=<clientChatUuid>
//   → { count, totalTokens, totalInputTokens, totalOutputTokens,
//       totalDurationMs, estimatedCostUsd, rows: [...] }
//
// Showcases the per-chat cost/token/turn observability the detached background
// task already records (usageLog rows). Auth: the same fail-closed guard as the
// generation routes — Clerk session (cookie), BYPASS_CLERK dev path, or the
// internal service token. Scoped to the CALLER's own rows (server queries by
// userId = the authed user), so a user can only read their own usage.
import { requireGenAccess } from "@/lib/api/guard";
import { listChatUsage } from "@/lib/ai/server-generation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  let chatId: string;
  try {
    chatId = new URL(request.url).searchParams.get("chatId") ?? "";
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  if (!chatId) {
    return Response.json({ error: "`chatId` (string) is required." }, { status: 400 });
  }

  const g = await requireGenAccess(request);
  if (!g.ok) return g.res;
  const userId = g.userId ?? "";
  if (!userId) {
    return Response.json({ error: "usage requires a user to scope to" }, { status: 401 });
  }

  const usage = await listChatUsage({ userId, chatId });
  if (!usage) {
    return Response.json(
      { error: "Usage store is unavailable (admin key not configured)." },
      { status: 503 },
    );
  }
  return Response.json(usage);
}