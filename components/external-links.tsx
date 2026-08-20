"use client";

import { useEffect } from "react";

/**
 * Global "open any link in a new tab" net.
 *
 * Rendered once at the app root. A single delegated click listener catches
 * anchor clicks anywhere in the app that react-markdown's `a` component can't
 * reach (raw-HTML links in chat content, arbitrary anchors in other surfaces)
 * and opens external (absolute http/https) links in a NEW tab instead of the
 * same tab, so a user never navigates away from the chat.
 *
 * Relative/app-internal anchors (`<a href="/…">`, Next `<Link>`) are left to
 * normal navigation — forcing those into new tabs would break app routing.
 */
export function ExternalLinksNewTab() {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
      const target = (e.target as HTMLElement | null)?.closest?.(`a[href]`);
      if (!target) return;
      const a = target as HTMLAnchorElement;
      if (a.target && a.target !== "_self") return;
      const href = a.getAttribute("href") ?? "";
      const external =
        /^https?:\/\//i.test(href) ||
        (href.startsWith("//") && new URL(href, window.location.href).protocol.startsWith("http"));
      if (!external) return;
      e.preventDefault();
      window.open(href, "_blank", "noopener,noreferrer");
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}