"use client";

import type { ComponentProps } from "react";
import { ShieldAlertIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { field, inkButton, mono, paper } from "./surfaces";

// Composer-zone approval card: tool name + input preview + Allow (amber) /
// Deny (red). Leopard's approval path is binary (addToolApprovalResponse
// takes {id, approved}), so no "always allow" tier.
export function ApprovalCard({
  toolName,
  preview,
  onAllow,
  onDeny,
  className,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  toolName: string;
  preview?: string;
  onAllow?: () => void;
  onDeny?: () => void;
}) {
  return (
    <div
      data-slot="approval-card"
      className={cn(paper, "flex w-full flex-col gap-3.5 rounded-2xl p-4", className)}
      {...props}
    >
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#ffb400]/10 light:bg-[#d49600]/10">
          <ShieldAlertIcon className="size-4 dark:text-[#ffb400] light:text-[#d49600]" />
        </span>
        <div className="flex min-w-0 flex-col">
          <p className="text-[13.5px] font-medium">
            {toolName === "webSearch" ? "Search access" : "Web access request"}
          </p>
          <p className="text-foreground/45 text-xs">
            Leopard wants to run <span className={cn(mono, "dark:text-[#ffb400] light:text-[#b67f00]")}>{toolName}</span> — the response pauses until you decide.
          </p>
        </div>
      </div>

      {preview ? (
        <div className={cn(field, "text-foreground/70 rounded-xl px-3.5 py-2.5 font-mono text-xs break-all")}>
          {preview}
        </div>
      ) : null}

      <div className="flex h-8 items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDeny}
          className="h-8 rounded-full px-3.5 text-xs font-medium text-red-400 transition-[background-color,scale] duration-150 hover:bg-red-500/10 active:scale-[0.96] light:text-red-600"
        >
          Deny
        </button>
        <button
          type="button"
          onClick={onAllow}
          className={cn(inkButton, "flex h-8 items-center rounded-full px-3.5 text-xs font-semibold")}
        >
          Allow
        </button>
      </div>
    </div>
  );
}
