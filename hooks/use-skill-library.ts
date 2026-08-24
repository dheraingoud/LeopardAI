"use client";

import { useCallback, useEffect, useRef } from "react";
import { useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";
import { setLibrary } from "@/lib/skill-store";

/**
 * Loads the Convex skill library into the shared store so the modal can render
 * it and the /api/chat transport can inject its enabled bodies. Seeds once
 * (idempotent upsert) so the 5 curated skills exist on every account.
 */
export function useSkillLibrary(): void {
  const convex = useConvex();
  const seeded = useRef(false);

  const load = useCallback(async () => {
    try {
      if (!seeded.current) {
        seeded.current = true;
        await convex.action(api.skillLibrary.seedLibrary, {});
      }
      const list = await convex.query(api.skillLibrary.listLibrary, {});
      setLibrary(list as never);
    } catch {
      // offline / not-yet-connected — modal + transport degrade to local skills
    }
  }, [convex]);

  useEffect(() => {
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);
}