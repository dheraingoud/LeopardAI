"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, Loader2, ScanEye } from "lucide-react";
import { toast } from "sonner";

interface AnalysisPlaygroundProps {
  defaultModelId: string;
}

interface AnalysisTurn {
  id: string;
  question: string;
  answer: string;
}

const PRESET_QUESTIONS = [
  "Describe scene composition and focal points.",
  "What physical interactions are visible in this frame?",
  "Find anomalies or unsafe behavior in the image.",
  "Provide an approve/reject verdict with reasons.",
  "Predict likely next motion from this frame.",
];

function splitReasoning(text: string) {
  const match = text.match(/<think>([\s\S]*?)<\/think>/i);
  if (!match) {
    return {
      reasoning: "",
      finalAnswer: text,
    };
  }

  const reasoning = match[1].trim();
  const finalAnswer = text.replace(match[0], "").trim();

  return { reasoning, finalAnswer };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read file"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default function AnalysisPlayground({ defaultModelId }: AnalysisPlaygroundProps) {
  const [prompt, setPrompt] = useState("Describe the key objects, scene composition, and mood in this image.");
  const [imageUrl, setImageUrl] = useState("");
  const [model, setModel] = useState(defaultModelId);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [turns, setTurns] = useState<AnalysisTurn[]>([]);
  const [showReasoning, setShowReasoning] = useState(false);
  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [maxTokens, setMaxTokens] = useState(2048);

  const { reasoning, finalAnswer } = useMemo(() => splitReasoning(analysis), [analysis]);

  const estimatedUsage = useMemo(() => {
    const input = Math.max(1, Math.round((prompt.length + turns.map((t) => t.question).join(" ").length) / 4));
    const output = Math.max(1, Math.round(analysis.length / 4));
    return { input, output };
  }, [analysis.length, prompt.length, turns]);

  const submitAnalysis = useCallback(
    async (questionText?: string) => {
      const activePrompt = (questionText || prompt).trim();
      if (!activePrompt) {
        toast.error("Prompt is required");
        return;
      }

      if (!imageUrl.trim()) {
        toast.error("Image URL or uploaded image is required");
        return;
      }

      setLoading(true);
      try {
        const contextualPrefix = turns
          .slice(-3)
          .map((turn, index) => `Turn ${index + 1} Q: ${turn.question}\nTurn ${index + 1} A: ${turn.answer}`)
          .join("\n\n");

        const contextualPrompt = contextualPrefix
          ? `${contextualPrefix}\n\nCurrent Question: ${activePrompt}\nKeep the answer concise and technical.`
          : activePrompt;

        const res = await fetch("/api/generate/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: contextualPrompt,
            imageUrl: imageUrl.trim(),
            model,
            maxTokens,
          }),
        });

        const payload = (await res.json()) as { analysis?: string; error?: string };
        if (!res.ok) {
          throw new Error(payload.error || "Analysis failed");
        }

        const nextAnswer = payload.analysis || "";
        setAnalysis(nextAnswer);
        setTurns((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            question: activePrompt,
            answer: nextAnswer,
          },
        ]);
        toast.success("Analysis complete");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Analysis failed");
      } finally {
        setLoading(false);
      }
    },
    [imageUrl, maxTokens, model, prompt, turns],
  );

  const runAnalysis = useCallback(async () => {
    await submitAnalysis();
  }, [submitAnalysis]);

  const runFollowup = useCallback(async () => {
    const clean = followUpQuestion.trim();
    if (!clean) {
      toast.error("Follow-up question is required");
      return;
    }
    setFollowUpQuestion("");
    await submitAnalysis(clean);
  }, [followUpQuestion, submitAnalysis]);

  const renderInputPreview = () => {
    if (!imageUrl) {
      return <p className="text-xs text-[#6d6d6d]">Drop image file or paste URL</p>;
    }

    if (imageUrl.startsWith("data:image")) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="Uploaded analysis input" className="h-44 w-full rounded-lg object-cover border border-white/10" />
      );
    }

    return (
      <div className="rounded-lg border border-white/10 bg-black/30 p-2">
        <p className="truncate text-xs text-[#bdbdbd]">{imageUrl}</p>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
      <div className="rounded-2xl border border-white/10 bg-[#111111] p-4 space-y-4">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-[#7e7e7e]">Input</p>
          {renderInputPreview()}
          <input
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
            placeholder="https://... or data:image/..."
            className="w-full rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-xs text-[#d8d8d8]"
          />
          <label className="block">
            <span className="mb-1 block text-[10px] text-[#7c7c7c]">Upload image</span>
            <input
              type="file"
              accept="image/*"
              className="w-full rounded-lg border border-white/10 bg-black/35 px-2 py-2 text-xs text-[#d8d8d8]"
              onChange={async (event) => {
                const file = event.target.files?.[0] || null;
                if (!file) return;
                try {
                  const dataUrl = await readFileAsDataUrl(file);
                  setImageUrl(dataUrl);
                } catch {
                  toast.error("Unable to read uploaded image");
                }
              }}
            />
          </label>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-[#7e7e7e]">Questions</p>
          <div className="flex flex-wrap gap-2">
            {PRESET_QUESTIONS.map((question) => (
              <button
                key={question}
                onClick={() => setPrompt(question)}
                className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] text-[#bbbbbb] hover:text-white"
              >
                {question}
              </button>
            ))}
          </div>
        </div>

        <label className="space-y-1 block">
          <span className="text-[10px] uppercase tracking-widest text-[#7e7e7e]">Question</span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={4}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-[#e6e6e6] outline-none focus:border-[#ffb40055]"
          />
        </label>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="space-y-1">
            <span className="text-[#858585]">Model</span>
            <select
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-[#c9c9c9]"
            >
              <option value="llama-3.2-11b-vision">Llama 3.2 11B Vision</option>
              <option value="llama-3.2-90b-vision">Llama 3.2 90B Vision</option>
              <option value="phi-3-vision-128k">Phi-3 Vision 128K</option>
              <option value="nemotron-nano-vl-8b">Nemotron Nano VL 8B</option>
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
              className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-xs text-[#c9c9c9]"
            />
          </label>
        </div>

        <button
          onClick={() => {
            void runAnalysis();
          }}
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#ffb400] px-3 py-2 text-xs font-semibold text-black disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanEye className="h-3.5 w-3.5" />}
          Analyze
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,#0e0e0e_0%,#0a0a0a_100%)] p-4 min-h-[560px] space-y-4">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] uppercase tracking-widest text-[#7d7d7d]">Reasoning Trace</p>
            <button
              onClick={() => setShowReasoning((prev) => !prev)}
              className="inline-flex items-center gap-1 text-xs text-[#a6a6a6]"
            >
              {showReasoning ? "Hide" : "Show"}
              <ChevronDown className={`h-3.5 w-3.5 transition ${showReasoning ? "rotate-180" : ""}`} />
            </button>
          </div>

          {showReasoning && (
            <pre className="mt-2 max-h-[180px] overflow-auto rounded-lg border-l-2 border-[#ffb40055] bg-black/35 p-3 text-xs leading-6 text-[#c8c8c8] whitespace-pre-wrap font-mono">
              {reasoning || "No reasoning block found."}
            </pre>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4 min-h-[220px]">
          <p className="text-[11px] uppercase tracking-widest text-[#7f7f7f] mb-2">Final Answer</p>
          {finalAnswer ? (
            <p className="text-sm leading-7 text-[#d8d8d8] whitespace-pre-wrap">{finalAnswer}</p>
          ) : (
            <p className="text-sm text-[#666]">Analysis output will appear here.</p>
          )}
        </div>

        <div className="text-xs text-[#8a8a8a]">
          Tokens: {estimatedUsage.input} in / {estimatedUsage.output} out | Model: {model}
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-[#7f7f7f]">Follow-up</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={followUpQuestion}
              onChange={(event) => setFollowUpQuestion(event.target.value)}
              placeholder="Ask a follow-up question"
              className="flex-1 rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-sm text-[#d8d8d8]"
            />
            <button
              onClick={() => {
                void runFollowup();
              }}
              disabled={loading}
              className="rounded-lg bg-white/10 px-3 py-2 text-xs text-[#d8d8d8] hover:bg-white/15"
            >
              Send
            </button>
          </div>

          {turns.length > 0 && (
            <div className="max-h-[180px] overflow-auto rounded-lg border border-white/10 bg-black/25 p-2 space-y-2">
              {turns.map((turn) => (
                <div key={turn.id} className="rounded-md border border-white/10 bg-black/30 p-2">
                  <p className="text-[11px] text-[#b8b8b8]">Q: {turn.question}</p>
                  <p className="mt-1 text-xs text-[#8e8e8e] line-clamp-3">A: {turn.answer}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
