"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MODELS } from "@/types";
import { toast } from "sonner";

export default function QaPage() {
  const [prompt, setPrompt] = useState("Return exactly: QA endpoint healthy.");
  const [model, setModel] = useState("llama-3-70b");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  const mediaModels = useMemo(
    () => MODELS.filter((entry) => entry.modality === "image" || entry.modality === "vision" || entry.modality === "video-physics"),
    [],
  );

  const textModels = useMemo(
    () => MODELS.filter((entry) => !entry.modality || entry.modality === "text"),
    [],
  );

  const runQa = async () => {
    if (!prompt.trim()) {
      toast.error("Prompt is required");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/qa-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model,
        }),
      });

      const payload = (await res.json()) as { response?: string; error?: string };
      if (!res.ok) throw new Error(payload.error || "QA request failed");

      setResult(payload.response || "");
      toast.success("QA call complete");
    } catch (error) {
      const message = error instanceof Error ? error.message : "QA request failed";
      setResult(`Error: ${message}`);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      <section className="space-y-3">
        <p className="text-xs font-mono uppercase tracking-wider text-[#8a8a8a]">Quality Assurance</p>
        <h1 className="text-3xl font-semibold text-[#ececec]">Model + Media QA Console</h1>
        <p className="text-sm text-[#9a9a9a] max-w-3xl">
          Use this page to smoke-test text chat, image generation, visual analysis, and physics/video jobs.
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#0d0d0d] p-4 space-y-3">
        <h2 className="text-sm font-semibold text-[#dedede]">Text QA</h2>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-[#e6e6e6] outline-none focus:border-[#ffb40055]"
        />

        <div className="flex items-center gap-3">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-[#c9c9c9]"
          >
            {textModels.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>

          <button
            onClick={runQa}
            disabled={loading}
            className="rounded-lg bg-[#ffb400] px-3 py-2 text-xs font-semibold text-black disabled:opacity-60"
          >
            {loading ? "Running..." : "Run QA"}
          </button>
        </div>

        <pre className="min-h-[120px] rounded-lg border border-white/10 bg-black/30 p-3 text-xs leading-6 text-[#cfcfcf] whitespace-pre-wrap">
          {result || "Result will appear here"}
        </pre>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[#dedede]">Media Playgrounds</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {mediaModels.map((entry) => (
            <Link
              key={entry.id}
              href={`/app/playground/${entry.id}`}
              className="rounded-xl border border-white/10 bg-[#0d0d0d] p-4 hover:border-[#ffb40055] transition-colors"
            >
              <p className="text-sm font-semibold text-[#ececec]">{entry.name}</p>
              <p className="text-xs text-[#7f7f7f] mt-1">{entry.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
