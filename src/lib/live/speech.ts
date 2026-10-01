/** Speech to text for the spotter (docs/PLAN-phase-5 step 2). Feature-detected: where the browser has no speech recognition the mic button is hidden and the text field stays. */
interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speechSupported = (): boolean => ctor() !== null;

/** Listens once. `onText` gets what was heard (best guess); `onEnd` is always called, with an error code when it failed. */
export function listenOnce(lang: string, onText: (text: string, confidence: number) => void, onEnd: (error?: string) => void): () => void {
  const C = ctor();
  if (!C) {
    onEnd("unsupported");
    return () => {};
  }
  const r = new C();
  r.lang = lang;
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.continuous = false;
  let failed: string | undefined;
  r.onresult = (e) => {
    const best = e.results[0]?.[0];
    if (best?.transcript) onText(best.transcript, best.confidence ?? 1);
  };
  r.onerror = (e) => {
    failed = e.error ?? "error";
  };
  r.onend = () => onEnd(failed);
  try {
    r.start();
  } catch {
    onEnd("error");
  }
  return () => {
    try {
      r.stop();
    } catch {
      /* already stopped */
    }
  };
}
