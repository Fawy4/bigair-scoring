"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useKeyboardFit } from "./use-keyboard-fit";
import { TextSizeSwitch, ThemeSwitch, useBeachTextSize, useBeachTheme, type BeachTextSize, type BeachTheme } from "./theme-switch";
import { unlockSound, readSoundPref, writeSoundPref } from "@/lib/live/beep";
import { BEACH_THEMES } from "@/lib/live/theme-tokens";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";
import { SlidersHorizontal, Volume2, VolumeX, X } from "lucide-react";

interface Settings {
  theme: BeachTheme;
  setTheme: (t: BeachTheme) => void;
  size: BeachTextSize;
  setSize: (s: BeachTextSize) => void;
  soundOn: boolean;
  setSoundOn: (on: boolean) => void;
}
const Ctx = createContext<Settings | null>(null);

/** Lets a page that owns its own theme state (the /design preview) feed the same settings to the header's round button. */
export function LiveSettingsProvider({ value, children }: { value: Settings; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export type LiveSettingsValue = Settings;

export function useLiveSettings(): Settings {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLiveSettings needs a LiveShell");
  return v;
}

/**
 * The frame of an official screen: the Daylight / Dark theme and Normal / Large size of this device, the page behind it in the theme's colour, and the
 * "Sound on" choice. Sound is off by default on judge and spotter phones and on for the head console; the tap on "Sound on" is also what lets iPhones play sound.
 */
export function LiveShell({ children, soundDefault = false, wide = false, fitKeyboard = false }: { children: React.ReactNode; soundDefault?: boolean; wide?: boolean; /** Spotter screens: while the keyboard is open the whole screen shrinks to what the keyboard leaves free. */ fitKeyboard?: boolean }) {
  const kb = useKeyboardFit(fitKeyboard);
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
      <div data-testid="live-root" data-keyboard={kb.height !== null ? "open" : undefined} style={kb.height !== null ? { height: kb.height, transform: `translateY(${kb.top}px)` } : undefined} data-theme={theme} data-text={size} className={cn(theme === "dark" ? "beach-dark" : "beach-day", size === "large" ? "beach-text-large" : "beach-text-normal", "relative mx-auto flex h-[100dvh] w-full max-w-[640px] flex-col bg-beach-bg text-beach-ink", wide && "min-[900px]:max-w-none")}>
        {children}
      </div>
    </Ctx.Provider>
  );
}

function SoundButton() {
  const s = useLiveSettings();
  return (
    <button
      type="button"
      data-testid="sound-toggle"
      aria-pressed={s.soundOn}
      onClick={() => s.setSoundOn(!s.soundOn)}
      className="inline-flex min-h-tap items-center gap-1.5 rounded-full border border-beach-border bg-beach-fill px-4 text-body font-bold text-beach-ink"
    >
      {s.soundOn ? <Volume2 aria-hidden className="size-4" /> : <VolumeX aria-hidden className="size-4" />}
      {s.soundOn ? copy.live.timer.soundOn : copy.live.timer.soundOff}
    </button>
  );
}

/**
 * The one round settings button at the end of the slim header (New look): it opens Daylight / Dark, Normal / Large and Sound in a small sheet under the header,
 * instead of the row at the bottom of every officials' screen. Closes on a second tap, on Escape and on a tap anywhere else. Nothing moves while it opens (no animation).
 */
export function SettingsMenu({ hideSound = false, onBoard = false }: { hideSound?: boolean; onBoard?: boolean }) {
  const s = useContext(Ctx);
  if (!s) return null;
  return <SettingsMenuBody s={s} hideSound={hideSound} onBoard={onBoard} />;
}

function SettingsMenuBody({ s, hideSound, onBoard }: { s: Settings; hideSound: boolean; onBoard: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        data-testid="settings-button"
        aria-label={copy.live.header.settingsButton}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={cn("inline-flex size-11 items-center justify-center rounded-full border", onBoard ? (open ? "border-beach-on-board bg-beach-on-board text-beach-board" : "border-beach-board-muted bg-transparent text-beach-on-board") : open ? "border-beach-selected bg-beach-selected text-beach-on-selected" : "border-beach-border bg-beach-fill text-beach-ink")}
      >
        {open ? <X aria-hidden className="size-5" strokeWidth={2.5} /> : <SlidersHorizontal aria-hidden className="size-5" strokeWidth={2.5} />}
      </button>
      {open ? (
        <section data-testid="screen-settings" role="dialog" aria-label={copy.live.header.settingsTitle} className="absolute right-0 top-full z-30 mt-1 flex w-[min(20rem,calc(100vw-1rem))] flex-col gap-2 rounded-3xl border border-beach-border bg-beach-bg p-3 shadow-[0_8px_30px_rgba(0,0,0,0.25)]">
          <p className="text-heading font-bold uppercase tracking-wide text-beach-muted">{copy.live.header.settingsTitle}</p>
          <ThemeSwitch theme={s.theme} onChange={s.setTheme} />
          <TextSizeSwitch size={s.size} onChange={s.setSize} />
          {hideSound ? null : <SoundButton />}
        </section>
      ) : null}
    </div>
  );
}

/** The device's own settings as a row (the head judge's laptop console keeps it in its page; phones use the round button in the header). */
export function ScreenSettings({ seatLine, hideSound = false }: { seatLine?: React.ReactNode; /** The head judge's laptop has "Sound on" in its top bar, so it is not repeated here. */ hideSound?: boolean }) {
  const s = useLiveSettings();
  return (
    <section data-testid="screen-settings" aria-label={copy.spotter.settings} className="flex flex-wrap items-center gap-2 border-t border-beach-line pt-2">
      <ThemeSwitch theme={s.theme} onChange={s.setTheme} />
      <TextSizeSwitch size={s.size} onChange={s.setSize} />
      {hideSound ? null : <SoundButton />}
      {seatLine}
    </section>
  );
}
