"use client";

import { useState } from "react";
import { LiveSettingsProvider } from "./live-shell";
import type { BeachTextSize, BeachTheme } from "./theme-switch";
import { cn } from "@/lib/utils";

/**
 * A phone-shaped box for a mock screen. On a computer it is a 390 × 844 frame; on a phone it fills the display (under the sticky bar of the page),
 * so the owner can see at once whether a screen fits without scrolling. `data-testid="screen-body"` is the area that would scroll.
 */
export function PhoneFrame({ id, title, note, children }: { id: string; title: string; note: string; children: React.ReactNode }) {
  return (
    <section id={id} data-testid={`section-${id}`} className="flex scroll-mt-16 flex-col gap-1">
      <h2 className="text-heading font-semibold">{title}</h2>
      <p className="text-small font-medium text-beach-muted">{note}</p>
      <div
        data-testid="phone-frame"
        className={cn(
          "relative mx-auto flex w-full flex-col overflow-hidden border border-beach-line bg-beach-bg",
          // phone: full width, as tall as the display minus the sticky bar; computer: a 390 × 844 phone
          "h-[calc(100dvh-60px)] rounded-card md:h-[844px] md:w-[390px] md:rounded-[36px] md:border-[6px] md:border-beach-ink",
        )}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * A phone-shaped box that wears one theme by itself (Daylight or Dark), whatever the page around it is set to, with its own settings button state.
 * The /design page shows the same composed screen once in Day and once in Dark next to each other, so both can be looked at (and photographed) at once.
 */
export function ThemedPhone({ theme, children, label }: { theme: "day" | "dark"; label: string; children: React.ReactNode }) {
  const [t, setT] = useState<BeachTheme>(theme);
  const [size, setSize] = useState<BeachTextSize>("normal");
  const [soundOn, setSoundOn] = useState(false);
  return (
    <LiveSettingsProvider value={{ theme: t, setTheme: setT, size, setSize, soundOn, setSoundOn }}>
      <div
        data-testid="phone-frame"
        data-theme={t}
        data-text={size}
        aria-label={label}
        className={cn(
          t === "dark" ? "beach-dark" : "beach-day",
          size === "large" ? "beach-text-large" : "beach-text-normal",
          "relative flex w-full flex-col overflow-hidden border border-beach-line bg-beach-bg text-beach-ink",
          "h-[calc(100dvh-60px)] rounded-card md:h-[844px] md:w-[390px] md:rounded-[36px] md:border-[6px] md:border-beach-ink",
        )}
      >
        {children}
      </div>
    </LiveSettingsProvider>
  );
}

/** A themed strip of one 390 px column (no phone frame) for putting a piece of a screen next to another in Daylight or Dark. */
export function ThemedColumn({ theme, children }: { theme: "day" | "dark"; children: React.ReactNode }) {
  const [t, setT] = useState<BeachTheme>(theme);
  const [size, setSize] = useState<BeachTextSize>("normal");
  const [soundOn, setSoundOn] = useState(false);
  return (
    <LiveSettingsProvider value={{ theme: t, setTheme: setT, size, setSize, soundOn, setSoundOn }}>
      <div data-theme={t} className={cn(t === "dark" ? "beach-dark" : "beach-day", size === "large" ? "beach-text-large" : "beach-text-normal", "w-[390px] max-w-full overflow-visible bg-beach-bg text-beach-ink")}>{children}</div>
    </LiveSettingsProvider>
  );
}
