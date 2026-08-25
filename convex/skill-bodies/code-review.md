---
name: code-review
description: Review code or diffs like Claude Code's Code Review pipeline — multi-agent style analysis for logic errors, security vulnerabilities, and regressions, with severity-tagged findings. Use when the user asks to review code, a diff, or a PR, or runs /code-review.
---

# Code Review

Review the target code or diff the way Claude Code's Code Review does: a fleet of specialized passes over the changes in the context of the surrounding codebase, followed by a verification pass that filters false positives before reporting.

## What to check

Default focus is correctness — bugs that would break production, not formatting preferences or missing test coverage:

- Logic errors and broken edge cases
- Security vulnerabilities (injection, auth/authz gaps, unsafe handling of untrusted input)
- Subtle regressions against existing behavior
- Race conditions, error-handling gaps, incorrect boundary conditions
- If the repo has a CLAUDE.md: newly introduced violations of it are nit-level findings. If a REVIEW.md exists, its instructions are the highest-priority review guidance.

Expand scope only when the user asks (style, tests, docs).

## How to report

Tag every finding with severity:

| Marker | Severity | Meaning |
| ------ | -------- | ------- |
| 🔴 | Important | A bug that should be fixed before merging |
| 🟡 | Nit | A minor issue, worth fixing but not blocking |
| 🟣 | Pre-existing | A bug that exists in the codebase but was not introduced by this change |

For each finding:
- Point at the exact file:line and quote the offending code
- Explain the concrete failure — the input or flow that breaks, not a vibes-level concern
- Include a short "why this is real" verification note (you re-checked it against actual code behavior)
- Suggest the minimal fix

Order findings most-severe-first. If nothing is found, say so plainly and state what was reviewed. Do not pad with speculative nits. Do not modify code unless the user asks for fixes — review is read-only by default.
