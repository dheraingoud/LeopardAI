"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRightIcon, Eye, EyeOff, PlugIcon, PlusIcon, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  loadMcpConfig,
  saveMcpConfig,
  nextMcpId,
  MCP_PRESETS,
  parseMcpJson,
  toMcpJson,
  type McpServerConfig,
  type McpTransport,
} from "@/lib/mcp-config";
import { field, mono, paper } from "./surfaces";

// Forked server-panel rows inside the Leopard modal shell. Fail-closed probe:
// without NEXT_PUBLIC_ENABLE_MCP_PROBE every dot is neutral "unprobed" — we
// never claim reachability without a handshake. Disabled servers never probe.

type ProbeState = "awaiting" | "failed" | "unprobed";

function probeState(server: McpServerConfig): ProbeState {
  if (process.env.NEXT_PUBLIC_ENABLE_MCP_PROBE !== "1") return "unprobed";
  if (!server.enabled) return "unprobed";
  const wellFormed =
    server.type === "http"
      ? /^https?:\/\//i.test(server.url ?? "")
      : (server.command ?? "").trim().length > 0;
  return wellFormed ? "awaiting" : "failed";
}

const DOT: Record<ProbeState, { dot: string; label: string }> = {
  awaiting: { dot: "bg-[#ffb400]", label: "awaiting connection probe" },
  failed: { dot: "bg-red-500", label: "connection failed — fix the endpoint" },
  unprobed: { dot: "dark:bg-[#404040] light:bg-[#c0c0c0]", label: "not probed — no live connection check" },
};

function ServerRow({
  server,
  expanded,
  onExpand,
  onToggle,
  onRemove,
}: {
  server: McpServerConfig;
  expanded: boolean;
  onExpand: (id: string) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const state = probeState(server);
  const endpoint = server.type === "stdio" ? server.command : server.url;
  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => onExpand(server.id)}
        className="flex items-center gap-2.5 rounded-xl px-1.5 py-2 text-start transition-colors hover:dark:bg-white/[0.04] hover:light:bg-black/[0.03]"
      >
        <ChevronRightIcon
          className={cn(
            "size-3 shrink-0 transition-transform duration-200 motion-reduce:transition-none dark:text-[#505050] light:text-[#a0a0a0]",
            expanded && "rotate-90",
          )}
        />
        <PlugIcon className="size-3.5 shrink-0 dark:text-[#606060] light:text-[#8a8a8a]" />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13.5px]",
            server.enabled ? "dark:text-[#e5e5e5] light:text-[#262626]" : "dark:text-[#666] light:text-[#909090]",
          )}
        >
          {server.name}
        </span>
        <span className={cn(mono, "shrink-0 dark:text-[#505050] light:text-[#9a9a9a]")}>{server.type}</span>
        <span role="status" title={DOT[state].label} className={cn("size-1.5 shrink-0 rounded-full", DOT[state].dot)} />
        <span className="sr-only">{DOT[state].label}</span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-1.5 px-1.5 ps-8 pb-2">
          {endpoint && (
            <span className={cn(field, mono, "w-fit max-w-full truncate rounded-md px-1.5 py-0.5 dark:text-[#7a7a7a] light:text-[#6a6a6a]")}>
              {server.type}: {endpoint}
            </span>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onToggle(server.id)}
              className={cn(
                "h-7 rounded-md px-2.5 text-[10px] font-mono uppercase tracking-tight transition-colors",
                server.enabled
                  ? "dark:text-[#ffb400] light:text-[#d49600] hover:dark:bg-[#ffb400]/[0.08] hover:light:bg-[#d49600]/[0.08]"
                  : "dark:text-[#666] light:text-[#909090] hover:dark:text-white hover:light:text-black",
              )}
            >
              {server.enabled ? "on" : "off"}
            </button>
            <button
              type="button"
              onClick={() => onRemove(server.id)}
              title="Remove"
              className="flex size-7 items-center justify-center rounded-md transition-colors dark:text-[#5a5a5a] light:text-[#a0a0a0] hover:dark:bg-red-500/10 hover:light:bg-red-500/10 hover:dark:text-red-400 hover:light:text-red-500"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function McpServerPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [expandedId, setExpandedId] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState<McpServerConfig>({
    id: "",
    name: "",
    type: "http",
    url: "",
    command: "",
    headers: undefined,
    enabled: true,
  });
  const draftUrl = draft.url ?? "";
  const draftCommand = draft.command ?? "";
  const [showHeaders, setShowHeaders] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [mode, setMode] = useState<"manual" | "json">("manual");
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setServers(loadMcpConfig());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const setType = (t: McpTransport) => setDraft((d) => ({ ...d, type: t }));

  const canSave =
    draft.name.trim().length > 0 &&
    (draft.type === "http" ? draftUrl.trim().length > 0 : draftCommand.trim().length > 0);

  const resetDraft = () =>
    setDraft({ id: "", name: "", type: "http", url: "", command: "", headers: undefined, enabled: true });

  const addServer = () => {
    if (!canSave) return;
    if (draft.type === "http" && !/^https?:\/\//i.test(draftUrl.trim())) return;
    const next: McpServerConfig = {
      ...draft,
      id: nextMcpId(),
      name: draft.name.trim(),
      command: draft.type === "stdio" ? draftCommand.trim() : undefined,
      url: draft.type === "http" ? draftUrl.trim() : undefined,
      headers: draft.headers && Object.keys(draft.headers).length > 0 ? draft.headers : undefined,
    };
    const updated = [...servers, next];
    setServers(updated);
    saveMcpConfig(updated);
    setFormOpen(false);
    resetDraft();
  };

  const toggleServer = (id: string) => {
    const updated = servers.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s));
    setServers(updated);
    saveMcpConfig(updated);
  };

  const removeServer = (id: string) => {
    const updated = servers.filter((s) => s.id !== id);
    setServers(updated);
    saveMcpConfig(updated);
  };

  const addPreset = (preset: (typeof MCP_PRESETS)[number]) => {
    if (servers.some((s) => s.name === preset.server.name)) return;
    const updated = [...servers, { ...preset.server, id: nextMcpId(), enabled: true }];
    setServers(updated);
    saveMcpConfig(updated);
  };

  const importJson = () => {
    setJsonError(null);
    const res = parseMcpJson(jsonDraft);
    if (!res.ok) {
      setJsonError(res.error);
      return;
    }
    const merged = [...servers, ...res.servers];
    setServers(merged);
    saveMcpConfig(merged);
    setJsonDraft("");
    setFormOpen(false);
    setMode("manual");
  };

  const exportJson = async () => {
    const body = toMcpJson(servers);
    try {
      await navigator.clipboard.writeText(body);
    } catch {
      const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "mcp-servers.json";
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const headerText = () => (draft.headers ? JSON.stringify(draft.headers, null, 0) : "");
  const setHeaderText = (raw: string) => {
    try {
      const parsed = raw.trim() ? JSON.parse(raw) : undefined;
      if (parsed === undefined || (typeof parsed === "object" && parsed !== null)) {
        setDraft((d) => ({ ...d, headers: parsed }));
      }
    } catch {
      /* invalid JSON — keep last-valid */
    }
  };

  const enabled = servers.filter((s) => s.enabled).length;
  const inputCls =
    "w-full h-9 px-3 rounded-lg text-[12px] font-mono outline-none dark:bg-black/40 light:bg-white/60 dark:text-[#e5e5e5] light:text-[#262626] dark:border dark:border-white/10 light:border light:border-black/10 placeholder:dark:text-[#505050] placeholder:light:text-[#aaaaaa] focus:dark:border-[#ffb400]/[0.5] focus:light:border-[#d49600]/[0.5]";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div className="absolute inset-0 backdrop-blur-[6px] dark:bg-black/60 light:bg-black/30" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="MCP servers"
            className={cn(
              paper,
              "relative flex max-h-[70vh] w-[70vw] max-w-[960px] flex-col overflow-hidden rounded-2xl",
              "dark:shadow-[0_24px_80px_rgba(0,0,0,0.6)] light:shadow-[0_24px_80px_rgba(0,0,0,0.25)]",
            )}
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.985 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b px-5 dark:border-white/[0.07] light:border-black/[0.07]">
              <div className="flex items-center gap-2.5">
                <div className="flex size-7 items-center justify-center rounded-lg dark:bg-[#ffb400]/[0.12] light:bg-[#d49600]/[0.14]">
                  <PlugIcon className="size-3.5 dark:text-[#ffb400] light:text-[#d49600]" />
                </div>
                <div className="leading-tight">
                  <p className="text-[13px] font-medium dark:text-[#e5e5e5] light:text-[#262626]">MCP Servers</p>
                  <p className={cn(mono, "dark:text-[#6a6a6a] light:text-[#8a8a8a]")}>tool integrations</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex size-8 items-center justify-center rounded-lg transition-colors dark:text-[#737373] light:text-[#8a8a8a] hover:dark:bg-white/[0.06] hover:light:bg-black/[0.05] hover:dark:text-white hover:light:text-black"
                title="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {servers.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-[13px] dark:text-[#737373] light:text-[#808080]">No servers configured yet.</p>
                  <p className={cn(mono, "mt-1 dark:text-[#505050] light:text-[#a8a8a8]")}>
                    Add one to expose its tools to the model.
                  </p>
                </div>
              ) : (
                <div data-slot="mcp-server-panel" className="flex flex-col gap-1">
                  {servers.map((s) => (
                    <ServerRow
                      key={s.id}
                      server={s}
                      expanded={expandedId === s.id}
                      onExpand={(id) => setExpandedId((cur) => (cur === id ? undefined : id))}
                      onToggle={toggleServer}
                      onRemove={removeServer}
                    />
                  ))}
                </div>
              )}

              <AnimatePresence initial={false}>
                {formOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 rounded-xl border p-4 dark:border-white/[0.08] light:border-black/[0.08] dark:bg-white/[0.03] light:bg-black/[0.02]">
                      {MCP_PRESETS.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={cn(mono, "uppercase dark:text-[#6a6a6a] light:text-[#909090]")}>quick add</span>
                          {MCP_PRESETS.map((p) => (
                            <button
                              key={p.name}
                              type="button"
                              onClick={() => addPreset(p)}
                              disabled={servers.some((s) => s.name === p.server.name)}
                              className={cn(
                                "h-6 rounded-md border px-2.5 text-[10px] font-mono uppercase tracking-tight transition-colors",
                                servers.some((s) => s.name === p.server.name)
                                  ? "cursor-not-allowed dark:border-white/5 light:border-black/5 dark:text-[#505050] light:text-[#b8b8b8]"
                                  : "dark:border-white/10 light:border-black/10 dark:text-[#a3a3a3] light:text-[#525252] hover:dark:border-[#ffb400]/[0.4] hover:light:border-[#d49600]/[0.4] hover:dark:text-white hover:light:text-black",
                              )}
                            >
                              {p.name}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="mt-3 flex w-fit gap-1 rounded-lg border p-1 dark:border-white/[0.06] light:border-black/[0.06] dark:bg-black/30 light:bg-white/40">
                        {(["manual", "json"] as const).map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => {
                              setMode(val);
                              setJsonError(null);
                            }}
                            className={cn(
                              "h-7 rounded-md px-3 text-[10px] font-mono uppercase tracking-tight transition-colors",
                              mode === val
                                ? "bg-[#ffb400] light:bg-[#d49600] text-black light:text-white"
                                : "dark:text-[#808080] light:text-[#808080] hover:dark:text-white hover:light:text-black",
                            )}
                          >
                            {val === "json" ? "import json" : val}
                          </button>
                        ))}
                      </div>

                      {mode === "json" ? (
                        <div className="mt-2">
                          <textarea
                            value={jsonDraft}
                            onChange={(e) => {
                              setJsonDraft(e.target.value);
                              setJsonError(null);
                            }}
                            rows={6}
                            placeholder={'{"mcpServers": [{"name": "server", "type": "http", "url": "https://..."}]}'}
                            className={cn(inputCls, "h-auto resize-none py-2 text-[11px] leading-relaxed")}
                          />
                          {jsonError && (
                            <p className="mt-1.5 text-[10px] font-mono dark:text-red-400 light:text-red-500">{jsonError}</p>
                          )}
                          <div className="mt-2 flex justify-end">
                            <button
                              onClick={importJson}
                              disabled={!jsonDraft.trim()}
                              className={cn(
                                "h-8 rounded-lg px-4 text-[11px] font-mono uppercase tracking-tight transition-colors",
                                jsonDraft.trim()
                                  ? "bg-[#ffb400] light:bg-[#d49600] text-black light:text-white hover:brightness-110"
                                  : "cursor-not-allowed dark:bg-white/[0.04] light:bg-black/[0.04] dark:text-[#505050] light:text-[#b0b0b0]",
                              )}
                            >
                              Import
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <input
                            value={draft.name}
                            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                            placeholder="server name"
                            className={cn(inputCls, "mt-2")}
                          />
                          <div className="mt-2 flex w-fit gap-1 rounded-lg border p-1 dark:border-white/[0.06] light:border-black/[0.06] dark:bg-black/30 light:bg-white/40">
                            {(["http", "stdio"] as McpTransport[]).map((val) => (
                              <button
                                key={val}
                                type="button"
                                onClick={() => setType(val)}
                                className={cn(
                                  "h-7 rounded-md px-3 text-[10px] font-mono uppercase tracking-tight transition-colors",
                                  draft.type === val
                                    ? "bg-[#ffb400] light:bg-[#d49600] text-black light:text-white"
                                    : "dark:text-[#808080] light:text-[#808080] hover:dark:text-white hover:light:text-black",
                                )}
                              >
                                {val}
                              </button>
                            ))}
                          </div>
                          {draft.type === "http" ? (
                            <input
                              value={draft.url}
                              onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
                              placeholder="https://host.example/mcp"
                              className={cn(inputCls, "mt-2")}
                            />
                          ) : (
                            <input
                              value={draft.command}
                              onChange={(e) => setDraft((d) => ({ ...d, command: e.target.value }))}
                              placeholder="npx -y @modelcontextprotocol/server-filesystem ./"
                              className={cn(inputCls, "mt-2")}
                            />
                          )}
                          {draft.type === "http" && (
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={() => setShowHeaders((s) => !s)}
                                className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-tight transition-colors dark:text-[#606060] light:text-[#8a8a8a] hover:dark:text-white hover:light:text-black"
                              >
                                {showHeaders ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                                headers
                              </button>
                              {showHeaders && (
                                <textarea
                                  value={headerText()}
                                  onChange={(e) => setHeaderText(e.target.value)}
                                  rows={2}
                                  placeholder={'{"authorization": "Bearer …"}'}
                                  className={cn(inputCls, "mt-2 h-auto resize-none py-2 text-[11px]")}
                                />
                              )}
                            </div>
                          )}
                          <div className="mt-3 flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setFormOpen(false);
                                resetDraft();
                              }}
                              className="h-8 rounded-lg px-3 text-[11px] font-mono uppercase tracking-tight transition-colors dark:text-[#8a8a8a] light:text-[#808080] hover:dark:text-white hover:light:text-black"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={addServer}
                              disabled={!canSave}
                              className={cn(
                                "h-8 rounded-lg px-4 text-[11px] font-mono uppercase tracking-tight transition-colors",
                                canSave
                                  ? "bg-[#ffb400] light:bg-[#d49600] text-black light:text-white hover:brightness-110"
                                  : "cursor-not-allowed dark:bg-white/[0.04] light:bg-black/[0.04] dark:text-[#505050] light:text-[#b0b0b0]",
                              )}
                            >
                              Add server
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex h-14 shrink-0 items-center justify-between border-t px-5 dark:border-white/[0.07] light:border-black/[0.07]">
              <div className="flex items-center gap-3">
                <p className={cn(mono, "dark:text-[#505050] light:text-[#a0a0a0]")}>
                  {enabled} of {servers.length} enabled
                </p>
                <button
                  onClick={exportJson}
                  className="text-[10px] font-mono uppercase tracking-tight transition-colors dark:text-[#606060] light:text-[#8a8a8a] hover:dark:text-[#ffb400] hover:light:text-[#d49600]"
                >
                  export json
                </button>
              </div>
              <button
                onClick={() => setFormOpen((o) => !o)}
                className="flex h-8 items-center gap-1.5 rounded-lg border px-3.5 text-[11px] font-mono uppercase tracking-tight transition-colors dark:border-white/10 light:border-black/10 dark:bg-white/[0.06] light:bg-black/[0.05] dark:text-[#e5e5e5] light:text-[#262626] hover:dark:border-[#ffb400]/[0.4] hover:light:border-[#d49600]/[0.4]"
              >
                <PlusIcon className="size-3.5" />
                {formOpen ? "close form" : "add server"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
