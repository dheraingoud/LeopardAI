"use client";

import { useEffect, useState } from "react";
import { SquareIcon, Volume2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ghostButton } from "./surfaces";

// Assistant action-row button: speaks `text` via window.speechSynthesis; a
// second click cancels. Amber while speaking; unmount-cancel on cleanup.
export function ReadAloudButton({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const [speaking, setSpeaking] = useState(false);
  // SSR + hydration safe: only render after mount, when speechSynthesis exists.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!mounted) return;
    return () => window.speechSynthesis?.cancel();
  }, [mounted]);

  if (!mounted || !("speechSynthesis" in window) || !text) return null;

  const toggle = () => {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  return (
    <button
      type="button"
      aria-label={speaking ? "Stop reading" : "Read aloud"}
      aria-pressed={speaking}
      title={speaking ? "Stop" : "Read aloud"}
      onClick={toggle}
      className={cn(
        ghostButton,
        "size-7",
        speaking &&
          "dark:bg-[#ffb400]/[0.12] light:bg-[#ffb400]/[0.16] dark:text-[#ffb400] light:text-[#d49600]",
        className,
      )}
    >
      {speaking ? (
        <SquareIcon className="size-3" />
      ) : (
        <Volume2Icon className="size-3.5" />
      )}
    </button>
  );
}
