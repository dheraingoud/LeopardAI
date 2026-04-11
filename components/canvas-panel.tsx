"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Maximize2,
  Minimize2,
  RefreshCw,
  Copy,
  Check,
  Code,
  Eye,
  Download,
  Smartphone,
  Monitor,
  Tablet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Artifact } from "@/types";
import { toast } from "sonner";

interface CanvasPanelProps {
  artifact: Artifact | null;
  onClose: () => void;
}

type ViewMode = "preview" | "code";
type DeviceSize = "mobile" | "tablet" | "desktop";

const DEVICE_SIZES: Record<DeviceSize, { width: number; icon: typeof Monitor; label: string }> = {
  mobile: { width: 375, icon: Smartphone, label: "Mobile" },
  tablet: { width: 768, icon: Tablet, label: "Tablet" },
  desktop: { width: 1024, icon: Monitor, label: "Desktop" },
};

/* ────────────────────────────────────────────────
 * Sandbox builders — one per artifact type
 * ──────────────────────────────────────────────── */

function buildReactSandbox(code: string): string {
  const cleaned = code
    .replace(/^import\s+.*?['"];?\s*$/gm, "")
    .replace(/^export\s+default\s+function\s+(\w+)/gm, "function $1")
    .replace(/^export\s+default\s+class\s+(\w+)/gm, "class $1")
    .replace(/^export\s+default\s+/gm, "const __DefaultExport = ")
    .replace(/^export\s+(?:const|let|var|function|class)\s+/gm, "");

  // Detect component name — function or class
  const funcMatch = cleaned.match(/^function\s+([A-Z]\w+)/m);
  const classMatch = cleaned.match(/^class\s+([A-Z]\w+)/m);
  const constMatch = cleaned.match(/^const\s+([A-Z]\w+)\s*=/m);
  const compName = funcMatch?.[1] || classMatch?.[1] || constMatch?.[1] || "__DefaultExport";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#fff;color:#111;min-height:100vh;padding:16px}
    #root{width:100%}
    #error{color:#e74c3c;padding:24px;font-family:monospace;white-space:pre-wrap;background:#fff0f0;border:1px solid #fcc;border-radius:8px;margin:16px}
  </style>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone@7/babel.min.js"></script>
</head>
<body>
  <div id="root"></div>
  <div id="error"></div>
  <script type="text/babel" data-presets="react">
    // Hooks
    const {useState,useEffect,useRef,useCallback,useMemo,useReducer,useContext,createContext,Fragment}=React;
    // Class component support
    const {Component,PureComponent}=React;

    try{
      ${cleaned}
      const __C=typeof ${compName}!=="undefined"?${compName}:()=>React.createElement("p",null,"Component rendered successfully");
      ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(__C));
    }catch(err){
      document.getElementById("error").textContent="Error: "+err.message+"\\n\\n"+err.stack;
    }
  </script>
</body>
</html>`;
}

function buildHTMLSandbox(code: string): string {
  if (/<html|<body|<!DOCTYPE/i.test(code)) return code;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fff;color:#111;padding:24px;line-height:1.6}</style>
</head>
<body>${code}</body>
</html>`;
}

function buildSVGSandbox(code: string): string {
  return `<!DOCTYPE html>
<html><head><style>body{display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fff}</style></head>
<body>${code}</body></html>`;
}

function buildMarkdownSandbox(md: string): string {
  // Use marked CDN for markdown rendering
  const escaped = md.replace(/`/g, "\\`").replace(/<\/script>/g, "<\\/script>");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown-light.min.css"/>
  <style>body{padding:24px;background:#fff;max-width:860px;margin:0 auto}.markdown-body{font-size:15px}</style>
  <script src="https://cdn.jsdelivr.net/npm/marked@12/marked.min.js"></script>
</head>
<body>
  <div id="md" class="markdown-body"></div>
  <script>
    document.getElementById("md").innerHTML = marked.parse(\`${escaped}\`);
  </script>
</body>
</html>`;
}

function buildMermaidSandbox(code: string): string {
  const escaped = code.replace(/`/g, "\\`").replace(/<\/script>/g, "<\\/script>");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <style>body{display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fff;padding:24px}#diagram{width:100%}</style>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({startOnLoad:false,theme:'default'});
    const {svg}=await mermaid.render('graph',\`${escaped}\`);
    document.getElementById('diagram').innerHTML=svg;
  </script>
</head>
<body><div id="diagram"></div></body>
</html>`;
}

function buildCSVSandbox(csv: string): string {
  const escaped = csv.replace(/`/g, "\\`").replace(/<\/script>/g, "<\\/script>");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <style>
    body{font-family:-apple-system,sans-serif;padding:24px;background:#fff}
    table{border-collapse:collapse;width:100%;font-size:14px}
    th,td{border:1px solid #e0e0e0;padding:8px 12px;text-align:left}
    th{background:#f5f5f5;font-weight:600}
    tr:nth-child(even){background:#fafafa}
    tr:hover{background:#f0f7ff}
  </style>
</head>
<body>
  <div id="table"></div>
  <script>
    const csv=\`${escaped}\`;
    const rows=csv.trim().split('\\n').map(r=>r.split(',').map(c=>c.trim()));
    const [header,...data]=rows;
    let html='<table><thead><tr>'+header.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>';
    data.forEach(r=>{html+='<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>';});
    html+='</tbody></table>';
    document.getElementById('table').innerHTML=html;
  </script>
</body>
</html>`;
}

/* We can preview these types */
const PREVIEWABLE_TYPES = new Set(["react", "html", "svg", "markdown", "csv", "mermaid"]);

/* ────────────────────────────────────────────────
 * Canvas Panel
 * ──────────────────────────────────────────────── */

export default function CanvasPanel({ artifact, onClose }: CanvasPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("preview");
  const [device, setDevice] = useState<DeviceSize>("desktop");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const canPreview = artifact ? PREVIEWABLE_TYPES.has(artifact.type) : false;

  // Reset state when artifact changes
  useEffect(() => {
    if (artifact) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setViewMode(canPreview ? "preview" : "code");
      setIframeKey((k) => k + 1);
    }
  }, [artifact?.id, canPreview]);

  const getSandboxHTML = useCallback((): string => {
    if (!artifact) return "";
    switch (artifact.type) {
      case "react":    return buildReactSandbox(artifact.content);
      case "html":     return buildHTMLSandbox(artifact.content);
      case "svg":      return buildSVGSandbox(artifact.content);
      case "markdown": return buildMarkdownSandbox(artifact.content);
      case "mermaid":  return buildMermaidSandbox(artifact.content);
      case "csv":      return buildCSVSandbox(artifact.content);
      default:
        return buildHTMLSandbox(
          `<pre style="white-space:pre-wrap;font-family:'SF Mono',monospace;font-size:13px;line-height:1.6">${artifact.content.replace(/</g, "&lt;")}</pre>`
        );
    }
  }, [artifact]);

  const handleCopy = () => {
    if (!artifact) return;
    navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!artifact) return;
    const extMap: Record<string, string> = { react: "jsx", html: "html", svg: "svg", markdown: "md", csv: "csv", mermaid: "mmd" };
    const ext = extMap[artifact.type] || "txt";
    const blob = new Blob([artifact.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${artifact.title.replace(/\s+/g, "-").toLowerCase()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded");
  };

  return (
    <AnimatePresence>
      {artifact && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: isFullscreen ? "100%" : 540, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "flex flex-col border-l border-white/[0.06] bg-[#080808] overflow-hidden shrink-0",
            isFullscreen && "fixed inset-0 z-50"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 h-11 border-b border-white/[0.06] shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-5 w-5 rounded flex items-center justify-center bg-[#ffb40010]">
                {viewMode === "preview" ? (
                  <Eye className="h-3 w-3 text-[#ffb400]" />
                ) : (
                  <Code className="h-3 w-3 text-[#ffb400]" />
                )}
              </div>
              <span className="text-[12px] font-mono text-[#a3a3a3] truncate">
                {artifact.title}
              </span>
              <span className="text-[9px] font-mono px-1.5 py-[2px] rounded bg-white/[0.04] text-[#606060] border border-white/[0.04] uppercase tracking-wider">
                {artifact.type}
              </span>
            </div>
            <div className="flex items-center gap-px">
              {canPreview && (
                <button
                  onClick={() => setViewMode(viewMode === "preview" ? "code" : "preview")}
                  className="h-7 w-7 flex items-center justify-center rounded text-[#525252] hover:text-white hover:bg-white/5 transition-colors"
                  title={viewMode === "preview" ? "View code" : "View preview"}
                >
                  {viewMode === "preview" ? <Code className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              )}
              <button onClick={handleCopy} className="h-7 w-7 flex items-center justify-center rounded text-[#525252] hover:text-white hover:bg-white/5 transition-colors" title="Copy">
                {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <button onClick={handleDownload} className="h-7 w-7 flex items-center justify-center rounded text-[#525252] hover:text-white hover:bg-white/5 transition-colors" title="Download">
                <Download className="h-3.5 w-3.5" />
              </button>
              {canPreview && viewMode === "preview" && (
                <button onClick={() => setIframeKey((k) => k + 1)} className="h-7 w-7 flex items-center justify-center rounded text-[#525252] hover:text-white hover:bg-white/5 transition-colors" title="Refresh">
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              )}
              <button onClick={() => setIsFullscreen(!isFullscreen)} className="h-7 w-7 flex items-center justify-center rounded text-[#525252] hover:text-white hover:bg-white/5 transition-colors" title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
                {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
              <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded text-[#525252] hover:text-white hover:bg-white/5 transition-colors" title="Close">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Device toolbar (preview mode + visual types only) */}
          {viewMode === "preview" && canPreview && ["react", "html"].includes(artifact.type) && (
            <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/[0.04] shrink-0">
              {(Object.entries(DEVICE_SIZES) as [DeviceSize, typeof DEVICE_SIZES[DeviceSize]][]).map(
                ([key, val]) => {
                  const Icon = val.icon;
                  return (
                    <button
                      key={key}
                      onClick={() => setDevice(key)}
                      className={cn(
                        "h-6 px-2 flex items-center gap-1 rounded text-[10px] font-mono transition-colors",
                        device === key
                          ? "text-[#ffb400] bg-[#ffb40008] border border-[#ffb40015]"
                          : "text-[#525252] hover:text-white hover:bg-white/5"
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {val.label}
                    </button>
                  );
                }
              )}
            </div>
          )}

          {/* Content Area */}
          <div className="flex-1 overflow-hidden">
            {viewMode === "preview" && canPreview ? (
              <div className="w-full h-full flex items-start justify-center bg-[#111] p-4 overflow-auto">
                <div
                  className="bg-white rounded-lg shadow-2xl overflow-hidden transition-all duration-300"
                  style={{
                    width: artifact.type === "react" || artifact.type === "html"
                      ? (device === "desktop" ? "100%" : DEVICE_SIZES[device].width)
                      : "100%",
                    maxWidth: "100%",
                    height: "100%",
                    minHeight: 400,
                  }}
                >
                  <iframe
                    key={iframeKey}
                    ref={iframeRef}
                    srcDoc={getSandboxHTML()}
                    sandbox="allow-scripts allow-modals allow-popups allow-forms"
                    className="w-full h-full border-0"
                    title="Preview"
                  />
                </div>
              </div>
            ) : (
              /* Code view — syntax highlighted */
              <div className="h-full overflow-auto p-4 bg-[#0a0a0a]">
                <pre className="text-[13px] font-mono text-[#d4d4d4] whitespace-pre-wrap leading-[1.65] selection:bg-[#ffb40030]">
                  <code>{artifact.content}</code>
                </pre>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
