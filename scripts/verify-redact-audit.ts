// L5 review fix — audit redaction gap closure. Run: npx tsx scripts/verify-redact-audit.ts
// Proves scrubAuditField() neutralizes the header/query/basic-auth shapes that
// plain redact() missed (Authorization header, cookie, signature, presigned URL),
// so a fetched page body or presigned URL can't leak into the append-only log.
import { scrubAuditField, redact } from "../lib/redact";

let pass = 0;
let fail = 0;
function no(actual: string, needle: string, label: string): void {
  if (!actual.includes(needle)) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL ${label}: still contains ${JSON.stringify(needle)}`);
  }
}
function yes(actual: string, needle: string, label: string): void {
  if (actual.includes(needle)) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL ${label}: missing ${JSON.stringify(needle)}`);
  }
}

// Authorization: Basic base64 (was NOT redacted by redact()).
const basic = "GET /admin Authorization: Basic dXNlcjpwYXNzd29yZA==";
no(scrubAuditField(basic), "dXNlcjpwYXNzd29yZA", "Basic auth base64 scrubbed");
yes(scrubAuditField(basic).toLowerCase(), "authorization=[redacted]", "basic header masked");

// Set-Cookie / session header shapes.
no(scrubAuditField("Set-Cookie: sessionid=abc123XYZsecret"), "abc123XYZsecret", "cookie value scrubbed");
no(scrubAuditField("x-amz-signature: a1b2c3d4e5f6789deadbeef"), "a1b2c3d4e5f6789deadbeef", "sig header scrubbed");

// Presigned URL query params.
const presigned = "https://bucket.s3.amazonaws.com/f?X-Amz-Signature=deadbeef00&token=sk_test_abcdef";
no(scrubAuditField(presigned), "sk_test_abcdef", "token query param scrubbed");
no(scrubAuditField(presigned), "deadbeef00", "X-Amz-Signature query param scrubbed");

// Basic-auth userinfo in a URL.
no(scrubAuditField("https://user:s3cr3t@example.com/x"), "s3cr3t", "basic userinfo scrubbed");

// Plain redact() is a strict subset (still catches sk-/bearer/JWT).
no(scrubAuditField("token ware: nvapi-abc123def456ghi789"), "nvapi-abc123def456ghi789", "nvapi via generic redact still caught");

// Non-secret text passes through unchanged.
const clean = scrubAuditField("the quick brown fox jumped over the lazy dog");
yes(clean, "quick brown fox", "benign text preserved");

console.log(`\nscrubAuditField: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);