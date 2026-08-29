"use client";

import { notFound } from "next/navigation";
import { useState } from "react";
import { ChatPanel, ChatPanelMessages } from "@/components/chat/leopard/chat-panel";
import { LauncherBubble } from "@/components/chat/leopard/launcher-bubble";
import { ImageGeneration } from "@/components/chat/leopard/image-generation";
import { ElicitationForm } from "@/components/chat/leopard/elicitation-form";
import { CheckpointHistory } from "@/components/chat/leopard/checkpoint-history";
import { MessageTiming } from "@/components/chat/leopard/message-timing";
import { MessageBranches } from "@/components/chat/leopard/message-branches";
import { TraceWaterfall } from "@/components/chat/leopard/trace-waterfall";
import { ActivityGraph } from "@/components/chat/leopard/activity-graph";
import { TodoList } from "@/components/chat/leopard/todo-list";
import { ScheduleCard } from "@/components/chat/leopard/schedule-card";
import { ScoreBreakdown } from "@/components/chat/leopard/score-breakdown";
import { ComparisonCard } from "@/components/chat/leopard/comparison-card";
import { RecommendationCard } from "@/components/chat/leopard/recommendation-card";
import { FileTree } from "@/components/chat/leopard/file-tree";
import { WebPreview } from "@/components/chat/leopard/web-preview";
import { CodeDiff } from "@/components/chat/leopard/code-diff";
import { ReviewableDiff, type DiffHunk } from "@/components/chat/leopard/reviewable-diff";

// Kit gallery (dev only): live mount for the presentational forks that have no
// data source in the chat surface yet. Route 404s outside development.
// cost-meter / number-ticker / activity-graph are wired for real in the header
// UsageReadout popover (components/chat/usage-readout.tsx).
export default function KitGalleryPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [branch, setBranch] = useState(0);
  const [hunks, setHunks] = useState<readonly DiffHunk[]>(SAMPLE_HUNKS);

  const setHunk = (id: string, decision: DiffHunk["decision"]) =>
    setHunks((hs) => hs.map((h) => (h.id === id ? { ...h, decision } : h)));

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <h1 className="mb-6 font-mono text-xs uppercase tracking-widest dark:text-[#505050] light:text-[#737373]">
        Kit gallery (dev)
      </h1>

      <Group label="Chat chrome">
        <ChatPanel>
          <ChatPanelMessages />
        </ChatPanel>
        <LauncherBubble
          open={launcherOpen}
          unread={0}
          greeting="Ask anything"
          prompts={["Summarize", "Brainstorm"]}
          onToggle={() => setLauncherOpen((o) => !o)}
          onPick={() => {}}
          onStart={() => {}}
        />
        <ImageGeneration prompt="amber leopard at dusk" generating={false} />
        <ElicitationForm
          server="example-server"
          message="Allow this tool to run?"
          fields={[]}
          state="request"
          onAccept={() => {}}
          onDecline={() => {}}
        />
        <CheckpointHistory
          checkpoints={[
            { id: "a", label: "Initial draft", at: "10:00", files: 2 },
            { id: "b", label: "Added chart", at: "10:12", files: 5 },
          ]}
          currentId="b"
          onRestore={() => {}}
        />
        <MessageTiming
          stats={[
            { label: "first token", value: "0.4s" },
            { label: "total", value: "2.1s" },
          ]}
        />
        <MessageBranches
          variants={["First answer variant", "Second answer variant"]}
          index={branch}
          onIndexChange={setBranch}
        />
        <TraceWaterfall
          totalMs={420}
          visibleCount={4}
          spans={[
            { id: "1", name: "plan", depth: 0, startMs: 0, durationMs: 60, status: "completed" },
            { id: "2", name: "search", depth: 1, startMs: 60, durationMs: 210, status: "completed" },
            { id: "3", name: "synthesize", depth: 1, startMs: 270, durationMs: 130, status: "running" },
            { id: "4", name: "verify", depth: 2, startMs: 300, durationMs: 20, status: "failed" },
          ]}
        />
        <ActivityGraph
          title="Research activity"
          total="128 runs"
          start={new Date(Date.now() - 1000 * 60 * 60 * 24 * 90)}
          end={new Date()}
          data={Array.from({ length: 90 }, (_, i) => ({
            date: new Date(Date.now() - 1000 * 60 * 60 * 24 * (89 - i)),
            count: (i * 7) % 9,
          }))}
        />
        <TodoList
          items={[
            { id: "a", text: "Gather sources", status: "done" },
            { id: "b", text: "Draft report sections", status: "active" },
            { id: "c", text: "Cite inline references", status: "pending" },
          ]}
          revision={2}
        />
        <ScheduleCard
          name="Nightly digest"
          cadence="0 6 * * *"
          nextRun="tomorrow 06:00"
          enabled
          onToggle={() => {}}
          history={[
            { id: "r1", at: "today 06:00", ok: true },
            { id: "r2", at: "yesterday 06:00", ok: false },
          ]}
        />
      </Group>

      <Group label="Scoring & recommendations">
        <ScoreBreakdown
          verdict="Strong"
          total={8.2}
          outOf={10}
          visibleCount={3}
          criteria={[
            { label: "Accuracy", score: 9, weight: 2, note: "Citations checked against sources." },
            { label: "Coverage", score: 7.5, weight: 1 },
            { label: "Brevity", score: 8, weight: 1 },
          ]}
        />
        <ComparisonCard
          traitLabels={["Speed", "Vision", "Tool use"]}
          recommendedId="fast"
          reason="For interactive chat the latency gap matters more than the reasoning delta."
          options={[
            {
              id: "fast",
              name: "nemotron-lightning",
              headline: "fast + cheap",
              traits: ["~0.4s first token", "Images", "Streaming tools"],
            },
            {
              id: "deep",
              name: "deepseek-v4-pro",
              headline: "deeper reasoning",
              traits: ["~2.8s first token", false, "Streaming tools"],
            },
          ]}
        />
        <RecommendationCard
          state="idle"
          question="Switch to nemotron-lightning for this chat?"
          confidenceLabel="high confidence"
          acceptedLabel="Model switched"
          onAccept={() => {}}
          onAlternatives={() => {}}
        >
          Your last few prompts were short Q&A — the fast tier answers these at
          a fifth of the latency with no visible quality drop.
        </RecommendationCard>
      </Group>

      <Group label="Files & diffs">
        <FileTree
          visibleCount={6}
          totalAdditions={128}
          totalDeletions={34}
          nodes={[
            { path: "app", name: "app", depth: 0, kind: "folder" },
            { path: "app/settings", name: "settings", depth: 1, kind: "folder" },
            { path: "app/settings/page.tsx", name: "page.tsx", depth: 2, kind: "file", additions: 42, deletions: 6 },
            { path: "components", name: "components", depth: 0, kind: "folder" },
            { path: "components/chat/usage-readout.tsx", name: "usage-readout.tsx", depth: 1, kind: "file", additions: 86, deletions: 28 },
          ]}
        />
        <CodeDiff
          filename="lib/ai/prompts.ts"
          additions={3}
          deletions={2}
          cycle={0}
          lines={[
            { kind: "context", text: "export const SYSTEM = [" },
            { kind: "removed", text: "  'Be helpful.'," },
            { kind: "removed", text: "  'Be terse.'," },
            { kind: "added", text: "  'Answer like a leopard: precise, fast.'" },
            { kind: "added", text: "  'Cite sources when browsing.'" },
            { kind: "added", text: "  'Refuse nothing legal.'" },
            { kind: "context", text: "].join(' ')" },
          ]}
        />
        <ReviewableDiff
          filename="components/chat/composer.tsx"
          hunks={hunks}
          onKeep={(id) => setHunk(id, "kept")}
          onDiscard={(id) => setHunk(id, "discarded")}
          onApply={() => {}}
        />
      </Group>

      <Group label="Web">
        <WebPreview
          origin="localhost:3000"
          loading={false}
          onReload={() => {}}
          onOpenExternal={() => {}}
        >
          <div className="flex h-36 items-center justify-center font-mono text-xs dark:text-[#505050] light:text-[#8a8a8a]">
            sandboxed frame mounts here
          </div>
        </WebPreview>
      </Group>
    </div>
  );
}

const SAMPLE_HUNKS: readonly DiffHunk[] = [
  {
    id: "h1",
    range: "@@ -12,4 +12,5 @@",
    decision: "pending",
    lines: [
      { kind: "context", text: "const [value, setValue] = useState('')" },
      { kind: "removed", text: "const rows = 1" },
      { kind: "added", text: "const rows = useAutoRows(value)" },
      { kind: "added", text: "const canSend = value.trim().length > 0" },
    ],
  },
  {
    id: "h2",
    range: "@@ -48,3 +49,4 @@",
    decision: "pending",
    lines: [
      { kind: "removed", text: "<button onClick={submit}>Send</button>" },
      { kind: "added", text: "<SendButton disabled={!canSend} onClick={submit} />" },
    ],
  },
];

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 border-b pb-2 font-mono text-[10px] uppercase tracking-widest dark:border-white/[0.06] light:border-black/[0.06] dark:text-[#404040] light:text-[#8a8a8a]">
        {label}
      </h2>
      <div className="flex flex-wrap items-start gap-6">{children}</div>
    </section>
  );
}
