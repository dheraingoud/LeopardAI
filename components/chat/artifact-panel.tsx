"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useActiveChat, type UIArtifact } from "@/hooks/use-active-chat";
import { useSidebar } from "@/hooks/sidebar-context";
import { Surface, useReducedFx } from "@/components/ui/surface";
import { DocumentReference } from "@/components/chat/leopard/document-reference";
import { FileTree, type FileTreeNode } from "@/components/chat/leopard/file-tree";
import { WebPreview } from "@/components/chat/leopard/web-preview";
import type { ArtifactKind } from "@/lib/types";

// ArtifactPanel — side panel for createDocument artifacts. Text renders as
// live markdown; code docs whose content is HTML/SVG render in a sandboxed
// WebPreview iframe. When the chat holds ≥2 documents (or the open title is
// path-like), a FileTree of the chat's documents sits under the header.
const KIND_LABEL: Record<ArtifactKind, string> = {
  text: "Document",
  code: "Code",
  sheet: "Sheet",
  image: "Image",
  file: "File",
};

type DocPart = {
  type: string;
  state?: string;
  output?: { id: string; title: string; kind: ArtifactKind };
};

function isPathLike(title: string): boolean {
  return title.includes("/") || title.includes("\\");
}

function isHtmlOrSvg(title: string, content: string): boolean {
  if (/\.(html?|svg)$/i.test(title)) return true;
  const head = content.trimStart().slice(0, 200).toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html") || head.startsWith("<svg");
}

// Build tree nodes from document titles, splitting path-like titles into
// folder segments. Folders sort before files; input order kept otherwise.
function buildTreeNodes(docs: { id: string; title: string }[]): FileTreeNode[] {
  const nodes: FileTreeNode[] = [];
  const folders = new Set<string>();
  for (const doc of docs) {
    const segs = doc.title.split(/[\\/]/).filter(Boolean);
    segs.forEach((seg, i) => {
      const path = segs.slice(0, i + 1).join("/");
      const isFile = i === segs.length - 1;
      if (isFile) {
        nodes.push({ path: `${path}#${doc.id}`, name: seg, depth: i, kind: "file" });
      } else if (!folders.has(path)) {
        folders.add(path);
        nodes.push({ path, name: seg, depth: i, kind: "folder" });
      }
    });
  }
  return nodes;
}

export function ArtifactPanel() {
  const { artifact, setArtifact, messages } = useActiveChat();
  // Operator 2026-09-04: opening an artifact auto-collapses the sidebar so
  // the panel gets real width (chat shifts left, artifact on the right);
  // closing restores the user's previous sidebar state.
  const { autoCollapse, restoreCollapse } = useSidebar();
  const openNow = artifact?.isVisible === true;
  useEffect(() => {
    if (!openNow) return;
    autoCollapse();
    return () => restoreCollapse();
    // autoCollapse/restoreCollapse are stable callbacks from the layout.
  }, [openNow, autoCollapse, restoreCollapse]);

  // Rehydrate reopened artifacts from Convex (seeded content:"" + status:"idle"
  // by the DocumentCard click in message.tsx). Skipped during live streams and
  // once content is present.
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

  // Documents created in this chat, from tool-createDocument parts.
  const chatDocs = useMemo(() => {
    const seen = new Set<string>();
    const docs: { id: string; title: string; kind: ArtifactKind }[] = [];
    for (const m of messages) {
      for (const p of m.parts as DocPart[]) {
        if (p.type === "tool-createDocument" && p.output && !seen.has(p.output.id)) {
          seen.add(p.output.id);
          docs.push(p.output);
        }
      }
    }
    return docs;
  }, [messages]);

  const open = artifact?.isVisible === true;

  const handleClose = () => {
    setArtifact(null);
  };

  const showTree =
    !!artifact && (chatDocs.length >= 2 || isPathLike(artifact.title));
  const treeNodes = useMemo(
    () => (showTree ? buildTreeNodes(chatDocs) : []),
    [showTree, chatDocs],
  );

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
          // Split canvas: ≥md the panel sits in-flow beside the transcript
          // (flex row in chat-shell → transcript shrinks, ChatGPT-canvas
          // style; the sidebar auto-collapses to make room); below md it
          // stays an absolute overlay.
          className="absolute inset-y-3 right-3 z-20 w-[min(472px,calc(100vw-1.5rem))] md:static md:z-auto md:my-3 md:ml-0 md:mr-3 md:h-auto md:w-[480px] md:shrink-0"
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
            {showTree && (
              <div className="shrink-0 border-b px-3 py-2 dark:border-white/[0.08] light:border-black/[0.08]">
                <FileTree
                  className="max-w-none rounded-xl p-2"
                  nodes={treeNodes}
                  visibleCount={8}
                  label="documents"
                  activePath={`${artifact.title.split(/[\\/]/).filter(Boolean).join("/")}#${artifact.documentId}`}
                  onFileClick={(node) => {
                    const id = node.path.split("#").pop()!;
                    const doc = chatDocs.find((d) => d.id === id);
                    if (doc && doc.id !== artifact.documentId) {
                      setArtifact({
                        documentId: doc.id,
                        title: doc.title,
                        kind: doc.kind,
                        content: "",
                        status: "idle",
                        isVisible: true,
                      });
                    }
                  }}
                />
              </div>
            )}
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
  const [previewTick, setPreviewTick] = useState(0);

  // HTML/SVG code docs render in a sandboxed iframe (no scripts) under
  // WebPreview chrome; other non-text kinds keep the next-phase placeholder.
  if (artifact.kind === "code" && isHtmlOrSvg(artifact.title, artifact.content)) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        <WebPreview
          className="max-w-none h-full"
          origin={artifact.title || "preview"}
          loading={isStreaming && !artifact.content}
          onReload={() => setPreviewTick((t) => t + 1)}
          onOpenExternal={() => {
            const blob = new Blob([artifact.content], {
              type: artifact.title.endsWith(".svg") ? "image/svg+xml" : "text/html",
            });
            window.open(URL.createObjectURL(blob), "_blank", "noopener");
          }}
        >
          <iframe
            key={previewTick}
            title={artifact.title || "preview"}
            sandbox=""
            srcDoc={artifact.content}
            className="h-[420px] w-full bg-white"
          />
        </WebPreview>
      </div>
    );
  }

  // kind="file" IS text content (md/txt/json/csv…) — render it like a text
  // doc. Only kinds with genuinely no textual body (images) keep the
  // placeholder. (2026-09-04: user report — panel opened with NO content.)
  if (artifact.kind !== "text" && artifact.kind !== "file") {
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
