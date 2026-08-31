"use client";

// Dev-only visual showcase for forked elements that have no live backend
// surface yet (agent handshakes, confidence scoring, subagent rosters, flow
// graphs). Everything below renders from static sample data so the visuals
// can be reviewed at /dev/showcase without wiring fake backends. Production
// builds return 404.

import { notFound } from "next/navigation";
import { useState } from "react";
import { AgentCard } from "@/components/chat/leopard/agent-card";
import { AgentHandoff } from "@/components/chat/leopard/agent-handoff";
import { ConfidenceMarker } from "@/components/chat/leopard/confidence-marker";
import { FlowGraph } from "@/components/chat/leopard/flow-graph";
import { ScoreBreakdown } from "@/components/chat/leopard/score-breakdown";
import { SubagentList } from "@/components/chat/leopard/subagent-list";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-foreground/60 font-mono text-[11px] tracking-wide uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function ShowcasePage() {
  if (process.env.NODE_ENV === "production") notFound();
  const [hoveredClaim, setHoveredClaim] = useState("c2");
  const [connected, setConnected] = useState(false);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-6 py-10">
      <h1 className="text-lg font-semibold">Fork element showcase</h1>

      <Section title="AgentCard">
        <AgentCard
          name="researcher"
          description="Deep-research subagent — crawls sources and compiles a report."
          provider="leopard"
          version="0.4.2"
          model="nvidia/nemotron-3.5-lightning-30b-a3b"
          endpoint="/api/research"
          skills={[
            { name: "web-search", description: "Searches and reads pages" },
            { name: "summarize", description: "Compiles findings" },
          ]}
          connected={connected}
          onConnect={() => setConnected((c) => !c)}
        />
      </Section>

      <Section title="AgentHandoff">
        <AgentHandoff
          from="planner"
          to="researcher"
          reason="Needs live sources before drafting the answer."
          carried={["user question", "outline draft", "3 seed links"]}
          settled={false}
        />
        <AgentHandoff
          from="researcher"
          to="writer"
          reason="Report compiled — 12 sources read."
          carried={["report.md", "source list"]}
          settled
        />
      </Section>

      <Section title="SubagentList">
        <SubagentList
          agents={[
            { name: "planner", model: "nemotron-lightning" },
            { name: "researcher", model: "nemotron-lightning" },
            { name: "writer", model: "nemotron-lightning" },
          ]}
          completedCount={1}
          progress={[1, 0.45, 0]}
          showSummary
          summaryAgent={{ name: "critic", model: "nemotron-lightning" }}
        />
      </Section>

      <Section title="ConfidenceMarker">
        <ConfidenceMarker
          claims={[
            {
              id: "c1",
              text: "NIM emits a usage chunk when stream_options.include_usage is set.",
              confidence: "grounded",
              basis: "Verified against the live API 2026-08-31",
            },
            {
              id: "c2",
              text: "Lightning is ~2× faster than the previous default on short turns.",
              confidence: "inferred",
              basis: "Median of 6 sampled turns",
            },
            {
              id: "c3",
              text: "The gateway may add a free tier for image models.",
              confidence: "uncertain",
              basis: "Unconfirmed roadmap note",
            },
          ]}
          hoveredId={hoveredClaim}
          onHover={setHoveredClaim}
        />
      </Section>

      <Section title="ScoreBreakdown">
        <ScoreBreakdown
          verdict="Good answer, minor gaps"
          total={82}
          outOf={100}
          visibleCount={4}
          criteria={[
            { label: "Accuracy", score: 34, weight: 40, note: "All claims check out" },
            { label: "Completeness", score: 24, weight: 30, note: "Missed edge case" },
            { label: "Clarity", score: 15, weight: 15 },
            { label: "Concision", score: 9, weight: 15, note: "Slightly wordy" },
          ]}
        />
      </Section>

      <Section title="FlowGraph">
        <FlowGraph
          visibleCount={6}
          nodes={[
            { id: "prompt", label: "prompt", column: 0, row: 0, state: "done" },
            { id: "plan", label: "plan", column: 1, row: 0, state: "done" },
            { id: "search", label: "search", column: 2, row: 0, state: "active" },
            { id: "read", label: "read", column: 3, row: 0, state: "pending" },
            { id: "write", label: "write", column: 3, row: 1, state: "pending" },
            { id: "done", label: "done", column: 4, row: 0, state: "pending" },
          ]}
          edges={[
            { from: "prompt", to: "plan" },
            { from: "plan", to: "search" },
            { from: "search", to: "read" },
            { from: "read", to: "write" },
            { from: "search", to: "done" },
          ]}
        />
      </Section>
    </main>
  );
}
