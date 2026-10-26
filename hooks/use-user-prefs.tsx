"use client";

// Convex-backed user preferences. The row is keyed by clerkId, so preferences follow the account across browsers instead of living on one device.

import { useCallback, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import { BYPASS_CLERK, DEV_USER_ID } from "@/lib/dev-user";
import { clearPrefsWriter, hydratePrefs, setPrefsWriter, writePrefs, type PrefsWriter } from "@/lib/prefs-cache";

export type UserPrefs = {
  lastModel?: string;
  theme?: string;
  sendWithEnter?: boolean;
  webFetchEnabled?: boolean;
  reasoning?: Record<string, string>;
  mcpServers?: unknown;
  skills?: unknown;
  permanentToggles?: Record<string, boolean>;
  skillOverrides?: Record<string, string>;
};

export function useUserId(): string | undefined {
  const { user } = useUser();
  return user?.id ?? (BYPASS_CLERK ? DEV_USER_ID : undefined);
}

export function useUserPrefs() {
  const clerkId = useUserId();
  const prefs = useQuery(api.userPrefs.get, clerkId ? { clerkId } : "skip");
  const setPrefs = useMutation(api.userPrefs.set);

  useEffect(() => {
    if (!clerkId) return;
    const next: PrefsWriter = (fields) => {
      const { clerkId: _ignored, ...rest } = fields;
      void setPrefs({ clerkId, ...rest }).catch((err) => {
        console.warn("[prefs] persist failed:", err);
      });
    };
    setPrefsWriter(next);
    return () => clearPrefsWriter(next);
  }, [clerkId, setPrefs]);

  useEffect(() => {
    if (!clerkId || prefs === undefined) return;
    const row: Partial<UserPrefs> = prefs ?? {};
    hydratePrefs(clerkId, {
      lastModel: row.lastModel,
      theme: row.theme,
      sendWithEnter: row.sendWithEnter,
      webFetchEnabled: row.webFetchEnabled,
      reasoning: row.reasoning,
      mcpServers: row.mcpServers,
      skills: row.skills,
      permanentToggles: row.permanentToggles,
      skillOverrides: row.skillOverrides,
    });
  }, [clerkId, prefs]);

  const update = useCallback((patch: Partial<UserPrefs>) => {
    writePrefs(patch);
  }, []);

  const value = useMemo<UserPrefs>(
    () => ({
      lastModel: prefs?.lastModel,
      theme: prefs?.theme,
      sendWithEnter: prefs?.sendWithEnter,
      webFetchEnabled: prefs?.webFetchEnabled,
      reasoning: prefs?.reasoning,
      mcpServers: prefs?.mcpServers,
      skills: prefs?.skills,
      permanentToggles: prefs?.permanentToggles,
      skillOverrides: prefs?.skillOverrides,
    }),
    [prefs],
  );

  return { prefs: value, update, loaded: prefs !== undefined, clerkId };
}
