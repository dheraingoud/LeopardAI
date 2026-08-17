// ═══════════════════════════════════════════════════════════════════════════
// Multi-tenant tool-approval policy (claude-code-docs/docs/hooks.md — the
// deny>ask>allow precedence + tool-name matchers; docs/agent-sdk__mcp.md —
// per-tool approval modes).
//
// Replaces the hardcoded `webSearch → approved, everything-else → ask` branch
// in /api/chat with an operator-declarative rule engine driven by
// TOOL_APPROVAL_RULES, a comma-separated list of `pattern=mode` entries, e.g.
//
//   TOOL_APPROVAL_RULES="webSearch=allow,webFetch=ask,^mcp__=deny"
//
// Each pattern is a regex tested against the tool name (exact names match
// plainly; prefix/suffix with ^/…, wildcard via regex). Precedence (per the
// hooks doc): DENY always vetoes — a deny match wins regardless of any allow;
// then ALLOW; then ASK. Rules unset → legacy behavior (read-only webSearch
// auto-approves, webFetch asks). Pure + env-aware, unit-testable.
// ═══════════════════════════════════════════════════════════════════════════

export type ApprovalMode = "allow" | "ask" | "deny";

export type ApprovalRule = { pattern: RegExp; mode: ApprovalMode };

export function parseApprovalRules(envValue: string | undefined): ApprovalRule[] {
  if (!envValue) return [];
  return envValue
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const eq = entry.lastIndexOf("=");
      if (eq <= 0) return null;
      const pattern = entry.slice(0, eq).trim();
      const mode = entry.slice(eq + 1).trim();
      if (!pattern || !(mode === "allow" || mode === "ask" || mode === "deny")) {
        return null;
      }
      let re: RegExp;
      try {
        re = new RegExp(pattern);
      } catch {
        // Treat an invalid regex as a literal exact-name match.
        re = new RegExp("^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$");
      }
      return { pattern: re, mode };
    })
    .filter((r): r is ApprovalRule => r !== null);
}

export type ApprovalDecision = {
  mode: ApprovalMode;
  /** The rule that matched (for audit/debug). */
  matched?: string;
  reason: string;
};

/**
 * Resolve the approval decision for a tool name against rules + global policy.
 * Precedence: ANY deny rule vetoes → then allow → then ask → then global.
 * With no rules, `globalPolicy` ("allow"|"deny"|"ask") applies; for "ask" the
 * legacy safe default auto-approves the read-only webSearch tool.
 */
export function resolveApproval(
  toolName: string,
  rules: ApprovalRule[],
  globalPolicy: ApprovalMode = "ask",
): ApprovalDecision {
  const denied = rules.find((r) => r.mode === "deny" && r.pattern.test(toolName));
  if (denied) return { mode: "deny", reason: `denied by rule '${denied.pattern.source}'` };

  const allowed = rules.find((r) => r.mode === "allow" && r.pattern.test(toolName));
  if (allowed) return { mode: "allow", reason: `allowed by rule '${allowed.pattern.source}'` };

  const asked = rules.find((r) => r.mode === "ask" && r.pattern.test(toolName));
  if (asked) return { mode: "ask", reason: `ask by rule '${asked.pattern.source}'` };

  if (globalPolicy !== "ask") return { mode: globalPolicy, reason: `global policy '${globalPolicy}'` };

  // Legacy safe default: the read-only search tool never needs approval.
  if (toolName === "webSearch") return { mode: "allow", reason: "read-only webSearch default" };
  return { mode: "ask", reason: "default ask" };
}