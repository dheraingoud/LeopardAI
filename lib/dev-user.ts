/**
 * TEMP — Clerk bypass for Phase 5 browser E2E.
 *
 * User instruction (2026-07-05): "for now remove the clerk while testing and
 * go for the full suite." BYPASS_CLERK makes every auth-gated surface fall
 * back to DEV_USER_ID so a fresh unauth'd Playwright browser can exercise the
 * full chat flow (create chat → send → stream → title persist → model switch
 * → reload hydrate from Convex) without a Clerk session.
 *
 * Thread DEV_USER_ID through:
 *   - middleware.ts           (skip `auth.protect()`)
 *   - app/(chat)/chat/page.tsx (create row with DEV_USER_ID)
 *   - hooks/use-active-chat.tsx (queries + mutations use DEV_USER_ID)
 *   - app/api/chat/route.ts  (skip 401, proceed with DEV_USER_ID)
 *
 * REVERT (set BYPASS_CLERK = false) before Phase 9 Clerk hardening.
 */
export const BYPASS_CLERK = true;
export const DEV_USER_ID = "leopard-dev-test-user-0001";
