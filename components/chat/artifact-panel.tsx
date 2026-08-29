"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useActiveChat, type UIArtifact } from "@/hooks/use-active-chat";
import { Surface, useReducedFx } from "@/components/ui/surface";
import { DocumentReference } from "@/components/chat/leopard/document-reference";
import type { ArtifactKind } from "@/lib/types";

/**
 * ArtifactPanel — Φ6 minimal text-only side panel. Slides in from the right
 * when a `createDocument` tool call streams `data-*` parts (see
 * use-active-chat.onData). Renders the streamed markdown body live; persists on
 * `data-finish` via api.documents.save (handled in the hook).
 *
 * Scope (this increment): text kind only. Code/sheet/image kinds show a
 * "soon" placeholder — their handlers + editors (CodeMirror / react-data-grid /
 * image) and the edit/update/suggestions tools ship in the next increment.
 * Version-nav, toolbar, diff view, and suggestions are also deferred (they
 * depend on the deferred tools). This panel proves the stream → assemble →
 * persist → render loop end-to-end for the text case.
 *
 * Theme: amber/solid, leopard's existing dark:/light: variants (the
 * Zustand theme store + next-themes swap is Phase 7 — these classes already
 * resolve in Phase 5's setup).
 */

const KIND_LABEL: Record<ArtifactKind, string> = {
  text: "Document",
  code: "Code",
  sheet: "Sheet",
  image: "Image",
  file: "File",
};

export function ArtifactPanel() {
  const { artifact, setArtifact } = useActiveChat();

  // Rehydrate reopened artifacts from Convex. A past doc is reopened from a
  // DocumentCard click in the transcript (see message.tsx DocumentCard),
  // which seeds metadata + content:"" + status:"idle". This query fetches
  // the persisted content; the effect merges it into the panel state. It is
  // skipped during live streams (status "streaming") — those populate content
  // via the data-*Delta deltas in use-active-chat.onData — and skipped once
  // content is present, so it never clobbers an in-flight or already-loaded
  // doc.
  const reopenId =
    artifact?.status === "idle" && !artifact.content
      ? artifact.documentId
      : undefined;
  const fetched = useQuery(
    api.documents.getLatest,
    reopenId ? { id: reopenId } : "skip",
  );
  useEffect(() => {
    if (fetched && artifact && !artifact.content && artifact.status === "idle") {
      setArtifact({
        ...artifact,
        content: fetched.content ?? "",
        title: artifact.title || fetched.title || "Untitled",
      });
    }
  }, [fetched, artifact, setArtifact]);

  const open = artifact?.isVisible === true;

  const handleClose = () => {
    // Drop state entirely on close — the doc was persisted on data-finish;
    // re-opening rides a new tool call. Keeps the panel stateless across closes.
    setArtifact(null);
  };

  // Reduced fx (Safari / prefers-reduced-motion): plain opaque sheet, no fx.
  const reduced = useReducedFx();

  return (
    <AnimatePresence>
      {open && artifact ? (
        <Surface
          key="artifact-panel"
          blur={20}
          radius={20}
          saturation={1.35}
          specular
          chroma={0}
          className="absolute inset-y-3 right-3 z-20 w-[min(472px,calc(100vw-1.5rem))]"
        >
          <motion.aside
            initial={{ scale: 0.985, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.985, opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className={`flex h-full flex-col overflow-hidden rounded-[20px] border dark:border-white/15 light:border-black/10 ${
              reduced
                ? "dark:bg-[#0a0a0a]/90 light:bg-[#faf8f1]/92 backdrop-blur-2xl"
                : "dark:bg-[#0a0a0a]/78 light:bg-[#faf8f1]/78"
            }`}
          >
            <PanelHeader artifact={artifact} onClose={handleClose} />
            <PanelBody artifact={artifact} />
          </motion.aside>
        </Surface>
      ) : null}
    </AnimatePresence>
  );
}

function PanelHeader({
  artifact,
  onClose,
}: {
  artifact: UIArtifact;
  onClose: () => void;
}) {
  const isStreaming = artifact.status === "streaming";
  return (
    <div className="flex items-center gap-2 pl-2 pr-2 py-2 border-b dark:border-white/[0.08] light:border-black/[0.08] shrink-0">
      <DocumentReference
        className="max-w-none flex-1 border-0 bg-none p-1.5 shadow-none backdrop-blur-none dark:bg-none light:bg-none"
        title={artifact.title || "Generating…"}
        kind={
          KIND_LABEL[artifact.kind] + (isStreaming ? " · streaming" : "")
        }
        pages={Math.max(1, Math.ceil(artifact.content.length / 3000))}
        anchors={[]}
        activePage={-1}
      />
      <button
        onClick={onClose}
        className="h-8 w-8 flex items-center justify-center rounded-lg dark:text-[#505050] light:text-[#737373] hover:dark:text-[#e5e5e5] hover:light:text-[#262626] hover:dark:bg-white/[0.06] hover:light:bg-black/[0.04] transition-colors shrink-0"
        title="Close panel"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function PanelBody({ artifact }: { artifact: UIArtifact }) {
  const isStreaming = artifact.status === "streaming";

  // Code/sheet/image handlers ship in the next increment; surface a clear
  // placeholder so the panel isn't a blank screen if the model emits one of
  // those kinds before the matching handler+editor land.
  if (artifact.kind !== "text") {
    return (
      <div className="flex-1 flex items-center justify-center px-8 text-center">
        <div className="space-y-2">
          <Loader2 className="h-5 w-5 mx-auto text-[#ffb400] animate-spin" />
          <p className="text-sm font-body dark:text-[#a0a0a0] light:text-[#555]">
            {KIND_LABEL[artifact.kind]} artifacts render in the next phase.
          </p>
          <p className="text-xs font-mono dark:text-[#505050] light:text-[#8a8a8a]">
            kind="{artifact.kind}" streamed but no editor ported yet.
          </p>
        </div>
      </div>
    );
  }

  // Text artifact: stream the markdown body live. Empty state while the model
  // is still warming up (content not yet flowing).
  if (!artifact.content && isStreaming) {
    return (
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="flex items-center gap-2 dark:text-[#606060] light:text-[#8a8a8a] text-sm font-mono">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          generating…
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-6 min-h-0">
      <div className="markdown-body text-[15px] leading-[1.75] dark:text-[#dedede] light:text-[#262626]">
        <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={(u) => u}>
          {artifact.content}
        </ReactMarkdown>
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-[#ffb400] ml-0.5 align-text-bottom animate-pulse" />
        )}
      </div>
    </div>
  );
}
