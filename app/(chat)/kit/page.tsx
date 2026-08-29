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
import { AgentCard } from "@/components/chat/leopard/agent-card";
import { AgentHandoff } from "@/components/chat/leopard/agent-handoff";
import { SubagentList } from "@/components/chat/leopard/subagent-list";
import { FlowGraph } from "@/components/chat/leopard/flow-graph";
import { CanvasSplit, CanvasSplitThread, CanvasSplitDocument } from "@/components/chat/leopard/canvas-split";
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
import { ThreadLayout, ThreadWelcome, ThreadSuggestions } from "@/components/chat/leopard/primitives/thread";
import { ThreadList } from "@/components/chat/leopard/primitives/thread-list";
import { AssistantSidebar } from "@/components/chat/leopard/primitives/assistant-sidebar";
import { Flow } from "@/components/chat/leopard/primitives/flow";
import { GenerativeUI } from "@/components/chat/leopard/primitives/generative-ui";
import { MarkdownText } from "@/components/chat/leopard/primitives/markdown-text";
import { SyntaxHighlighter } from "@/components/chat/leopard/primitives/syntax-highlighter";
import { MermaidDiagram } from "@/components/chat/leopard/primitives/mermaid-diagram";
import { ImageBlock } from "@/components/chat/leopard/primitives/image";
import { FileCard } from "@/components/chat/leopard/primitives/file";
import { QuoteBlock } from "@/components/chat/leopard/primitives/quote";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/chat/leopard/primitives/accordion";
import { Badge } from "@/components/chat/leopard/primitives/badge";
import { Select } from "@/components/chat/leopard/primitives/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/chat/leopard/primitives/tabs";
import { DotMatrix } from "@/components/chat/leopard/primitives/dot-matrix";
import { NumberRoll } from "@/components/chat/leopard/primitives/number-roll";
import { DirectiveText } from "@/components/chat/leopard/primitives/directive-text";
import { ContextDisplayRing, ContextDisplayBar, ContextDisplayText } from "@/components/chat/leopard/primitives/context-display";
import { HeatGraph } from "@/components/chat/leopard/primitives/heat-graph";
import { ComposerTriggerPopover } from "@/components/chat/leopard/primitives/composer-trigger-popover";
import { DiffViewer } from "@/components/chat/leopard/primitives/diff-viewer";

// Kit gallery (dev only): live mount for the presentational forks that have no
// data source in the chat surface yet. Route 404s outside development.
// cost-meter / number-ticker / activity-graph are wired for real in the header
// UsageReadout popover (components/chat/usage-readout.tsx).
export default function KitGalleryPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [branch, setBranch] = useState(0);
  const [hunks, setHunks] = useState<readonly DiffHunk[]>(SAMPLE_HUNKS);
  const [selectValue, setSelectValue] = useState("fast");
  const [tab, setTab] = useState("preview");

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

      <Group label="Rendering primitives">
        <div className="max-w-xl">
          <MarkdownText content={SAMPLE_MARKDOWN} />
        </div>
        <div className="w-full max-w-xl">
          <SyntaxHighlighter
            language="ts"
            code={`export function greet(name: string) {\n  return \`hello \${name}\`;\n}`}
          />
        </div>
        <div className="w-full max-w-xl">
          <MermaidDiagram
            code={"graph LR\n  A[plan] --> B[search]\n  B --> C[write]"}
          />
        </div>
        <ImageBlock
          src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180'%3E%3Crect width='320' height='180' fill='%23ffb400'/%3E%3Ccircle cx='160' cy='90' r='52' fill='%23000'/%3E%3C/svg%3E"
          filename="leopard-dot.svg"
        />
        <FileCard
          filename="report.md"
          mimeType="text/markdown"
          data="data:text/markdown;base64,IyBSZXBvcnQKCkJvZHk="
        />
        <QuoteBlock text="the fast tier answers these at a fifth of the latency with no visible quality drop" />
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

      <Group label="Agents & flow">
        <AgentCard
          name="research-worker"
          description="Detached multi-source research agent"
          provider="leopard"
          version="1.0"
          model="nemotron-lightning"
          endpoint="/api/research"
          skills={[{ name: "search", description: "Web search via Tavily" }]}
          connected
          onConnect={() => {}}
        />
        <AgentHandoff
          from="chat"
          to="research-worker"
          reason="User asked for a deep dive"
          carried={["query", "depth"]}
          settled
        />
        <SubagentList
          agents={[
            { name: "planner", model: "nemotron" },
            { name: "fetcher", model: "nemotron" },
          ]}
          completedCount={1}
          progress={[1, 0.5]}
          showSummary
          summaryAgent={{ name: "writer", model: "nemotron" }}
        />
        <FlowGraph
          visibleCount={4}
          nodes={[
            { id: "plan", label: "plan", column: 0, row: 0, state: "done" },
            { id: "search", label: "search", column: 1, row: 0, state: "done" },
            { id: "read", label: "read", column: 2, row: 0, state: "active" },
            { id: "write", label: "write", column: 3, row: 0, state: "pending" },
          ]}
          edges={[
            { from: "plan", to: "search" },
            { from: "search", to: "read" },
            { from: "read", to: "write" },
          ]}
        />
        <CanvasSplit>
          <CanvasSplitThread>thread column</CanvasSplitThread>
          <CanvasSplitDocument>document canvas</CanvasSplitDocument>
        </CanvasSplit>
      </Group>

      <Group label="Layout primitives">
        <div className="h-105 w-full max-w-xl overflow-hidden rounded-2xl border dark:border-white/[0.08] light:border-black/[0.08]">
          <ThreadLayout
            empty
            welcome={
              <ThreadWelcome>
                <h1 className="text-2xl font-medium tracking-tight">How can I help?</h1>
              </ThreadWelcome>
            }
            composer={
              <div className="rounded-3xl border p-3 text-sm text-foreground/40 dark:border-white/[0.08] light:border-black/[0.08]">
                composer slot
              </div>
            }
            suggestions={
              <ThreadSuggestions>
                {["Summarize", "Brainstorm", "Draft email"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="rounded-full border px-3.5 py-1.5 text-sm dark:border-white/[0.08] light:border-black/[0.08] hover:bg-foreground/[0.05]"
                  >
                    {s}
                  </button>
                ))}
              </ThreadSuggestions>
            }
          />
        </div>

        <div className="w-64 rounded-2xl border p-2 dark:border-white/[0.08] light:border-black/[0.08]">
          <ThreadList
            threads={[
              { id: "1", title: "Sprint plan", at: new Date(), active: true, running: true },
              { id: "2", title: "Model comparison", at: new Date(Date.now() - 3_600_000) },
              { id: "3", title: "Old research", at: new Date(Date.now() - 3 * 86_400_000) },
            ]}
            onNew={() => {}}
            onSelect={() => {}}
            onRename={() => {}}
          />
        </div>

        <div className="h-64 w-full max-w-2xl overflow-hidden rounded-2xl border dark:border-white/[0.08] light:border-black/[0.08]">
          <AssistantSidebar
            thread={
              <div className="flex h-full items-center justify-center text-sm text-foreground/40">
                thread pane
              </div>
            }
          >
            <div className="flex h-full items-center justify-center text-sm text-foreground/40">
              main content (drag the divider)
            </div>
          </AssistantSidebar>
        </div>

        <div className="w-full max-w-xl rounded-2xl border p-4 dark:border-white/[0.08] light:border-black/[0.08]">
          <Flow.Root className="my-0">
            <Flow.Canvas
              edges={[
                { from: "plan", to: "search" },
                { from: "search", to: "write" },
                { from: "write", to: "search", route: "loop-bottom", label: "refine" },
              ]}
            >
              <Flow.Column>
                <Flow.Node flowId="plan" tone="amber">plan</Flow.Node>
                <Flow.Arrow direction="down" length={28} />
                <Flow.Node flowId="search">search</Flow.Node>
                <Flow.Arrow direction="down" length={28} />
                <Flow.Node flowId="write" variant="decision">write</Flow.Node>
              </Flow.Column>
            </Flow.Canvas>
          </Flow.Root>
        </div>

        <GenerativeUI
          className="w-full max-w-xl"
          node={{
            type: "card",
            title: "generated panel",
            children: [
              { type: "markdown", text: "A model-described UI tree, rendered with leopard surfaces." },
              {
                type: "row",
                children: [
                  { type: "metric", label: "latency", value: "0.4s", hint: "first token" },
                  { type: "metric", label: "tokens", value: "1,204" },
                ],
              },
            ],
          }}
        />
      </Group>

      <Group label="Chrome primitives">
        <div className="w-72">
          <Accordion>
            <AccordionItem value="a">
              <AccordionTrigger>Sources</AccordionTrigger>
              <AccordionContent>Three citations collapsed behind the header.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="b">
              <AccordionTrigger>Reasoning</AccordionTrigger>
              <AccordionContent>Chain summary renders here.</AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="warning">amber</Badge>
          <Badge variant="secondary">secondary</Badge>
          <Badge variant="success">success</Badge>
          <Badge variant="destructive">error</Badge>
          <Badge variant="muted" size="sm">muted sm</Badge>
        </div>

        <Select
          value={selectValue}
          onValueChange={setSelectValue}
          options={[
            { value: "fast", label: "nemotron-lightning" },
            { value: "deep", label: "deepseek-v4-pro" },
          ]}
        />

        <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
          <TabsList>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="code">Code</TabsTrigger>
          </TabsList>
          <TabsContent value="preview" className="text-sm text-foreground/60">rendered output pane</TabsContent>
          <TabsContent value="code" className="text-sm text-foreground/60">source pane</TabsContent>
        </Tabs>

        <div className="flex items-center gap-4">
          <DotMatrix state="thinking" label="thinking" />
          <DotMatrix state="success" label="done" />
          <DotMatrix state="error" label="failed" />
          <DotMatrix state="warning" label="warning" />
        </div>

        <div className="flex items-baseline gap-3 font-mono text-sm">
          <NumberRoll value={1204} suffix=" tok" />
          <NumberRoll value={0.42} format={{ minimumFractionDigits: 2 }} suffix="s" />
          <NumberRoll value={0.031} prefix="$" format={{ minimumFractionDigits: 3 }} />
        </div>

        <p className="max-w-md text-sm text-foreground/70">
          <DirectiveText text="Reading {file:lib/ai/prompts.ts|prompts.ts} then running {tool:search|web search} before I answer." />
        </p>

        <div className="flex items-center gap-2">
          <ContextDisplayRing
            modelContextWindow={200_000}
            usage={{ totalTokens: 58_400, inputTokens: 41_200, outputTokens: 17_200 }}
          />
          <ContextDisplayBar
            modelContextWindow={200_000}
            usage={{ totalTokens: 142_000, inputTokens: 98_000, outputTokens: 44_000 }}
          />
          <ContextDisplayText
            modelContextWindow={200_000}
            usage={{ totalTokens: 186_500, inputTokens: 120_000, outputTokens: 66_500 }}
          />
        </div>

        <div className="w-full max-w-xl overflow-x-auto">
          <HeatGraph
            data={Array.from({ length: 120 }, (_, i) => ({
              date: new Date(Date.now() - 1000 * 60 * 60 * 24 * (119 - i)),
              count: (i * 13) % 11,
            }))}
          />
        </div>

        <div className="relative h-64 w-72 rounded-2xl border dark:border-white/[0.08] light:border-black/[0.08]">
          <ComposerTriggerPopover
            categories={[
              { id: "files", label: "Files" },
              { id: "tools", label: "Tools" },
            ]}
            onSelectCategory={() => {}}
            className="absolute bottom-2 left-2"
          />
        </div>

        <div className="w-full max-w-xl">
          <DiffViewer patch={SAMPLE_PATCH} />
        </div>
      </Group>
    </div>
  );
}

const SAMPLE_MARKDOWN = [
  "## Leopard digest",
  "",
  "Static render via `MarkdownText` — **bold**, *italic*, `inline code`, and a [link](https://example.com).",
  "",
  "> Quoted context stays muted with an amber rail.",
  "",
  "- item one",
  "- item two",
  "",
  "| model | latency |",
  "| --- | --- |",
  "| nemotron-lightning | 0.4s |",
  "| deepseek-v4-pro | 2.8s |",
  "",
  "```ts",
  "const answer = await leopard.ask(question);",
  "```",
].join("\n");

const SAMPLE_PATCH = [
  "--- a/lib/ai/prompts.ts",
  "+++ b/lib/ai/prompts.ts",
  "@@ -1,3 +1,4 @@",
  " export const SYSTEM = [",
  "-  'Be helpful.',",
  "+  'Answer like a leopard: precise, fast.',",
  "+  'Cite sources when browsing.',",
  " ].join(' ')",
].join("\n");

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
