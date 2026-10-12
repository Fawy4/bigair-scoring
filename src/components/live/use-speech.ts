"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { abortSpeech, listenOnce, speechSupported, type SpeechFailure } from "@/lib/live/speech";
import { copy } from "@/lib/ui-copy";

const T = copy.live.builder;
const SAYING: Record<SpeechFailure, string> = { blocked: T.micBlocked, unavailable: T.micUnavailable, nothing: T.micNothing, timeout: T.micTimeout };

export interface SpeechNote {
  /** The one line that says why nothing was heard. */
  text: string;
  /** The browser's own error word, in small print (so a screenshot tells us what happened). */
  code: string | null;
}

/**
 * The microphone of one trick box. A tap shows "Listening…" at once and starts a new recognition inside the tap; a second tap stops it; it ends with words handed to
 * `onText` (read as if typed) or with one line saying why not. Stopped without a message when `resetKey` changes (another line, rider or view) and when the box goes away.
 */
export function useSpeech(onText: (text: string) => void, resetKey: string) {
  // only known in the browser: deciding it while rendering would not match what the server drew
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(speechSupported()), []);
  const [listening, setListening] = useState(false);
  const [note, setNote] = useState<SpeechNote | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const text = useRef(onText);
  text.current = onText;

  useEffect(() => {
    return () => {
      if (stop.current) abortSpeech();
      stop.current = null;
      setListening(false);
      setNote(null);
    };
  }, [resetKey]);

  const toggle = useCallback(() => {
    if (stop.current) {
      stop.current(); // a second tap while listening stops it; what was heard still counts
      return;
    }
    setNote(null);
    setListening(true);
    stop.current = listenOnce({
      onText: (t) => text.current(t),
      onEnd: (end) => {
        stop.current = null;
        setListening(false);
        if (end && !end.ok) setNote({ text: SAYING[end.reason], code: end.code });
      },
    });
  }, []);

  return { supported, listening, note, toggle, clearNote: () => setNote(null) };
}
