"use client";

import { useEffect, useState } from "react";
import { X, Plus, Trash2, Server, Cable, EyeOff, Eye } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
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

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * McpConfigModal — the "+ → mcp servers" overlay. A centered liquid-glass
 * card covering the upper screen at 70% width: lists configured servers, lets
 * you add a stdio/http server and toggle it. Wired to localStorage now;
 * transport handshake arrives with the SDK integration. Esc / backdrop / X
 * close; Escape is captured at the document level so it wins over the menu's
 * own popover closing first (the menu already unmounted itself on open).
 */
export function McpConfigModal({ open, onClose }: Props) {
  const [servers, setServers] = useState<McpServerConfig[]>([]);
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

  // Reset the draft when the transport flips so the right endpoint field shows.
  const setType = (t: McpTransport) => setDraft((d) => ({ ...d, type: t }));

  const canSave =
    draft.name.trim().length > 0 &&
    (draft.type === "http"
      ? draftUrl.trim().length > 0
      : draftCommand.trim().length > 0);

  const addServer = () => {
    if (!canSave) return;
    if (draft.type === "http" && !/^https?:\/\//i.test(draftUrl.trim())) return;
    const next: McpServerConfig = {
      ...draft,
      id: nextMcpId(),
      name: draft.name.trim(),
      command: draft.type === "stdio" ? draftCommand.trim() : undefined,
      url: draft.type === "http" ? draftUrl.trim() : undefined,
      headers:
        draft.headers && Object.keys(draft.headers).length > 0
          ? draft.headers
          : undefined,
    };
    const updated = [...servers, next];
    setServers(updated);
    saveMcpConfig(updated);
    setFormOpen(false);
    setDraft({
      id: "",
      name: "",
      type: "http",
      url: "",
      command: "",
      headers: undefined,
      enabled: true,
    });
  };

  const toggleServer = (id: string) => {
    const updated = servers.map((s) =>
      s.id === id ? { ...s, enabled: !s.enabled } : s,
    );
    setServers(updated);
    saveMcpConfig(updated);
  };

  const removeServer = (id: string) => {
    const updated = servers.filter((s) => s.id !== id);
    setServers(updated);
    saveMcpConfig(updated);
  };

  const addPreset = (preset: (typeof MCP_PRESETS)[number]) => {
    // De-dupe by name — adding the same preset twice is a no-op.
    if (servers.some((s) => s.name === preset.server.name)) return;
    const row: McpServerConfig = { ...preset.server, id: nextMcpId(), enabled: true };
    const updated = [...servers, row];
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
      /* clipboard may be denied — fall back to a blob download */
      const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "mcp-servers.json";
      a.click();
      URL.revokeObjectURL(url);
    }
  };

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
          <div
            className="absolute inset-0 dark:bg-black/60 light:bg-black/30 backdrop-blur-[6px]"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="MCP servers"
            className={cn(
              "relative w-[70vw] max-w-[960px] max-h-[70vh] flex flex-col overflow-hidden rounded-2xl",
              "border dark:border-white/10 light:border-black/10",
              "dark:bg-[linear-gradient(160deg,#151311_0%,#0c0a08_100%)] light:bg-[linear-gradient(160deg,#ffffff_0%,#f6f3eb_100%)]",
              "dark:shadow-[0_24px_80px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] light:shadow-[0_24px_80px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.8)]",
            )}
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.985 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 h-14 border-b dark:border-white/[0.07] light:border-black/[0.07] shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg flex items-center justify-center dark:bg-[#ffb400]/[0.12] light:bg-[#ffb400]/[0.14]">
                  <Server className="h-3.5 w-3.5 dark:text-[#ffb400] light:text-[#b8860b]" />
                </div>
                <div className="leading-tight">
                  <p className="text-[13px] font-medium dark:text-[#e5e5e5] light:text-[#262626]">
                    MCP Servers
                  </p>
                  <p className="text-[10px] font-mono dark:text-[#6a6a6a] light:text-[#8a8a8a]">
                    tool integrations
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="h-8 w-8 flex items-center justify-center rounded-lg dark:text-[#737373] light:text-[#8a8a8a] hover:dark:text-white hover:light:text-black hover:dark:bg-white/[0.06] hover:light:bg-black/[0.05] transition-colors"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
              {servers.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-[13px] dark:text-[#737373] light:text-[#808080]">
                    No servers configured yet.
                  </p>
                  <p className="mt-1 text-[11px] font-mono dark:text-[#505050] light:text-[#a8a8a8]">
                    Add one to expose its tools to the model.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {servers.map((s) => (
                    <McpRow
                      key={s.id}
                      server={s}
                      onToggle={toggleServer}
                      onRemove={removeServer}
                    />
                  ))}
                </ul>
              )}

              <AnimatePresence initial={false}>
                {formOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 p-4 rounded-xl border dark:border-white/[0.08] light:border-black/[0.08] dark:bg-white/[0.03] light:bg-black/[0.02]">
                      {/* presets — one-click add */}
                      {MCP_PRESETS.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-mono uppercase tracking-tight dark:text-[#6a6a6a] light:text-[#909090]">
                            quick add
                          </span>
                          {MCP_PRESETS.map((p) => (
                            <button
                              key={p.name}
                              type="button"
                              onClick={() => addPreset(p)}
                              disabled={servers.some((s) => s.name === p.server.name)}
                              className={cn(
                                "px-2.5 h-6 rounded-md text-[10px] font-mono uppercase tracking-tight border transition-colors",
                                servers.some((s) => s.name === p.server.name)
                                  ? "dark:text-[#505050] light:text-[#b8b8b8] dark:border-white/5 light:border-black/5 cursor-not-allowed"
                                  : "dark:text-[#a3a3a3] light:text-[#525252] dark:border-white/10 light:border-black/10 hover:dark:border-[#ffb400]/[0.4] hover:light:border-[#b8860b]/[0.4] hover:dark:text-white hover:light:text-black",
                              )}
                            >
                              {p.name}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-3">
                        <div className="flex gap-1 p-1 rounded-lg w-fit dark:bg-black/30 light:bg-white/40 border dark:border-white/[0.06] light:border-black/[0.06]">
                          {(
                            [
                              ["manual", "manual"],
                              ["json", "import json"],
                            ] as const
                          ).map(([val, label]) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => {
                                setMode(val);
                                setJsonError(null);
                              }}
                              className={cn(
                                "px-3 h-7 rounded-md text-[10px] font-mono uppercase tracking-tight transition-colors",
                                mode === val
                                  ? "dark:bg-[#ffb400] light:bg-[#ffb400] dark:text-black light:text-black"
                                  : "dark:text-[#808080] light:text-[#808080] hover:dark:text-white hover:light:text-black",
                              )}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
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
                            className="w-full px-3 py-2 rounded-lg text-[11px] font-mono leading-relaxed outline-none dark:bg-black/40 light:bg-white/60 dark:text-[#e5e5e5] light:text-[#262626] dark:border dark:border-white/10 light:border light:border-black/10 placeholder:dark:text-[#505050] placeholder:light:text-[#aaaaaa] focus:dark:border-[#ffb400]/[0.5] focus:light:border-[#b8860b]/[0.5] resize-none"
                          />
                          {jsonError && (
                            <p className="mt-1.5 text-[10px] font-mono dark:text-red-400 light:text-red-500">
                              {jsonError}
                            </p>
                          )}
                          <div className="mt-2 flex justify-end">
                            <button
                              onClick={importJson}
                              disabled={!jsonDraft.trim()}
                              className={cn(
                                "px-4 h-8 rounded-lg text-[11px] font-mono uppercase tracking-tight transition-colors",
                                jsonDraft.trim()
                                  ? "dark:bg-[#ffb400] light:bg-[#ffb400] dark:text-black light:text-black hover:brightness-110"
                                  : "dark:bg-white/[0.04] light:bg-black/[0.04] dark:text-[#505050] light:text-[#b0b0b0] cursor-not-allowed",
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
                        className="w-full h-9 px-3 rounded-lg text-[12px] font-mono outline-none dark:bg-black/40 light:bg-white/60 dark:text-[#e5e5e5] light:text-[#262626] dark:border dark:border-white/10 light:border light:border-black/10 placeholder:dark:text-[#505050] placeholder:light:text-[#aaaaaa] focus:dark:border-[#ffb400]/[0.5] focus:light:border-[#b8860b]/[0.5]"
                      />

                      <div className="flex gap-1 mt-2 p-1 rounded-lg w-fit dark:bg-black/30 light:bg-white/40 border dark:border-white/[0.06] light:border-black/[0.06]">
                        {(
                          [
                            ["http", "http"],
                            ["stdio", "stdio"],
                          ] as [McpTransport, string][]
                        ).map(([val, label]) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setType(val)}
                            className={cn(
                              "px-3 h-7 rounded-md text-[10px] font-mono uppercase tracking-tight transition-colors",
                              draft.type === val
                                ? "dark:bg-[#ffb400] light:bg-[#ffb400] dark:text-black light:text-black"
                                : "dark:text-[#808080] light:text-[#808080] hover:dark:text-white hover:light:text-black",
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      {draft.type === "http" ? (
                        <input
                          value={draft.url}
                          onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
                          placeholder="https://host.example/mcp"
                          className="mt-2 w-full h-9 px-3 rounded-lg text-[12px] font-mono outline-none dark:bg-black/40 light:bg-white/60 dark:text-[#e5e5e5] light:text-[#262626] dark:border dark:border-white/10 light:border light:border-black/10 placeholder:dark:text-[#505050] placeholder:light:text-[#aaaaaa] focus:dark:border-[#ffb400]/[0.5] focus:light:border-[#b8860b]/[0.5]"
                        />
                      ) : (
                        <input
                          value={draft.command}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, command: e.target.value }))
                          }
                          placeholder="npx -y @modelcontextprotocol/server-filesystem ./"
                          className="mt-2 w-full h-9 px-3 rounded-lg text-[12px] font-mono outline-none dark:bg-black/40 light:bg-white/60 dark:text-[#e5e5e5] light:text-[#262626] dark:border dark:border-white/10 light:border light:border-black/10 placeholder:dark:text-[#505050] placeholder:light:text-[#aaaaaa] focus:dark:border-[#ffb400]/[0.5] focus:light:border-[#b8860b]/[0.5]"
                        />
                      )}

                      {/* Optional headers for http */}
                      {draft.type === "http" && (
                        <div className="mt-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setShowHeaders((s) => !s)}
                              className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-tight dark:text-[#606060] light:text-[#8a8a8a] hover:dark:text-white hover:light:text-black transition-colors"
                            >
                              {showHeaders ? (
                                <EyeOff className="h-3 w-3" />
                              ) : (
                                <Eye className="h-3 w-3" />
                              )}
                              headers
                            </button>
                          </div>
                          {showHeaders && (
                            <div className="mt-2 flex flex-col gap-1.5">
                              <textarea
                                value={headerText()}
                                onChange={(e) => setHeaderText(e.target.value)}
                                rows={2}
                                placeholder={'{"authorization": "Bearer …"}'}
                                className="w-full px-3 py-2 rounded-lg text-[11px] font-mono outline-none dark:bg-black/40 light:bg-white/60 dark:text-[#e5e5e5] light:text-[#262626] dark:border dark:border-white/10 light:border light:border-black/10 placeholder:dark:text-[#505050] placeholder:light:text-[#aaaaaa] focus:dark:border-[#ffb400]/[0.5] focus:light:border-[#b8860b]/[0.5] resize-none"
                              />
                            </div>
                          )}
                        </div>
                      )}

                      <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setFormOpen(false);
                            setDraft({
                              id: "",
                              name: "",
                              type: "http",
                              url: "",
                              command: "",
                              headers: undefined,
                              enabled: true,
                            });
                          }}
                          className="px-3 h-8 rounded-lg text-[11px] font-mono uppercase tracking-tight dark:text-[#8a8a8a] light:text-[#808080] hover:dark:text-white hover:light:text-black transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={addServer}
                          disabled={!canSave}
                          className={cn(
                            "px-4 h-8 rounded-lg text-[11px] font-mono uppercase tracking-tight transition-colors",
                            canSave
                              ? "dark:bg-[#ffb400] light:bg-[#ffb400] dark:text-black light:text-black hover:brightness-110"
                              : "dark:bg-white/[0.04] light:bg-black/[0.04] dark:text-[#505050] light:text-[#b0b0b0] cursor-not-allowed",
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

            {/* Footer */}
            <div className="flex items-center justify-between px-5 h-14 border-t dark:border-white/[0.07] light:border-black/[0.07] shrink-0">
              <div className="flex items-center gap-3">
                <p className="text-[10px] font-mono dark:text-[#505050] light:text-[#a0a0a0]">
                  {servers.filter((s) => s.enabled).length} enabled
                </p>
                <button
                  onClick={exportJson}
                  className="text-[10px] font-mono uppercase tracking-tight dark:text-[#606060] light:text-[#8a8a8a] hover:dark:text-[#ffb400] hover:light:text-[#b8860b] transition-colors"
                >
                  export json
                </button>
              </div>
              <button
                onClick={() => setFormOpen((o) => !o)}
                className="flex items-center gap-1.5 px-3.5 h-8 rounded-lg text-[11px] font-mono uppercase tracking-tight dark:bg-white/[0.06] light:bg-black/[0.05] dark:text-[#e5e5e5] light:text-[#262626] border dark:border-white/10 light:border-black/10 hover:dark:border-[#ffb400]/[0.4] hover:light:border-[#b8860b]/[0.4] transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                {formOpen ? "close form" : "add server"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  function headerText(): string {
    return draft.headers ? JSON.stringify(draft.headers, null, 0) : "";
  }
  function setHeaderText(raw: string): void {
    try {
      const parsed = raw.trim() ? JSON.parse(raw) : undefined;
      if (parsed === undefined || (typeof parsed === "object" && parsed !== null)) {
        setDraft((d) => ({ ...d, headers: parsed }));
      }
    } catch {
      /* invalid JSON — ignore, keep last-valid */
    }
  }
}

function McpRow({
  server,
  onToggle,
  onRemove,
}: {
  server: McpServerConfig;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const endpoint = server.type === "stdio" ? server.command : server.url;
  return (
    <li
      className={cn(
        "group flex items-center gap-3 px-3.5 py-3 rounded-xl border transition-colors",
        server.enabled
          ? "dark:border-white/[0.08] light:border-black/[0.08] dark:bg-white/[0.03] light:bg-black/[0.02]"
          : "dark:border-white/[0.04] light:border-black/[0.04] dark:bg-black/20 light:bg-black/[0.01]",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full shrink-0",
              server.enabled ? "dark:bg-[#ffb400] light:bg-[#b8860b]" : "dark:bg-[#404040] light:bg-[#c0c0c0]",
            )}
          />
          <p
            className={cn(
              "text-[12.5px] truncate",
              server.enabled
                ? "dark:text-[#e5e5e5] light:text-[#262626]"
                : "dark:text-[#666666] light:text-[#909090]",
            )}
          >
            {server.name}
          </p>
        </div>
        {endpoint && (
          <p className="mt-0.5 pl-3.5 text-[10.5px] font-mono truncate dark:text-[#5a5a5a] light:text-[#999999]">
            {server.type}:&nbsp;{endpoint}
          </p>
        )}
      </div>
      <span className="text-[9px] font-mono uppercase tracking-tight px-1.5 py-0.5 rounded dark:text-[#7a7a7a] light:text-[#a0a0a0]">
        {server.type === "http" ? (
          <Cable className="h-3 w-3" />
        ) : (
          server.type
        )}
      </span>
      <button
        onClick={() => onToggle(server.id)}
        title={server.enabled ? "Disable" : "Enable"}
        className={cn(
          "h-7 px-2.5 rounded-md text-[10px] font-mono uppercase tracking-tight transition-colors",
          server.enabled
            ? "dark:text-[#ffb400] light:text-[#b8860b] hover:dark:bg-[#ffb400]/[0.08] hover:light:bg-[#b8860b]/[0.08]"
            : "dark:text-[#666666] light:text-[#909090] hover:dark:text-white hover:light:text-black",
        )}
      >
        {server.enabled ? "on" : "off"}
      </button>
      <button
        onClick={() => onRemove(server.id)}
        title="Remove"
        className="h-7 w-7 flex items-center justify-center rounded-md dark:text-[#5a5a5a] light:text-[#a0a0a0] opacity-0 group-hover:opacity-100 transition-opacity hover:dark:text-red-400 hover:light:text-red-500 hover:dark:bg-red-500/10 hover:light:bg-red-500/10"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

