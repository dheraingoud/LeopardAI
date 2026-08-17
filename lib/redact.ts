// ═══════════════════════════════════════════════════════════════════════════
// Shared secret/PII redactor (claude-code-docs/docs/data-usage.md —
// "error reports must redact known patterns of secrets, file paths, emails").
//
// Run EVERY debug/error write through redact() so a raw stack or message can
// never leak an API key, bearer token, env assignment, absolute path, or email
// into LEOPARD_DEBUG_LOG / console / Convex. Best-effort regex scrubbing — a
// hard guarantee is "log nothing when not configured" (LEOPARD_DEBUG_LOG unset
// is already the prod default); this is the defense-in-depth single pass.
// ═══════════════════════════════════════════════════════════════════════════

const SUB = "[REDACTED]";

function multilineRe(sources: string[]): RegExp {
  return new RegExp(sources.join("|"), "gi");
}

// Order matters: the most specific, longest patterns first so a JWT (which
// contains a generic base64 dot chain) gets caught before a bare word-token.
const PATTERNS: RegExp = multilineRe([
  // JWT (three dot-separated base64url segments, header.payload). Catch first.
  `eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_.-]{10,}\\.[A-Za-z0-9_-]{20,}`,
  // Long hex/base64 "sk-", "nvapi-", "pk_live", "AIza", "AKIA" key bodies.
  // Hyphen-tolerant (e.g. Anthropic "sk-ant-…").
  `(?:sk-[A-Za-z0-9][A-Za-z0-9_-]{7,}|nvapi-[A-Za-z0-9][A-Za-z0-9_-]{7,}|pk_live_[A-Za-z0-9][A-Za-z0-9_]{7,}|AIza[A-Za-z0-9][A-Za-z0-9_-]{7,}|AKIA[A-Z0-9]{16})`,
  // Bearer / Authorization tokens.
  `\\bBearer\\s+[A-Za-z0-9._~+/-]{12,}`,
  `\\b(?:token|api[_-]?key|secret|password|passwd|access[_-]?token|refresh[_-]?token)\\b\\s*[:=]\\s*[A-Za-z0-9._~+/-]{6,}`,
  // .env-style KEY=value assignments (case-insensitive key bound to a word).
  `\\b[A-Z][A-Z0-9_]{2,30}[A-Z0-9]\\s*=\\s*["']?[A-Za-z0-9._:@+%/-]{8,}["']?`,
  // Absolute paths — Windows (C:\…, \Users\…) and POSIX (/…).
  `(?:[A-Za-z]:[\\\\/][^\\s"'<>|:;*?()]+|(?:\\/|\\.\\.\\/)[^\\s"'<>|:;()]+)`,
  // Emails.
  `\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b`,
]);

/** Redact secret/credential/PII-like text from a string. Unknown → a string. */
export function redact(input: unknown): string {
  const s = typeof input === "string" ? input : String(input);
  return s.replace(PATTERNS, SUB);
}

/** True if the string contains anything the redactor would mask (for tests). */
export function wouldRedact(input: string): boolean {
  return PATTERNS.test(input);
}

/**
 * Full version: like redact(), but also masks credential-bearing URLs
 * (`https://user:pass@host/…`, `?token=…&sig=…`) prior to the generic pass.
 * Use for anything rendered to a user (AskCard URL preview, tool cards).
 */
export function redactUrlForDisplay(url: string): string {
  let s = url;
  try {
    const u = new URL(s);
    if (u.username || u.password) {
      u.username = "REDACTED";
      u.password = "REDACTED";
      s = u.toString();
    }
  } catch {
    /* leave as-is; generic pass below still scrubs */
  }
  // Mask sensitive query params, keeping the rest of the URL readable.
  s = s.replace(
    /([?&](?:token|key|api[_-]?key|sig|signature|access_token|auth)=)[^&]+/gi,
    "$1[REDACTED]",
  );
  return redact(s);
}