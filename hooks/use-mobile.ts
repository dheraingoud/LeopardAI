"use client";

import { useSyncExternalStore } from "react";

// matchMedia-driven mobile breakpoint. Fires only at the crossing (not per
// resize pixel), tears correctly under concurrent rendering, explicit SSR
// snapshot. Breakpoint matches Tailwind's md (768px).
const QUERY = "(max-width: 767px)";

function subscribe(callback: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
