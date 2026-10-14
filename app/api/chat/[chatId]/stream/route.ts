// ═══ GET /api/chat/[chatId]/stream — resumable-stream re-attach ══════════════
//
// AI SDK v7's resume path: chat.resumeStream() → transport.reconnectToStream()
// → GET {api}/{chatId}/stream. DefaultChatTransport builds that URL itself, so
// this route must live at exactly this path.
//
// What it serves: the LIVE chunk log of the detached generation the POST route
// started (backgroundServe — lib/ai/server-generation). The handle's subscribe()
// replays every chunk emitted so far (start/text/tool/finish…) and then streams
// live ones, so a reloaded client rebuilds the assistant bubble instead of
// polling Convex patches. The replayed `start` chunk carries streamText's
// INTERNAL message id — patched here to the persisted assistant row id so the
// SDK's resume processing REPLACES the hydrated Convex row in place (the SDK
// matches by id on every write), instead of appending a duplicate bubble.
//
// Fallbacks (deliberate, all safe):
//   - No live generation in THIS process (settled, aborted, or another
//     serverless instance owns it) → 204. The SDK treats that as "nothing to
//     resume", returns to ready, and the Convex mirror in hooks/use-active-chat
//     remains the source of truth — that fallback is untouched by this route.
//   - Any internal error → 204, never 5xx: an error status here would surface
//     as a chat error card on every reload-mid-generation.
//
// Known gap (documented, deliberate): the generation bus is IN-PROCESS (an
// EventEmitter keyed by assistantId), so on a multi-instance deployment the
// re-attach degrades to the mirror fallback via the 204 path. Cross-instance
// re-attach would need a shared chunk log (e.g. the resumable-stream package +
// Redis) — a follow-up, not a safe in-place change. Single-instance dev and
// single-region node deployments re-attach fully.

import { auth } from "@clerk/nextjs/server";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
} from "ai";

import { BYPASS_CLERK } from "@/lib/dev-user";
import { getActiveGenerationForChat } from "@/lib/ai/server-generation";

export const runtime = "nodejs";
// A GET route handler with no dynamic APIs can be statically optimized — a
// cached 204 would break every re-attach on the instance that owns the live
// generation. This route is per-request by definition.
export const dynamic = "force-dynamic";
// The SSE stays open until the generation settles (same ceiling as the POST
// route's detached task).
export const maxDuration = 300;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ chatId: string }> },
) {
  const { userId } = await auth();
  if (!userId && !BYPASS_CLERK) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { chatId } = await params;
  const handle = getActiveGenerationForChat(chatId);
  // 204 = "nothing to resume here" — the SDK's designed no-resume signal.
  // Also the answer for a malformed id (the client's gate would not have sent
  // one, but a bad id must never surface as a chat error either).
  if (!handle) return new Response(null, { status: 204 });

  const assistantId = handle.assistantId;
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      let open = true;
      const unsub = handle.subscribe((chunk) => {
        if (!open) return;
        // Patch the replayed start chunk's messageId to the persisted row id —
        // see the file header. Later start chunks (a retried attempt) patch to
        // the same id, which is a no-op for the SDK's id-change reset.
        if (
          (chunk as { type?: string }).type === "start" &&
          (chunk as { messageId?: string }).messageId != null
        ) {
          chunk = { ...chunk, messageId: assistantId };
        }
        try {
          writer.write(chunk as never);
        } catch {
          /* client gone — the detached generation continues regardless */
        }
      });
      // Hold the SSE open until the generation settles. subscribe() has already
      // delivered every chunk by then: the bus emits synchronously, and "end"
      // fires after the final emit in backgroundServe's finally.
      try {
        await handle.done;
      } catch {
        /* settle errors are non-fatal for the re-attach */
      }
      open = false;
      unsub();
    },
    generateId,
  });

  return createUIMessageStreamResponse({ stream });
}
