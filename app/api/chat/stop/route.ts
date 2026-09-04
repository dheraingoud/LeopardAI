import { auth } from "@clerk/nextjs/server";
import { abortGeneration, abortChatGenerations } from "@/lib/ai/server-generation";
import { BYPASS_CLERK } from "@/lib/dev-user";

// ═══ POST /api/chat/stop — deliberate stop of a server-owned generation. ═══
//
// Φ10/#3 review M1: reload and stop both close the browser's SSE fetch, so the
// wire alone can't tell them apart. Reload must let the detached generation
// finish (so the reply completes + persists); a deliberate stop must cancel it
// (persist only the partial reply). The client's Stop control calls this with
// the assistant message id; abortGeneration() fires that generation's AbortController,
// which streamText (and any in-flight web tool) observes, ending the merge loop.
// backgroundServe then persists the accumulated parts as `completed` and the
// bubble shows a partial reply instead of the full text it never finished.

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId && !BYPASS_CLERK) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let assistantId: string;
  let chatId: string;
  try {
    const body = (await request.json()) as { assistantId?: unknown; chatId?: unknown };
    assistantId = typeof body.assistantId === "string" ? body.assistantId : "";
    chatId = typeof body.chatId === "string" ? body.chatId : "";
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  if (!assistantId && !chatId) {
    return Response.json({ error: "assistantId or chatId is required" }, { status: 400 });
  }
  // Chat-delete path: kill every live generation for the chat so the detached
  // writer can't keep streaming into a deleted conversation (2026-09-04).
  if (chatId) {
    const n = abortChatGenerations(chatId);
    return Response.json({ ok: true, aborted: n > 0, count: n });
  }

  // Abort the live generation if the server still owns one with this id.
  const aborted = abortGeneration(assistantId);
  return Response.json({ ok: true, aborted });
}