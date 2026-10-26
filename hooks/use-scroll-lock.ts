"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

// leopard adoption: lock scroll position during collapsible/height animations.
// Prevents page jumps when content height changes during animations — locks the
// nearest scrollable ancestor's scrollTop and hides the scrollbar, compensating
// for the collapsed gutter with padding (RTL-aware). Cleans up after the
// animation duration.
const findScrollableAncestor = (element: HTMLElement | null) => {
  let current = element;
  while (current) {
    const { overflowY } = getComputedStyle(current);
    if (overflowY === "scroll" || overflowY === "auto") return current;
    current = current.parentElement;
  }
  return null;
};

export const useScrollLock = <T extends HTMLElement = HTMLElement>(
  animatedElementRef: RefObject<T | null>,
  animationDuration: number,
) => {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  return useCallback(() => {
    cleanupRef.current?.();

    const scrollContainer = findScrollableAncestor(animatedElementRef.current);
    if (!scrollContainer) {
      cleanupRef.current = null;
      return;
    }

    const scrollPosition = scrollContainer.scrollTop;
    const scrollbarWidth = scrollContainer.style.scrollbarWidth;

    const computed = getComputedStyle(scrollContainer);
    const paddingSide =
      computed.direction === "rtl" ? "paddingLeft" : "paddingRight";
    const previousPadding = scrollContainer.style[paddingSide];
    const elementScrollbarSize =
      scrollContainer.offsetWidth -
      scrollContainer.clientWidth -
      parseFloat(computed.borderLeftWidth) -
      parseFloat(computed.borderRightWidth);
    const ownerDocument = scrollContainer.ownerDocument;
    const isRootScroller =
      scrollContainer === ownerDocument.documentElement ||
      scrollContainer === ownerDocument.body;
    const scrollbarSize =
      isRootScroller && elementScrollbarSize <= 0
        ? (ownerDocument.defaultView?.innerWidth ?? 0) -
          ownerDocument.documentElement.clientWidth
        : elementScrollbarSize;

    scrollContainer.style.scrollbarWidth = "none";
    if (scrollbarSize > 0) {
      scrollContainer.style[paddingSide] = `${
        parseFloat(computed[paddingSide]) + scrollbarSize
      }px`;
    }

    const restoreStyles = () => {
      scrollContainer.style.scrollbarWidth = scrollbarWidth;
      scrollContainer.style[paddingSide] = previousPadding;
    };

    const resetPosition = () => (scrollContainer.scrollTop = scrollPosition);
    scrollContainer.addEventListener("scroll", resetPosition);

    const timeoutId = setTimeout(() => {
      scrollContainer.removeEventListener("scroll", resetPosition);
      restoreStyles();
      cleanupRef.current = null;
    }, animationDuration);

    cleanupRef.current = () => {
      clearTimeout(timeoutId);
      scrollContainer.removeEventListener("scroll", resetPosition);
      restoreStyles();
    };
  }, [animationDuration, animatedElementRef]);
};
