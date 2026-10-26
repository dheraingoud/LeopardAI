"use client";

import {
  useCallback,
  useEffect,
  useInsertionEffect,
  useRef,
  type RefCallback,
} from "react";
import { useLeopard, useLeopardEvent, useLeopardState } from "@/leopard-ui/store";
import { useOnScrollToBottom } from "../../utils/hooks/useOnScrollToBottom";
import { useManagedRef } from "../../utils/hooks/useManagedRef";
import { useThreadViewportStore } from "../../context/react/ThreadViewportContext";
import { getThreadViewportAutoScroll } from "../../context/stores/ThreadViewport";
import { useIsomorphicLayoutEffect } from "../../utils/useIsomorphicLayoutEffect";

export namespace useThreadViewportAutoScroll {
  export type Options = {
    /**
     * Whether to automatically scroll to the bottom when new messages are added.
     * When enabled, the viewport will automatically scroll to show the latest content.
     *
     * Default false if `turnAnchor` is "top", otherwise defaults to true.
     */
    autoScroll?: boolean | undefined;

    /**
     * Whether to scroll to bottom when a new run starts.
     *
     * Defaults to true.
     */
    scrollToBottomOnRunStart?: boolean | undefined;

    /**
     * Whether to scroll to bottom when messages first appear in the thread.
     *
     * Defaults to true.
     */
    scrollToBottomOnInitialize?: boolean | undefined;

    /**
     * Whether to scroll to bottom when switching to a different thread.
     *
     * Defaults to true.
     */
    scrollToBottomOnThreadSwitch?: boolean | undefined;
  };
}

export const useThreadViewportAutoScroll = <TElement extends HTMLElement>({
  autoScroll,
  scrollToBottomOnRunStart = true,
  scrollToBottomOnInitialize = true,
  scrollToBottomOnThreadSwitch = true,
}: useThreadViewportAutoScroll.Options): RefCallback<TElement> => {
  const leopard = useLeopard();
  const divRef = useRef<TElement>(null);
  const hasMessages = useLeopardState((s) => s.thread.messages.length > 0);
  const firstMessageId = useLeopardState((s) => s.thread.messages[0]?.id);
  const threadId = useLeopardState((s) => s.optional.threadListItem?.id);
  const isRunning = useLeopardState((s) => s.thread.isRunning);
  const threadViewportStore = useThreadViewportStore();
  const binding = getThreadViewportAutoScroll(threadViewportStore);
  const { controller } = binding;

  useInsertionEffect(() => {
    binding.getOptions = () => {
      const state = threadViewportStore.getState();
      return {
        autoScroll: autoScroll ?? state.turnAnchor !== "top",
        holdFollow:
          isRunning &&
          state.turnAnchor === "top" &&
          state.element.viewport === divRef.current &&
          state.element.anchor !== null,
        scrollToBottomOnInitialize,
        scrollToBottomOnRunStart:
          scrollToBottomOnRunStart && state.turnAnchor !== "top",
        scrollToBottomOnThreadSwitch,
      };
    };
  });

  const previousRef = useRef({ threadId, firstMessageId });
  useIsomorphicLayoutEffect(() => {
    const previous = previousRef.current;
    previousRef.current = { threadId, firstMessageId };
    if (previous.threadId !== threadId) return;
    const previousFirstMessageId = previous.firstMessageId;
    if (
      previousFirstMessageId === undefined ||
      previousFirstMessageId === firstMessageId
    )
      return;
    const prepended = leopard.thread
      .getState()
      .messages.some(
        (message, index) => index > 0 && message.id === previousFirstMessageId,
      );
    if (prepended) controller.messagesPrepended(previousFirstMessageId);
  }, [leopard, controller, firstMessageId, threadId]);

  useIsomorphicLayoutEffect(() => {
    controller.setHasMessages(hasMessages);
  }, [controller, hasMessages, scrollToBottomOnInitialize]);

  useOnScrollToBottom(({ behavior }) => controller.scrollToBottom(behavior));
  useLeopardEvent("thread.runStart", () => controller.runStarted());
  useEffect(() => {
    if (!leopard.optional.threads) return;
    return leopard.on("threads.selectionChanged", () =>
      controller.threadSwitched(),
    );
  }, [leopard, controller]);

  return useManagedRef(
    useCallback(
      (element: TElement) => {
        divRef.current = element;
        const detach = controller.attach(element);
        return () => {
          detach();
          divRef.current = null;
        };
      },
      [controller],
    ),
  );
};
