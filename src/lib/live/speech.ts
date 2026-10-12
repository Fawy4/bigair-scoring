/**
 * Speech to text for the spotter. Feature-detected: where the browser has no speech recognition the mic button is hidden and the text box stays.
 *
 * Rules that come from WebKit bugs 317741 and 321436 (iOS 26.6, in Safari and from the home-screen icon): after an <audio> or <video> element has played, the next
 * start() looks as if it listens but never returns words, an error or an end. So: a NEW recognition object for every tap (never reused); start() is called directly
 * inside the tap; language en-US, continuous off; a running one is aborted before any app sound plays (abortSpeech, called by beep.ts) and when the line, the rider or
 * the view changes; and it is never silent: it ends with words or with one named reason, and a recognition that gives no word, error or end within 8 seconds is stopped and
 * reported as "no answer".
 */
export interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort?(): void;
}
export type RecognitionCtor = new () => Recognition;

/** How long a tap may stay without any answer from the browser. */
export const NO_ANSWER_MS = 8000;
export const SPEECH_LANG = "en-US";

export type SpeechFailure = "blocked" | "unavailable" | "nothing" | "timeout";
/** How a listening ended: with words, or with one named reason and the browser's own error word (when it gave one). */
export type SpeechEnd = { ok: true } | { ok: false; reason: SpeechFailure; code: string | null };

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speechSupported = (): boolean => ctor() !== null;

/** The browser's error word, as one of the reasons the spotter sees ("aborted" is our own stop and says nothing). */
export function failureOf(code: string | undefined): SpeechFailure | null {
  switch (code) {
    case "aborted":
      return null;
    case "not-allowed":
    case "service-not-allowed":
      return "blocked";
    case "no-speech":
      return "nothing";
    default:
      return "unavailable"; // audio-capture, network, language-not-supported, bad-grammar, anything new
  }
}

interface Running {
  r: Recognition;
  finish: (end: SpeechEnd | null) => void;
}
let running: Running | null = null;

/** Stops a running listening without a message (the line, the rider or the view changed, or an app sound is about to play). */
export function abortSpeech(): void {
  running?.finish(null);
}

export interface ListenOptions {
  onText: (text: string) => void;
  /** Always called once, unless the listening was aborted (then it is called with null). */
  onEnd: (end: SpeechEnd | null) => void;
  lang?: string;
  timeoutMs?: number;
  /** For tests: the engine to use instead of the browser's. */
  engine?: RecognitionCtor | null;
  /** For tests: timers. */
  timers?: { set: (fn: () => void, ms: number) => unknown; clear: (id: unknown) => void };
}

/**
 * Listens once. Call it straight from the tap. Returns a function that stops it (the words heard so far still count). Only one listening exists at a time: starting a
 * new one aborts the old one.
 */
export function listenOnce(o: ListenOptions): () => void {
  abortSpeech();
  const C = o.engine === undefined ? ctor() : o.engine;
  if (!C) {
    o.onEnd({ ok: false, reason: "unavailable", code: "unsupported" });
    return () => {};
  }
  const timers = o.timers ?? { set: (fn: () => void, ms: number) => setTimeout(fn, ms), clear: (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>) };
  let r: Recognition;
  try {
    r = new C(); // a new object on every tap, never reused
  } catch {
    o.onEnd({ ok: false, reason: "unavailable", code: "construct" });
    return () => {};
  }
  r.lang = o.lang ?? SPEECH_LANG;
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.continuous = false;
  let done = false;
  let heard = false;
  let code: string | undefined;
  let timer: unknown = null;
  const finish = (end: SpeechEnd | null) => {
    if (done) return;
    done = true;
    if (timer !== null) timers.clear(timer);
    if (running?.r === r) running = null;
    r.onresult = r.onerror = r.onend = null;
    try {
      if (end === null || (!end.ok && end.reason === "timeout")) (r.abort ?? r.stop).call(r);
    } catch {
      /* already stopped */
    }
    o.onEnd(end);
  };
  running = { r, finish };
  r.onresult = (e) => {
    const best = e.results[0]?.[0];
    if (best?.transcript?.trim() && !heard) {
      heard = true;
      o.onText(best.transcript.trim());
    }
  };
  r.onerror = (e) => {
    code = e.error ?? "error";
  };
  r.onend = () => {
    if (heard) return finish({ ok: true });
    finish({ ok: false, reason: code === undefined ? "nothing" : (failureOf(code) ?? "nothing"), code: code ?? null }); // our own abort never gets here: finish() unhooks the handlers first
  };
  timer = timers.set(() => finish({ ok: false, reason: "timeout", code: null }), o.timeoutMs ?? NO_ANSWER_MS);
  try {
    r.start();
  } catch (e) {
    finish({ ok: false, reason: "unavailable", code: e instanceof Error ? e.name : "start" });
  }
  return () => {
    if (done) return;
    try {
      r.stop(); // the browser answers with what it heard, then ends
    } catch {
      finish(null);
    }
  };
}
