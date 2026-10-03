/** The timer's sound (docs/PLAN-phase-5 step 1, addition B): a 0.2 s beep from the browser's Web Audio, and a short vibration where the phone has one. */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/** Called from the "Sound on" tap: iPhones only play sound after a tap on the page. */
export function unlockSound(): void {
  const a = audio();
  if (a && a.state === "suspended") void a.resume();
}

export function beep(times = 1): void {
  const a = audio();
  if (a) {
    for (let i = 0; i < times; i++) {
      try {
        const osc = a.createOscillator();
        const gain = a.createGain();
        osc.frequency.value = 880;
        gain.gain.value = 0.2;
        osc.connect(gain);
        gain.connect(a.destination);
        const at = a.currentTime + i * 0.35;
        osc.start(at);
        osc.stop(at + 0.2);
      } catch {
        /* a failed beep must never break the timer */
      }
    }
  }
  try {
    navigator.vibrate?.(200);
  } catch {
    /* iPhones do not vibrate from a web page */
  }
}

const KEY = "bigair-sound";

/** Per device, kept in localStorage inside try/catch. `fallback` is the default: on for the head console, off for judge phones. */
export function readSoundPref(fallback: boolean): boolean {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}
export function writeSoundPref(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* private window: the choice lasts until the page closes */
  }
}

/**
 * The flag horn (Flags): a low, long blast, one or two of them. Nothing vibrates. Only called behind the "Sound on" tap, like the beep, because iPhones only
 * play sound after a tap on the page.
 */
export function horn(times: 1 | 2 = 1): void {
  const a = audio();
  if (!a) return;
  for (let i = 0; i < times; i++) {
    try {
      const osc = a.createOscillator();
      const gain = a.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = 220;
      gain.gain.value = 0.25;
      osc.connect(gain);
      gain.connect(a.destination);
      const at = a.currentTime + i * 0.9;
      osc.start(at);
      osc.stop(at + 0.7);
    } catch {
      /* a failed horn must never break the screen */
    }
  }
}
