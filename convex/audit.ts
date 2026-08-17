// ═══════════════════════════════════════════════════════════════════════════
// Φ-docs · enterprise tool audit trail.
//
// Immutable append-only log of the model's tool surface — every gate decision
// (allow/deny/ask → the TOOL_APPROVAL_RULES engine) AND every tool execution
// the model actually ran (inputs + output summaries from the stream step hooks).
//
// Written by the detached /api/chat background task via internalMutation (admin
// auth bypasses per-user; the route is the trust boundary). Best-effort: a
// failed write logs a warning, never fails the generation. Rows are append-on
// insert; there is no update path — the log is write-once for compliance/SoC
// review (who/what/which-tool/when/was-it-approved).
//
// Event kinds:
//   - approval        model PROPOSED a tool; here is the gate decision + reason
//   - tool-execution  an (approved) tool ran; here is its input + result summary
//   - tool-error      an executed tool threw/returned an error result
// ═══════════════════════════════════════════════════════════════════════════

import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireChatOwner } from "./_auth";

export const record = internalMutation({
  args: {
    assistantId: v.string(), // generation id — correlates to messages.id + usageLog
    chatId: v.id("chats"),
    userId: v.string(),
    event: v.union(
      v.literal("approval"),
      v.literal("tool-execution"),
      v.literal("tool-error"),
    ),
    toolName: v.string(),
    decision: v.optional(
      v.union(
        v.literal("allow"),
        v.literal("deny"),
        v.literal("ask"),
        v.literal("approved"),
        v.literal("denied"),
        v.literal("user-approval"),
      ),
    ),
    reason: v.optional(v.string()),
    inputJson: v.optional(v.string()), // REDACTED, truncated — never raw secrets
    outputSummary: v.optional(v.string()), // REDACTED, truncated
    ts: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Ownership enforced by DATA (parallel to messages.upsertAssistant): the
    // route trust boundary is Clerk, but this internalMutation is invoked via a
    // deploy-key admin client that bypasses per-user auth, so a fabricated
    // client-supplied chatId (body.id) must not let an attacker append audit
    // rows attributed to another user's chat. The row's userId must own chatId.
    await requireChatOwner(ctx, args.chatId, args.userId);
    await ctx.db.insert("toolAuditLog", args);
  },
});