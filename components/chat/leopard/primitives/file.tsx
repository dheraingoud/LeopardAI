"use client";

import { memo } from "react";
import {
  FileIcon,
  FileTextIcon,
  ImageIcon,
  MusicIcon,
  VideoIcon,
  BracesIcon,
  DownloadIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Presentational file attachment card: icon by mime, name, size (when
// derivable), download link. Props-based port of the upstream file part.
function getMimeIcon(mimeType: string) {
  const t = mimeType.toLowerCase();
  if (t.startsWith("image/")) return ImageIcon;
  if (t === "application/json") return BracesIcon;
  if (t === "application/pdf" || t.startsWith("text/")) return FileTextIcon;
  if (t.startsWith("audio/")) return MusicIcon;
  if (t.startsWith("video/")) return VideoIcon;
  return FileIcon;
}

function dataKind(data: string): "data-uri" | "url" | "base64" {
  if (/^data:/i.test(data)) return "data-uri";
  if (/^https?:\/\//i.test(data)) return "url";
  return "base64";
}

function base64Size(b64: string): number {
  const body = b64.slice(b64.indexOf(",") + 1);
  const padding = (body.match(/=/g) || []).length;
  return Math.floor((body.length * 3) / 4) - padding;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const FileCard = memo(function FileCard({
  filename,
  data,
  mimeType,
  className,
}: {
  filename?: string;
  data: string;
  mimeType: string;
  className?: string;
}) {
  const kind = dataKind(data);
  const href = kind === "base64" ? `data:${mimeType};base64,${data}` : data;
  const showSize = kind !== "url";
  const Icon = getMimeIcon(mimeType);

  return (
    <div
      data-slot="file-root"
      className={cn(
        "inline-flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors dark:border-white/[0.08] light:border-black/[0.08] hover:dark:bg-white/[0.04] hover:light:bg-black/[0.035]",
        className,
      )}
    >
      <span className="shrink-0 dark:text-[#a3a3a3] light:text-[#525252]">
        <Icon className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="min-w-0 truncate font-medium">{filename || "Unnamed file"}</span>
        {showSize && (
          <span className="text-xs dark:text-[#737373] light:text-[#8a8a8a]">
            {formatSize(base64Size(data))}
          </span>
        )}
      </div>
      <a
        data-slot="file-download"
        href={href}
        download={filename || "download"}
        {...(kind === "url" && { target: "_blank", rel: "noopener noreferrer" })}
        aria-label="Download file"
        className="shrink-0 rounded-md p-1 dark:text-[#a3a3a3] light:text-[#525252] hover:dark:bg-white/[0.06] hover:light:bg-black/[0.05] hover:dark:text-white hover:light:text-black"
      >
        <DownloadIcon className="size-4" />
      </a>
    </div>
  );
});
