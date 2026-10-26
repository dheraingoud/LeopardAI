"use client";

import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MapPinIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { field, mono, paper } from "./surfaces";
import { Diagram } from "./diagram";

// NOTE: leopard's generative-ui is a styled GenerativeUILibrary descriptor from
// @/leopard-ui/generative-ui, which Leopard does not depend on. This is a
// self-contained local shape with the same contract (a map of widget name →
// { description, render }) so the coverage can merge into widget-renderer later.
// Diagram degrades to Leopard's Diagram chrome + code block (no beautiful-mermaid);
// Map degrades to a styled pin list (no leaflet).

export interface GenerativeUIEntry {
  description?: string;
  render: (props: Record<string, unknown> & { children?: ReactNode }) => ReactNode;
}

export type GenerativeUILibrary = Record<string, GenerativeUIEntry>;

export interface GeoMapPlace {
  id: string;
  label: string;
  lat: number;
  lng: number;
  description?: string;
}

const pinsOf = (places: unknown): GeoMapPlace[] =>
  (Array.isArray(places) ? places : []).flatMap((place: unknown, index) => {
    if (place === null || typeof place !== "object") return [];
    const { label, lat, lng, detail } = place as Record<string, unknown>;
    return typeof label === "string" &&
      typeof lat === "number" &&
      typeof lng === "number"
      ? [
          {
            id: String(index),
            label,
            lat,
            lng,
            description: typeof detail === "string" ? detail : undefined,
          },
        ]
      : [];
  });

/** Degraded map: pin list only, no interactive leaflet tiles. */
function MapFallback({ places }: { places: readonly GeoMapPlace[] }) {
  return (
    <div
      data-leopard="map"
      className={cn(paper, "flex w-full max-w-sm flex-col gap-1 rounded-2xl p-3")}
    >
      {places.map((place) => (
        <div key={place.id} className="flex items-start gap-2.5 px-1 py-1.5">
          <MapPinIcon className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="text-foreground/90 block text-[13.5px] leading-5 break-words">
              {place.label}
            </span>
            {place.description ? (
              <span className="text-muted-foreground block text-xs leading-4 break-words">
                {place.description}
              </span>
            ) : null}
          </span>
          <span
            className={cn(mono, "text-muted-foreground shrink-0 pt-0.5 tabular-nums")}
          >
            {place.lat.toFixed(4)}, {place.lng.toFixed(4)}
          </span>
        </div>
      ))}
    </div>
  );
}

export const styledGenerativeUILibrary: GenerativeUILibrary = {
  Markdown: {
    description: "A markdown string, rendered with GitHub-flavored markdown.",
    render: ({ value, children }) => (
      <div data-leopard="markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {typeof value === "string" ? value : ""}
        </ReactMarkdown>
        {children}
      </div>
    ),
  },
  Diagram: {
    description: "A mermaid diagram, rendered as an SVG.",
    render: ({ code, title }) => (
      <figure data-leopard="diagram">
        <Diagram
          title={typeof title === "string" ? title : "Diagram"}
          zoom={1}
        >
          <pre className="overflow-x-auto p-2 text-left text-[12px] leading-relaxed font-mono text-foreground/80">
            <code>{typeof code === "string" ? code : ""}</code>
          </pre>
        </Diagram>
        {typeof title === "string" || typeof title === "number" ? (
          <figcaption data-leopard="diagram-title" className={cn(mono, "text-muted-foreground mt-1")}>
            {title}
          </figcaption>
        ) : null}
      </figure>
    ),
  },
  Map: {
    description: "An interactive map with pins for places.",
    render: ({ places }) => <MapFallback places={pinsOf(places)} />,
  },
};
