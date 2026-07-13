import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { BYPASS_CLERK } from "@/lib/dev-user";

/**
 * Public routes — sign-in/up, sso callback, the marketing landing at /, the
 * public shared-chat view at /share/[shareId], and the generation/analysis
 * infra endpoints (these are invoked from the authed chat surface and left
 * open until Phase 9 hardening gate them behind auth).
 *
 * Cut from the old list: /qa, /app/playground, /api/qa-chat, /app/shared (the
 * workspace routes and qa-chat are gone with the schema-viz pivot; /app/shared
 * moved to /share).
 */
const isPublicRoute = createRouteMatcher([
  "/",
  "/share(.*)",
  "/api/generate/(.*)",
  "/api/analyze/(.*)",
  "/api/video-jobs/(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/sso-callback(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  // TEMP: Phase 5 browser E2E bypass — see lib/dev-user.ts. Revert before Phase 9.
  if (BYPASS_CLERK) return;
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
