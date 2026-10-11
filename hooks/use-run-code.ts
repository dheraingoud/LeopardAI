"use client";

import { useCallback, useRef, useState } from "react";

// Run-code: evals a JS/TS code block in a sandboxed iframe (sandbox=
// "allow-scripts", opaque origin) and captures console.log/warn/error + the
// expression value via postMessage. The parent can't reach into the sandboxed
// window (cross-origin) — the srcdoc script runs the code and posts results
// back. Client-only; the sandbox has no network/DOM access to our origin.
export type RunCodeState = {
  running: boolean;
  lines: string[];
  error: string | null;
  durationMs: number | null;
};

const IDLE: RunCodeState = { running: false, lines: [], error: null, durationMs: null };

// The srcdoc script: capture console, run the snippet, post {lines, error,
// durationMs} back to the parent. `onerror` catches top-level throws.
const SANDBOX_HTML = (code: string) => `<!doctype html><html><body><script>
const lines = [];
const t0 = Date.now();
const push = (kind) => (...args) => lines.push(args.map((a) => {
  try { return typeof a === "object" ? JSON.stringify(a) : String(a); } catch { return String(a); }
}).join(" "));
console.log = push("log"); console.warn = push("warn"); console.error = push("error");
window.onerror = (msg) => { parent.postMessage({ type: "run-error", error: String(msg), lines, durationMs: Date.now() - t0 }, "*"); return true; };
try {
  const r = (function(){ "use strict";
${escapeForTemplate(code)}
  })();
  if (r !== undefined) lines.push("=> " + (typeof r === "object" ? (function(){ try { return JSON.stringify(r); } catch { return String(r); } })() : String(r)));
  parent.postMessage({ type: "run-done", lines, durationMs: Date.now() - t0 }, "*");
} catch (e) {
  parent.postMessage({ type: "run-error", error: (e && e.message) || String(e), lines, durationMs: Date.now() - t0 }, "*");
}
<\/script></body></html>`;

export function useRunCode() {
  const [state, setState] = useState<RunCodeState>(IDLE);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const listenerRef = useRef<((e: MessageEvent) => void) | null>(null);

  const run = useCallback((code: string) => {
    setState({ running: true, lines: [], error: null, durationMs: null });
    // Fresh frame per run — no leaked globals.
    frameRef.current?.remove();
    if (listenerRef.current) window.removeEventListener("message", listenerRef.current);
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts");
    frame.style.display = "none";
    frame.srcdoc = SANDBOX_HTML(stripTypes(code));
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; lines?: string[]; error?: string; durationMs?: number };
      if (d?.type === "run-done") {
        setState({ running: false, lines: d.lines ?? [], error: null, durationMs: d.durationMs ?? 0 });
        cleanup();
      } else if (d?.type === "run-error") {
        setState({ running: false, lines: d.lines ?? [], error: d.error ?? "error", durationMs: d.durationMs ?? 0 });
        cleanup();
      }
    };
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      listenerRef.current = null;
      frame.remove();
      frameRef.current = null;
    };
    window.addEventListener("message", onMessage);
    listenerRef.current = onMessage;
    document.body.appendChild(frame);
    frameRef.current = frame;
    // Safety: a snippet that never posts back (infinite loop) is capped at 5s.
    setTimeout(() => {
      setState((s) => {
        if (!s.running) return s;
        cleanup();
        return { running: false, lines: s.lines, error: "timed out (5s)", durationMs: 5000 };
      });
    }, 5000);
  }, []);

  const reset = useCallback(() => setState(IDLE), []);

  return { state, run, reset };
}

// Naive TS→JS: drop type/interface declarations + annotations so plain TS
// snippets run as JS. Fancier TS (generics, enums) won't — acceptable for
// snippet-level blocks.
function stripTypes(code: string): string {
  return code
    .replace(/^\s*(export\s+)?(interface|type)\s+[A-Za-z_$][\w$]*\s*\{[^}]*\}\s*;?\s*$/gm, "")
    .replace(/^\s*(export\s+)?type\s+[A-Za-z_$][\w$]*\s*=[^;]+;?\s*$/gm, "")
    .replace(/:\s*[A-Za-z_$][\w$<>\[\]|&, \t]*(?=[,)=;{])/g, "")
    .replace(/\b(as|satisfies)\s+[A-Za-z_$][\w$<>\[\]|&, ]*/g, "");
}

function escapeForTemplate(code: string): string {
  // Escape the snippet for the srcdoc template literal: backticks + ${ would
  // break the outer template; the script's own </script> would close the tag.
  return code
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${")
    .replace(/<\/script>/gi, "<\\/script>");
}
