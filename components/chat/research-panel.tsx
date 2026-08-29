"use client";

// Φ-docs · deep-research panel.
//
// A glass panel for the detached research worker (lib/ai/research/worker).
// Opens from a chip beside the composer. It lists the recent in-process,
// model- or user-spawned jobs, polls each still-running job every ~2s, and
// renders the final markdown report when one lands. The worker runs on the
// server and survives a page reload; the panel simply re-fetches state.
//
// Gating mirrors the other compos fature toggles: renders nothing unless
// NEXT_PUBLIC_LEOPARD_DEEP_RESEARCH=1 or the URL carries ?research=1.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@clerk/nextjs";
import { Search, X, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { retryingFetch } from "@/lib/client/retrying-fetch";
import { BackgroundInbox } from "./leopard/background-inbox";

interface Job {
  id: string;
  query: string;
  modelId: string;
  userId?: string;
  status: "queued" | "running" | "done" | "error";
  step: number;
  totalSteps: number;
  steps: string[];
  report?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

const UI_ENABLED =
  process.env.NEXT_PUBLIC_LEOPARD_DEEP_RESEARCH === "1" ||
  (typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("research") === "1");

export function ResearchPanel() {
  const { session } = useSession();
  // Φ-docs · token-refresh-once: getToken() is the current bearer; refresh
  // reissues it (skipCache). A stale Clerk token gets refreshed + retried once.
  const auth = useMemo(
    () => ({
      getToken: async () => (await session?.getToken().catch(() => null)) ?? undefined,
      refreshToken: async () => (await session?.getToken({ skipCache: true }).catch(() => null)) ?? undefined,
    }),
    [session],
  );
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [spawning, setSpawning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isActive = (s: Job["status"]) => s === "queued" || s === "running";

  const refresh = useCallback(async () => {
    try {
      const res = await retryingFetch("/api/research", { cache: "no-store" }, auth);
      if (res.ok) {
        const data = (await res.json()) as { jobs: Job[] };
        setJobs(data.jobs ?? []);
      }
    } catch {
      /* keep last known jobs */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.getToken, auth.refreshToken]);

  // Fetch on open + refresh every 2s while any job is active.
  useEffect(() => {
    if (!open) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    void refresh();
    pollRef.current = setInterval(() => {
      void refresh();
    }, 2000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [open, refresh, jobs.some((j) => isActive(j.status))]);

  const run = useCallback(async () => {
    const q = query.trim();
    if (!q || spawning) return;
    setSpawning(true);
    try {
      const res = await retryingFetch(
        "/api/research",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
        },
        auth,
      );
      if (res.ok) {
        const { id } = (await res.json()) as { id: string };
        setQuery("");
        setJobs((prev) => [
          {
            id,
            query: q,
            modelId: "",
            status: "queued",
            step: 0,
            totalSteps: 0,
            steps: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          ...prev,
        ]);
      }
    } catch {
      /* surface nothing; refresh will show reality */
    } finally {
      setSpawning(false);
    }
    void refresh();
  }, [query, spawning, refresh, auth]);

  if (!UI_ENABLED) return null;

  const active = jobs.filter((j) => isActive(j.status)).length;
  const selectedJob = jobs.find((j) => j.id === selectedId) ?? null;

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title="Deep research panel"
        className={cn(
          "relative grid h-6 items-center rounded-full px-1.5",
          "bg-white/[0.03] ring-1 transition",
          open
            ? "ring-cyan-300/40 text-cyan-200"
            : "ring-cyan-300/20 text-cyan-200/80 hover:ring-cyan-300/40 hover:text-cyan-100",
        )}
      >
        <Search className="h-3 w-3" strokeWidth={1.5} />
        {active > 0 && (
          <span className="absolute -right-1 -top-1 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-cyan-400 px-0.5 font-mono text-[8px] font-bold text-black">
            {active}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-9 right-0 z-40 w-[28rem] max-w-[92vw]">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#111113]/90 shadow-xl shadow-black/40 backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-cyan-200/70">
                Deep Research
              </span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="text-[#b6b6b6] transition hover:text-white"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </div>

            <div className="flex gap-2 border-b border-white/5 p-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && run()}
                placeholder="Investigate something across multiple sources…"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-[12px] text-[#ececec] placeholder:text-[#6a6a6a] outline-none focus:border-cyan-300/40"
              />
              <button
                type="button"
                onClick={run}
                disabled={!query.trim() || spawning}
                className="shrink-0 rounded-lg bg-cyan-400/15 px-3 py-1.5 text-[12px] font-medium text-cyan-200 transition hover:bg-cyan-400/25 disabled:opacity-40"
              >
                {spawning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Run"}
              </button>
            </div>

            <div className="max-h-[24rem] overflow-y-auto p-2">
              {jobs.length === 0 ? (
                <p className="px-3 py-4 text-[12px] text-[#8a8a8a]">
                  No research runs yet. Type a question and press Run — or ask
                  Leopard to research something and it starts here.
                </p>
              ) : (
                <>
                  <BackgroundInbox
                    className="max-w-none border-0 bg-transparent p-0 shadow-none"
                    runs={jobs.map((job) => ({
                      id: job.id,
                      title: job.query,
                      state:
                        job.status === "done"
                          ? ("ready" as const)
                          : job.status === "error"
                            ? ("failed" as const)
                            : ("running" as const),
                      elapsed: isActive(job.status)
                        ? `${job.step}/${job.totalSteps} · ${job.steps[job.step - 1] ?? "planning"}`
                        : "",
                    }))}
                    onCollect={(id) =>
                      setSelectedId((cur) => (cur === id ? null : id))
                    }
                  />
                  {selectedJob?.status === "error" && (
                    <p className="px-3 py-2 text-[11px] text-red-300/90">
                      {selectedJob.error ?? "Unknown error."}
                    </p>
                  )}
                  {selectedJob?.status === "done" && selectedJob.report && (
                    <div className="mx-2 mb-2 max-h-64 overflow-y-auto rounded-lg border border-white/5 bg-white/[0.02] p-2.5 [&_a]:text-cyan-300/80 [&_code]:rounded [&_code]:bg-white/5 [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-white/5 [&_pre]:p-2 [&_h2]:mt-2 [&_h2]:text-[12px] [&_h2]:font-semibold [&_li]:ml-3 [&_p]:my-1">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {selectedJob.report}
                      </ReactMarkdown>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}