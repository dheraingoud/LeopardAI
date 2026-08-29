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

// Kit gallery (dev only): live mount for the presentational forks that have no
// data source in the chat surface yet. Route 404s outside development.
export default function KitGalleryPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [branch, setBranch] = useState(0);

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <h1 className="mb-6 font-mono text-xs uppercase tracking-widest dark:text-[#505050] light:text-[#737373]">
        Kit gallery (dev)
      </h1>
      <div className="flex flex-wrap items-start gap-6">
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
      </div>
    </div>
  );
}
