"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Dictation (speech input) — wraps the browser SpeechRecognition API into a
// session the composer can drive: listen() starts streaming partial + final
// transcripts into onResult; stop() ends the session; the mic button reflects
// `listening`. No deps — webkitSpeechRecognition where available. The hook
// is a no-op (listening stays false, start is a no-op) where unsupported.
type DictationHandlers = {
  /** Called with the running transcript (partial or final). */
  onResult: (transcript: string, isFinal: boolean) => void;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
};

function getRecognitionCtor():
  | (new () => SpeechRecognitionLike)
  | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function useDictation({ onResult }: DictationHandlers) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    setSupported(typeof getRecognitionCtor() !== "undefined");
  }, []);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  const toggle = useCallback(() => {
    if (listening) {
      stop();
      return;
    }
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = typeof navigator !== "undefined" ? navigator.language : "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        const text = r[0]?.transcript ?? "";
        if (r.isFinal) final += text;
        else interim += text;
      }
      if (final) onResultRef.current(final, true);
      else if (interim) onResultRef.current(interim, false);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [listening, stop]);

  // Release on unmount.
  useEffect(
    () => () => {
      try {
        recRef.current?.abort();
      } catch {
        /* already closed */
      }
    },
    [],
  );

  return { listening, supported, toggle, stop };
}
