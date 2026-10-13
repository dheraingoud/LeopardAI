"use client";

import { useState, type ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { field, mono, paper } from "./surfaces";

const RELATIVE = /^(?:[/?#]|\.{1,2}\/)/;
const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function safeHref(url: string | undefined): string | undefined {
  if (typeof url !== "string") return undefined;
  const trimmed = url.trim();
  if (trimmed === "") return undefined;
  try {
    const parsed = new URL(trimmed);
    return ALLOWED_PROTOCOLS.has(parsed.protocol) ? trimmed : undefined;
  } catch {
    return RELATIVE.test(trimmed) ? trimmed : undefined;
  }
}

function hostOf(url: string | undefined): string | undefined {
  const href = safeHref(url);
  if (!href) return undefined;
  try {
    return new URL(href).hostname.replace(/^www\./, "") || undefined;
  } catch {
    return undefined;
  }
}

export function LinkPreview({
  href,
  title,
  description,
  image,
  imageAlt,
  siteName,
  favicon,
  layout = "card",
  className,
  ...props
}: Omit<ComponentProps<"article">, "children" | "title"> & {
  href: string;
  title?: string;
  description?: string;
  image?: string;
  imageAlt?: string;
  siteName?: string;
  favicon?: string;
  layout?: "card" | "compact";
}) {
  const [failedImage, setFailedImage] = useState<string | undefined>();
  const [failedFavicon, setFailedFavicon] = useState<string | undefined>();
  const safeUrl = safeHref(href);
  const host = hostOf(href);
  const site = siteName ?? host;
  const label = title || host || safeUrl || "Untitled link";
  const hasImage = image !== undefined && image !== "" && failedImage !== image;
  const hasFavicon = favicon !== undefined && favicon !== "" && failedFavicon !== favicon;

  return (
    <article
      data-slot="link-preview"
      data-layout={layout}
      className={cn(
        paper,
        "relative flex w-full max-w-sm overflow-hidden rounded-2xl outline-none transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] focus-within:ring-1 focus-within:ring-[#ffb400]/40 hover:-translate-y-px motion-reduce:transition-none",
        layout === "card" ? "flex-col" : "items-stretch",
        className,
      )}
      {...props}
    >
      {hasImage ? (
        <div
          data-slot="link-preview-image"
          className={cn(
            field,
            "relative shrink-0 overflow-hidden",
            layout === "card" ? "aspect-video w-full" : "size-16",
          )}
        >
          <img
            src={image}
            alt={imageAlt ?? ""}
            className="size-full object-cover"
            onError={() => setFailedImage(image)}
          />
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <div className="flex min-w-0 items-center gap-1.5">
          {hasFavicon ? (
            <img
              src={favicon}
              alt=""
              className="size-4 shrink-0 rounded-sm object-cover"
              onError={() => setFailedFavicon(favicon)}
            />
          ) : (
            <span
              aria-hidden
              className={cn(
                field,
                "flex size-4 shrink-0 items-center justify-center rounded-sm text-[9px] font-medium dark:text-[#737373] light:text-[#8a8a8a]",
              )}
            >
              {site?.charAt(0).toUpperCase() ?? "?"}
            </span>
          )}
          {site ? (
            <span className={cn(mono, "truncate dark:text-[#737373] light:text-[#8a8a8a]")}>
              {site}
            </span>
          ) : null}
        </div>
        {safeUrl ? (
          <a
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13.5px] font-medium leading-5 line-clamp-2 dark:text-[#e5e5e5] light:text-[#262626] after:absolute after:inset-0 after:z-10"
          >
            {label}
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : (
          <span className="text-[13.5px] font-medium leading-5 line-clamp-2 dark:text-[#e5e5e5] light:text-[#262626]">
            {label}
          </span>
        )}
        {description ? (
          <span className="text-xs leading-relaxed line-clamp-2 dark:text-[#737373] light:text-[#8a8a8a]">
            {description}
          </span>
        ) : null}
      </div>
    </article>
  );
}
