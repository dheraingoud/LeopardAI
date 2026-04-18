"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Download, Loader2, Orbit, Share2 } from "lucide-react";
import { toast } from "sonner";

type JobStatus = "queued" | "processing" | "done" | "failed";
type Resolution = "480p" | "720p";

interface JobPayload {
  id: string;
  status: JobStatus;
  result?:
    | { kind: "video"; url: string }
    | { kind: "physics"; payload: string };
  error?: string;
}

interface VideoPlaygroundProps {
  defaultModelId: string;
  userId?: string;
}

interface VideoHistoryRecord {
  id: string;
  url: string;
  prompt: string;
  resolution: Resolution;
  seed: number;
  createdAt: number;
}

interface SignalConfig {
  enabled: boolean;
  weight: number;
  uploadName: string;
}

const QUESTION_CHIPS = [
  "Check physics plausibility",
  "Predict future path",
  "Find anomalies",
  "Approve or reject",
  "Describe scene",
];

function splitReasoning(text: string) {
  const match = text.match(/<think>([\s\S]*?)<\/think>/i);
  if (!match) {
    return { reasoning: "", finalAnswer: text };
  }
  return {
    reasoning: match[1].trim(),
    finalAnswer: text.replace(match[0], "").trim(),
  };
}

function statusProgress(status: JobStatus | null) {
  if (!status) return 0;
  if (status === "queued") return 24;
  if (status === "processing") return 66;
  return 100;
}

export default function VideoPlayground({ defaultModelId, userId }: VideoPlaygroundProps) {
  const [prompt, setPrompt] = useState("Convert this simulation into a cinematic photoreal output.");
  const [negativePrompt, setNegativePrompt] = useState("flicker, artifacts, blur, low detail");
  const [model, setModel] = useState(defaultModelId);
  const [question, setQuestion] = useState("Check whether the observed motion obeys physically plausible constraints.");
  const [sourceVideoUrl, setSourceVideoUrl] = useState("");
  const [sourceVideoPreview, setSourceVideoPreview] = useState<string | null>(null);
  const [resolution, setResolution] = useState<Resolution>("480p");
  const [steps, setSteps] = useState(35);
  const [cfgScale, setCfgScale] = useState(7.5);
  const [seed, setSeed] = useState(42);
  const [fps, setFps] = useState(2);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [signals, setSignals] = useState<Record<"edge" | "depth" | "seg" | "blur", SignalConfig>>({
    edge: { enabled: false, weight: 0.5, uploadName: "" },
    depth: { enabled: false, weight: 0.5, uploadName: "" },
    seg: { enabled: false, weight: 0.5, uploadName: "" },
    blur: { enabled: false, weight: 0.5, uploadName: "" },
  });

  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [resultText, setResultText] = useState<string>("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [showReasoning, setShowReasoning] = useState(false);
  const [followup, setFollowup] = useState("");
  const [history, setHistory] = useState<VideoHistoryRecord[]>([]);

  const isReasonModel = model === "cosmos-reason2-8b";
  const statusUrl = useMemo(() => (jobId ? `/api/video-jobs/${jobId}` : null), [jobId]);
  const historyStorageKey = useMemo(() => `leopard:video-history:${model}`, [model]);
  const sourcePreviewObjectRef = useRef<string | null>(null);

  const parsedReasoning = useMemo(() => splitReasoning(resultText), [resultText]);
  const statusLabel = useMemo(() => {
    if (!status) return "Idle";
    if (status === "queued") return "Queued. Request submitted.";
    if (status === "processing") return "Generating... ~4 min remain";
    if (status === "done") return "Done";
    return "Failed";
  }, [status]);

  const setSignalValue = useCallback(
    (key: "edge" | "depth" | "seg" | "blur", next: Partial<SignalConfig>) => {
      setSignals((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          ...next,
        },
      }));
    },
    [],
  );

  const addVideoHistory = useCallback(
    (url: string) => {
      const record: VideoHistoryRecord = {
        id: crypto.randomUUID(),
        url,
        prompt,
        resolution,
        seed,
        createdAt: Date.now(),
      };

      setHistory((prev) => [record, ...prev.filter((entry) => entry.url !== url)].slice(0, 10));
    },
    [prompt, resolution, seed],
  );

  useEffect(() => {
    if (!statusUrl) return;
    if (status !== "queued" && status !== "processing") return;

    let canceled = false;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(statusUrl, { cache: "no-store" });
        if (res.status === 404) {
          // Job record may still be propagating; keep polling.
          return;
        }
        const payload = (await res.json()) as JobPayload;
        if (!res.ok) throw new Error(payload.error || "Failed to check status");
        if (canceled) return;

        setStatus(payload.status);

        if (payload.status === "done") {
          if (payload.result?.kind === "video") {
            setVideoUrl(payload.result.url);
            setResultText("");
            addVideoHistory(payload.result.url);
          } else {
            setResultText(payload.result?.payload || "{}");
            setVideoUrl(null);
          }
          clearInterval(timer);
          toast.success(isReasonModel ? "Analysis completed" : "Video job completed");
        }

        if (payload.status === "failed") {
          setResultText(payload.error || "Job failed");
          setVideoUrl(null);
          clearInterval(timer);
          toast.error(payload.error || "Video job failed");
        }
      } catch (error) {
        if (!canceled) {
          clearInterval(timer);
          toast.error(error instanceof Error ? error.message : "Status check failed");
        }
      }
    }, 4000);

    return () => {
      canceled = true;
      clearInterval(timer);
    };
  }, [addVideoHistory, isReasonModel, statusUrl, status]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(historyStorageKey);
    if (!raw) {
      setHistory([]);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as VideoHistoryRecord[];
      if (Array.isArray(parsed)) {
        setHistory(parsed.slice(0, 10));
      }
    } catch {
      setHistory([]);
    }
  }, [historyStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(historyStorageKey, JSON.stringify(history.slice(0, 10)));
  }, [history, historyStorageKey]);

  useEffect(() => {
    setModel(defaultModelId);
  }, [defaultModelId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        void queue();
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        if (!videoUrl) return;
        event.preventDefault();
        const anchor = document.createElement("a");
        anchor.href = videoUrl;
        anchor.download = `leopard-video-${Date.now()}.mp4`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      }

      if (event.key === "Escape" && (status === "queued" || status === "processing")) {
        toast.message("Cancellation after queue submit is not supported yet.");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [status, videoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (sourcePreviewObjectRef.current) {
        URL.revokeObjectURL(sourcePreviewObjectRef.current);
      }
    };
  }, []);

  const queue = async () => {
    if (isReasonModel) {
      if (!question.trim()) {
        toast.error("Question is required");
        return;
      }
      if (!sourceVideoUrl.trim() && !sourceVideoPreview) {
        toast.error("Video URL or upload is required");
        return;
      }
    } else {
      if (!prompt.trim()) {
        toast.error("Prompt is required");
        return;
      }
    }

    setLoading(true);
    setResultText("");
    setVideoUrl(null);

    try {
      const activePrompt = isReasonModel
        ? `${question.trim()}\n\nVideo source: ${sourceVideoUrl || "uploaded-local-preview"}\nFPS: ${fps}`
        : prompt.trim();

      const endpoint = isReasonModel ? "/api/analyze/video" : "/api/generate/video";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: activePrompt,
          model,
          userId,
          sourceVideoUrl: sourceVideoUrl || undefined,
          question: isReasonModel ? question.trim() : undefined,
          fps: isReasonModel ? fps : undefined,
          maxTokens: isReasonModel ? maxTokens : undefined,
          negativePrompt: !isReasonModel ? negativePrompt.trim() : undefined,
          resolution: !isReasonModel ? resolution : undefined,
          steps: !isReasonModel ? steps : undefined,
          cfgScale: !isReasonModel ? cfgScale : undefined,
          seed: !isReasonModel ? seed : undefined,
          controlSignals: !isReasonModel ? signals : undefined,
          followup: isReasonModel ? followup.trim() || undefined : undefined,
        }),
      });

      const payload = (await res.json()) as { jobId?: string; error?: string };
      if (!res.ok || !payload.jobId) {
        throw new Error(payload.error || "Failed to queue video job");
      }

      setJobId(payload.jobId);
      setStatus("queued");
      toast.success(isReasonModel ? "Analysis queued" : "Video job queued");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to queue video job");
    } finally {
      setLoading(false);
    }
  };

  const queueFollowup = async () => {
    const clean = followup.trim();
    if (!clean) {
      toast.error("Follow-up question is required");
      return;
    }
    setQuestion(clean);
    setFollowup("");
    await queue();
  };

  const shareVideo = async () => {
    if (!videoUrl) {
      toast.error("No output available to share");
      return;
    }

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Leopard video generation",
          text: prompt,
          url: videoUrl,
        });
      } else {
        await navigator.clipboard.writeText(videoUrl);
        toast.success("Video URL copied");
      }
    } catch {
      toast.error("Share failed");
    }
  };

  const downloadVideo = () => {
    if (!videoUrl) {
      toast.error("No video available to download");
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = videoUrl;
    anchor.download = `leopard-${model}-${Date.now()}.mp4`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const uploadSourceVideo = (file: File | null) => {
    if (!file) return;
    if (sourcePreviewObjectRef.current) {
      URL.revokeObjectURL(sourcePreviewObjectRef.current);
      sourcePreviewObjectRef.current = null;
    }

    const nextObjectUrl = URL.createObjectURL(file);
    sourcePreviewObjectRef.current = nextObjectUrl;
    setSourceVideoPreview(nextObjectUrl);
    setSourceVideoUrl("");
  };

  const renderReasonPlayground = () => (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
      <div className="rounded-2xl border border-white/10 bg-[#111111] p-4 space-y-4">
        <div className="rounded-xl border border-white/10 bg-black/25 p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-[#848484]">Input</p>
          <input
            value={sourceVideoUrl}
            onChange={(event) => setSourceVideoUrl(event.target.value)}
            placeholder="Paste a video URL"
            className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-xs text-[#d8d8d8]"
          />
          <input
            type="file"
            accept="video/*"
            className="w-full rounded-lg border border-white/10 bg-black/35 px-2 py-2 text-xs text-[#d8d8d8]"
            onChange={(event) => uploadSourceVideo(event.target.files?.[0] || null)}
          />
          {(sourceVideoPreview || sourceVideoUrl) && (
            <video
              src={sourceVideoPreview || sourceVideoUrl}
              controls
              className="w-full rounded-lg border border-white/10 max-h-[210px]"
            />
          )}
        </div>

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-[#848484]">Questions</p>
          <div className="flex flex-wrap gap-2">
            {QUESTION_CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => setQuestion(chip)}
                className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] text-[#bcbcbc] hover:text-white"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        <label className="space-y-1 block">
          <span className="text-[10px] uppercase tracking-widest text-[#848484]">Question</span>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={4}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-[#e6e6e6]"
          />
        </label>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="space-y-1">
            <span className="text-[#858585]">FPS</span>
            <select
              value={fps}
              onChange={(event) => setFps(Number(event.target.value) || 2)}
              className="w-full rounded-lg border border-white/10 bg-black/35 px-2 py-2 text-[#d0d0d0]"
            >
              <option value={2}>2</option>
              <option value={4}>4</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[#858585]">Max tokens</span>
            <input
              type="number"
              min={256}
              max={4096}
              value={maxTokens}
              onChange={(event) => setMaxTokens(Math.max(256, Math.min(4096, Number(event.target.value) || 2048)))}
              className="w-full rounded-lg border border-white/10 bg-black/35 px-2 py-2 text-[#d0d0d0]"
            />
          </label>
        </div>

        <button
          onClick={() => {
            void queue();
          }}
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#76c442] px-3 py-2 text-xs font-semibold text-black disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Orbit className="h-3.5 w-3.5" />}
          Analyze
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,#0e0e0e_0%,#0a0a0a_100%)] p-4 space-y-4 min-h-[560px]">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-widest text-[#848484]">Reasoning Trace</p>
            <button
              onClick={() => setShowReasoning((prev) => !prev)}
              className="inline-flex items-center gap-1 text-xs text-[#a2a2a2]"
            >
              {showReasoning ? "Hide" : "Show"}
              <ChevronDown className={`h-3.5 w-3.5 transition ${showReasoning ? "rotate-180" : ""}`} />
            </button>
          </div>
          {showReasoning && (
            <pre className="mt-2 max-h-[200px] overflow-auto rounded-lg border-l-2 border-[#76c44255] bg-black/35 p-3 text-xs leading-6 text-[#cfcfcf] font-mono whitespace-pre-wrap">
              {parsedReasoning.reasoning || "No reasoning trace returned."}
            </pre>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4 min-h-[230px]">
          <p className="text-[10px] uppercase tracking-widest text-[#848484] mb-2">Final Answer</p>
          {parsedReasoning.finalAnswer ? (
            <p className="text-sm leading-7 text-[#d8d8d8] whitespace-pre-wrap">{parsedReasoning.finalAnswer}</p>
          ) : (
            <p className="text-sm text-[#666]">Analysis output appears here.</p>
          )}
        </div>

        <div className="text-xs text-[#8c8c8c]">Status: {statusLabel}</div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-[#848484]">Follow-up</p>
          <div className="flex gap-2">
            <input
              value={followup}
              onChange={(event) => setFollowup(event.target.value)}
              placeholder="Ask follow-up about the same clip"
              className="flex-1 rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-[#d8d8d8]"
            />
            <button
              onClick={() => {
                void queueFollowup();
              }}
              disabled={loading}
              className="rounded-lg bg-white/10 px-3 py-2 text-xs text-[#d8d8d8]"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTransferPlayground = () => (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
      <div className="rounded-2xl border border-white/10 bg-[#111111] p-4 space-y-4 max-h-[78vh] overflow-y-auto">
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-widest text-[#848484]">Source video</label>
          <input
            value={sourceVideoUrl}
            onChange={(event) => setSourceVideoUrl(event.target.value)}
            placeholder="https://..."
            className="mb-2 w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-xs text-[#d8d8d8]"
          />
          <input
            type="file"
            accept="video/*"
            className="w-full rounded-lg border border-white/10 bg-black/35 px-2 py-2 text-xs text-[#d8d8d8]"
            onChange={(event) => uploadSourceVideo(event.target.files?.[0] || null)}
          />
          {(sourceVideoPreview || sourceVideoUrl) && (
            <video
              src={sourceVideoPreview || sourceVideoUrl}
              controls
              className="mt-2 w-full rounded-lg border border-white/10 max-h-[190px]"
            />
          )}
        </div>

        <label className="space-y-1 block">
          <span className="text-[10px] uppercase tracking-widest text-[#848484]">Prompt</span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={4}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-[#e6e6e6]"
          />
        </label>

        <label className="space-y-1 block">
          <span className="text-[10px] uppercase tracking-widest text-[#848484]">Negative Prompt</span>
          <textarea
            value={negativePrompt}
            onChange={(event) => setNegativePrompt(event.target.value)}
            rows={3}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-[#dfdfdf]"
          />
        </label>

        <div>
          <p className="mb-1 text-[10px] uppercase tracking-widest text-[#848484]">Resolution</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {(["480p", "720p"] as Resolution[]).map((entry) => (
              <button
                key={entry}
                onClick={() => setResolution(entry)}
                className={`rounded-lg border px-2 py-2 ${
                  resolution === entry
                    ? "border-[#76c44255] bg-[#76c44212] text-[#bde29d]"
                    : "border-white/10 bg-black/25 text-[#a3a3a3]"
                }`}
              >
                {entry}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label className="block text-xs text-[#8f8f8f]">
            <div className="mb-1 flex items-center justify-between">
              <span>Steps</span>
              <span>{steps}</span>
            </div>
            <input
              type="range"
              min={10}
              max={60}
              value={steps}
              onChange={(event) => setSteps(Number(event.target.value) || 35)}
              className="w-full"
            />
          </label>

          <label className="block text-xs text-[#8f8f8f]">
            <div className="mb-1 flex items-center justify-between">
              <span>CFG</span>
              <span>{cfgScale.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min={1}
              max={16}
              step={0.1}
              value={cfgScale}
              onChange={(event) => setCfgScale(Number(event.target.value) || 7.5)}
              className="w-full"
            />
          </label>

          <label className="block text-xs text-[#8f8f8f]">
            <span className="mb-1 block">Seed</span>
            <input
              type="number"
              min={0}
              value={seed}
              onChange={(event) => setSeed(Math.max(0, Math.round(Number(event.target.value) || 0)))}
              className="w-full rounded-lg border border-white/10 bg-black/35 px-2 py-2 text-[#d9d9d9]"
            />
          </label>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2">
          <button
            onClick={() => setAdvancedOpen((prev) => !prev)}
            className="inline-flex items-center gap-1 text-xs text-[#c8c8c8]"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition ${advancedOpen ? "rotate-180" : ""}`} />
            Advanced - Auto (edge + blur extracted automatically)
          </button>

          {advancedOpen && (
            <div className="space-y-2">
              {(Object.entries(signals) as Array<["edge" | "depth" | "seg" | "blur", SignalConfig]>).map(
                ([key, value]) => (
                  <div key={key} className="rounded-lg border border-white/10 bg-black/25 p-2 text-xs">
                    <label className="mb-1 flex items-center justify-between text-[#c9c9c9]">
                      <span className="uppercase">{key}</span>
                      <input
                        type="checkbox"
                        checked={value.enabled}
                        onChange={(event) => setSignalValue(key, { enabled: event.target.checked })}
                      />
                    </label>
                    {value.enabled && (
                      <>
                        <input
                          type="file"
                          accept="video/*,image/*"
                          className="mb-2 w-full rounded-lg border border-white/10 bg-black/35 px-2 py-1.5 text-[11px] text-[#d8d8d8]"
                          onChange={(event) =>
                            setSignalValue(key, {
                              uploadName: event.target.files?.[0]?.name || "",
                            })
                          }
                        />
                        {value.uploadName && (
                          <p className="mb-1 text-[10px] text-[#8b8b8b] truncate">{value.uploadName}</p>
                        )}
                        <label className="block">
                          <div className="mb-1 flex items-center justify-between text-[11px] text-[#a3a3a3]">
                            <span>Weight</span>
                            <span>{value.weight.toFixed(2)}</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={value.weight}
                            onChange={(event) =>
                              setSignalValue(key, {
                                weight: Number(event.target.value) || 0.5,
                              })
                            }
                            className="w-full"
                          />
                        </label>
                      </>
                    )}
                  </div>
                ),
              )}
            </div>
          )}
        </div>

        <p className="text-[11px] text-amber-300/80">~2-10 min generation time depending on source clip and controls.</p>

        <button
          onClick={() => {
            void queue();
          }}
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#76c442] px-3 py-2 text-xs font-semibold text-black disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Orbit className="h-3.5 w-3.5" />}
          {status === "queued" || status === "processing" ? "Queued" : "Generate Video"}
        </button>
      </div>

      <div className="space-y-3">
        <div
          className={`rounded-2xl border bg-[#0e0e0e] p-4 min-h-[360px] transition ${
            status === "processing" || status === "queued"
              ? "border-[#76c44266] animate-pulse"
              : "border-white/10"
          }`}
        >
          {videoUrl ? (
            <video src={videoUrl} controls loop autoPlay className="w-full rounded-lg border border-white/10" />
          ) : (
            <div className="grid h-full min-h-[320px] place-items-center text-center px-4">
              <p className="text-sm text-[#7f7f7f]">Generated video will appear here.</p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-[#8f8f8f] space-y-2">
          <div className="flex items-center justify-between">
            <span>Seed: {seed}</span>
            <span>Resolution: {resolution}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={downloadVideo} className="inline-flex items-center gap-1 text-[#d5d5d5] hover:text-white">
              <Download className="h-3.5 w-3.5" /> Download MP4
            </button>
            <button
              onClick={() => {
                void shareVideo();
              }}
              className="inline-flex items-center gap-1 text-[#d5d5d5] hover:text-white"
            >
              <Share2 className="h-3.5 w-3.5" /> Share
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/25 p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-[#7e7e7e]">Queue Status</p>
          <p className="text-xs text-[#b7b7b7]">{statusLabel}</p>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full transition-all duration-700 ${
                status === "failed" ? "bg-red-400/80" : "bg-[#76c442]"
              }`}
              style={{ width: `${statusProgress(status)}%` }}
            />
          </div>
          {statusUrl && (
            <a href={statusUrl} target="_blank" rel="noreferrer" className="text-[11px] text-[#95bf7a] underline">
              {statusUrl}
            </a>
          )}
          {resultText && (
            <pre className="text-xs leading-6 text-[#c9c9c9] rounded-lg border border-white/10 bg-black/35 p-3 overflow-x-auto whitespace-pre-wrap">
              {resultText}
            </pre>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          <p className="mb-2 text-[10px] uppercase tracking-widest text-[#7e7e7e]">Generation History</p>
          <div className="flex gap-2 overflow-x-auto">
            {history.length === 0 && <p className="text-xs text-[#686868]">No generations yet.</p>}
            {history.map((record) => (
              <button
                key={record.id}
                onClick={() => setVideoUrl(record.url)}
                className="min-w-[180px] rounded-lg border border-white/10 bg-black/35 p-2 text-left"
              >
                <video src={record.url} className="h-20 w-full rounded-md object-cover border border-white/10" />
                <p className="mt-1 truncate text-[10px] text-[#c5c5c5]">{record.prompt}</p>
                <p className="text-[10px] text-[#7f7f7f]">
                  {record.resolution} | Seed {record.seed}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,#111111_0%,#0b0b0b_100%)] p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            onClick={() => setModel("cosmos-reason2-8b")}
            className={`rounded-full px-3 py-1.5 transition ${
              model === "cosmos-reason2-8b"
                ? "bg-[#76c44220] border border-[#76c44250] text-[#bde29d]"
                : "bg-white/[0.03] border border-white/10 text-[#a9a9a9]"
            }`}
          >
            🔬 Cosmos Reason2 8B
          </button>
          <button
            onClick={() => setModel("cosmos-transfer2.5-2b")}
            className={`rounded-full px-3 py-1.5 transition ${
              model === "cosmos-transfer2.5-2b"
                ? "bg-[#76c44220] border border-[#76c44250] text-[#bde29d]"
                : "bg-white/[0.03] border border-white/10 text-[#a9a9a9]"
            }`}
          >
            🎬 Cosmos Transfer2.5 2B
          </button>
        </div>
      </div>

      {isReasonModel ? renderReasonPlayground() : renderTransferPlayground()}
    </div>
  );
}
