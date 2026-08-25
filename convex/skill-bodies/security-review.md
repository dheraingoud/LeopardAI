---
name: security-review
description: AI-powered security scanner that reasons about code like a security researcher — tracing data flows, catching injection flaws, auth bugs, exposed secrets, weak crypto. Use when asked to scan code for vulnerabilities, check for SQL injection/XSS/command injection, audit security, or run /security-review.
---

# Security Review

An AI-powered security scan that reasons about the codebase the way a human security researcher would — tracing data flows, understanding component interactions, and catching vulnerabilities pattern-matching tools miss.

## Workflow — follow in order

1. **Scope** — if a path was given, scan only that scope; else scan the whole project. Identify languages/frameworks (package.json, requirements.txt, go.mod, etc.).
2. **Dependency audit** — check manifests for known-vulnerable packages, deprecated crypto libs, suspiciously old pins.
3. **Secrets & exposure** — scan ALL files (config, env, CI, Dockerfiles) for hardcoded keys, tokens, private keys, committed .env files, connection strings with embedded credentials.
4. **Vulnerability deep scan** — reason, don't just pattern-match:
   - Injection: SQLi, XSS (unescaped output, dangerouslySetInnerHTML), command injection, header/log injection
   - Auth & access control: missing auth on sensitive endpoints, BOLA/IDOR, JWT weaknesses, CSRF, privilege escalation, mass assignment
   - Data handling: sensitive data in logs/errors/responses, missing encryption, path traversal, XXE, SSRF
   - Cryptography: MD5/SHA1/DES for security, hardcoded IVs, Math.random() for tokens, missing TLS validation
   - Business logic: TOCTOU races, integer overflow in money math, missing rate limiting, predictable resource IDs
5. **Cross-file data flow** — trace user-controlled input from entry points (params, headers, body, uploads) to sinks (queries, exec, HTML, file writes). Find what only appears across files.
6. **Self-verify** — for each finding, re-read with fresh eyes: is it actually exploitable, or did sanitization/framework handle it upstream? Downgrade or discard false positives.
7. **Report** — grouped by category, with severity and confidence per finding.
8. **Propose patches** — for CRITICAL and HIGH, show before/after with a concrete minimal fix. Never auto-apply: state "Review each patch before applying. Nothing has been changed yet."

## Severity

| Severity | Meaning |
|----------|---------|
| 🔴 CRITICAL | Immediate exploitation risk, data breach likely |
| 🟠 HIGH | Serious vulnerability, exploit path exists |
| 🟡 MEDIUM | Exploitable with conditions or chaining |
| 🔵 LOW | Best practice violation, low direct risk |
| ⚪ INFO | Observation, not a vulnerability |

## Output rules

- Lead with a findings summary table (counts by severity)
- Every finding: file path, line number, exact vulnerable snippet, plain-English risk (what could an attacker do?), confidence rating
- If clean, say so clearly with what was scanned
- Never auto-apply patches — present for human review only
