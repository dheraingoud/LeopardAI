"use client";

import type { FC } from "react";

type IconComponent = FC<{ className?: string }>;

export type DirectiveTextSegment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "mention"; readonly type: string; readonly label: string; readonly id: string };

export type DirectiveTextFormatter = {
  parse(text: string): readonly DirectiveTextSegment[];
};

export type CreateDirectiveTextOptions = {
  iconMap?: Record<string, IconComponent>;
  fallbackIcon?: IconComponent;
};

export function createDirectiveText(
  formatter: DirectiveTextFormatter,
  options?: CreateDirectiveTextOptions,
): FC<{ text: string }> {
  const iconMap = options?.iconMap;
  const fallbackIcon = options?.fallbackIcon;

  const Component: FC<{ text: string }> = ({ text }) => {
    const segments = formatter.parse(text);

    if (segments.length === 1 && segments[0]!.kind === "text") {
      return <>{text}</>;
    }

    return (
      <>
        {segments.map((seg, i) => {
          if (seg.kind === "text") {
            return (
              <span key={i} className="whitespace-pre-wrap">
                {seg.text}
              </span>
            );
          }

          const Icon = iconMap?.[seg.type] ?? fallbackIcon;
          return (
            <span
              key={i}
              data-slot="directive-text-chip"
              data-directive-type={seg.type}
              data-directive-id={seg.id}
              aria-label={`${seg.type}: ${seg.label}`}
              className="mx-0.5 inline-flex items-baseline gap-1 rounded-md px-1.5 py-0.5 align-baseline text-[13px] leading-none dark:bg-[#ffb400]/[0.09] light:bg-[#d49600]/[0.1] dark:text-[#ffb400] light:text-[#8a6500] [&_svg]:size-3 [&_svg]:self-center"
            >
              {Icon && <Icon />}
              {seg.label}
            </span>
          );
        })}
      </>
    );
  };
  Component.displayName = "DirectiveText";
  return Component;
}
