"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { TextSizeSwitch, ThemeSwitch, useBeachTextSize, useBeachTheme, type BeachTextSize, type BeachTheme } from "./theme-switch";
import { unlockSound, readSoundPref, writeSoundPref } from "@/lib/live/beep";
import { BEACH_THEMES } from "@/lib/live/theme-tokens";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";
import { Volume2, VolumeX } from "lucide-react";

interface Settings {
  theme: BeachTheme;
  setTheme: (t: BeachTheme) => void;
  size: BeachTextSize;
  setSize: (s: BeachTextSize) => void;
  soundOn: boolean;
  setSoundOn: (on: boolean) => void;
}
const Ctx = createContext<Settings | null>(null);

export function useLiveSettings(): Settings {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLiveSettings needs a LiveShell");
  return v;
}

/**
 * The frame of an official screen: the Daylight / Dark theme and Normal / Large size of this device, the page behind it in the theme's colour, and the
 * "Sound on" choice. Sound is off by default on judge and spotter phones and on for the head console; the tap on "Sound on" is also what lets iPhones play sound.
 */
export function LiveShell({ children, soundDefault = false }: { children: React.ReactNode; soundDefault?: boolean }) {
  const [theme, setTheme] = useBeachTheme();
  const [size, setSize] = useBeachTextSize();
  const [soundOn, setSound] = useState(soundDefault);
  useEffect(() => setSound(readSoundPref(soundDefault)), [soundDefault]);
  const setSoundOn = useCallback((on: boolean) => {
    setSound(on);
    writeSoundPref(on);
    if (on) unlockSound();
  }, []);
  useEffect(() => {
    const bg = theme === "dark" ? BEACH_THEMES.dark.bg : BEACH_THEMES.day.bg;
    const prev = document.documentElement.style.backgroundColor;
    document.documentElement.style.backgroundColor = bg;
    return () => {
      document.documentElement.style.backgroundColor = prev;
    };
  }, [theme]);
  return (
    <Ctx.Provider value={{ theme, setTheme, size, setSize, soundOn, setSoundOn }}>
      <div data-testid="live-root" data-theme={theme} data-text={size} className={cn(theme === "dark" ? "beach-dark" : "beach-day", size === "large" ? "beach-text-large" : "beach-text-normal", "relative mx-auto flex h-[100dvh] w-full max-w-[640px] flex-col bg-beach-bg text-beach-ink")}>
        {children}
      </div>
    </Ctx.Provider>
  );
}

/** The device's own settings: theme, text size and sound. Shown at the top of the Details view. */
export function ScreenSettings({ seatLine }: { seatLine?: React.ReactNode }) {
  const s = useLiveSettings();
  return (
    <section data-testid="screen-settings" aria-label={copy.spotter.settings} className="flex flex-wrap items-center gap-1.5 rounded-card border border-beach-line bg-beach-surface p-1.5">
      <ThemeSwitch theme={s.theme} onChange={s.setTheme} />
      <TextSizeSwitch size={s.size} onChange={s.setSize} />
      <button
        type="button"
        data-testid="sound-toggle"
        aria-pressed={s.soundOn}
        onClick={() => s.setSoundOn(!s.soundOn)}
        className="inline-flex min-h-tap items-center gap-1 rounded-xl border border-beach-border bg-beach-bg px-3 text-small font-semibold text-beach-ink"
      >
        {s.soundOn ? <Volume2 aria-hidden className="size-4" /> : <VolumeX aria-hidden className="size-4" />}
        {s.soundOn ? copy.live.timer.soundOn : copy.live.timer.soundOff}
      </button>
      {seatLine}
    </section>
  );
}
