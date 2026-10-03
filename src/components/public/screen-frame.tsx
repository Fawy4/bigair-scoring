"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { otherMode, parseScreenMode, SCREEN_CONTROL_MS, SCREEN_MODE_KEY, type ScreenMode } from "@/lib/public/screen-mode";

/**
 * The frame of the big screen: Day or Dark colours. The event's default (Event step, Dark unless changed) is what a browser shows until it has chosen: a quiet control
 * appears on mouse move or tap and hides again after three seconds; the key D flips the mode on a laptop; the choice is remembered in this browser.
 * Colours come from the --bs-* variables of the `bs-dark` / `bs-day` classes (globals.css); nothing else about the screen changes.
 */
export function ScreenFrame({ defaultMode, children, labels }: { defaultMode: ScreenMode; children: React.ReactNode; labels: { toggleToDay: string; toggleToDark: string } }) {
  const [mode, setMode] = useState<ScreenMode>(defaultMode);
  const [shown, setShown] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // this browser's own choice, when it has made one
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SCREEN_MODE_KEY);
      if (saved) setMode(parseScreenMode(saved, defaultMode));
    } catch {
      /* storage blocked: the event's default stays */
    }
  }, [defaultMode]);

  const choose = useCallback((next: ScreenMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(SCREEN_MODE_KEY, next);
    } catch {
      /* the choice just is not remembered */
    }
  }, []);

  const wake = useCallback(() => {
    setShown(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShown(false), SCREEN_CONTROL_MS);
  }, []);
  useEffect(() => () => void (hideTimer.current && clearTimeout(hideTimer.current)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "d" || e.key === "D") && !e.ctrlKey && !e.metaKey && !e.altKey) choose(otherMode(mode));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, choose]);

  const next = otherMode(mode);
  return (
    <div data-testid="big-screen" data-mode={mode} onMouseMove={wake} onPointerDown={wake} className={`${mode === "day" ? "bs-day" : "bs-dark"} relative flex h-screen w-screen flex-col overflow-hidden bg-[var(--bs-bg)] p-[2.5vw] text-[var(--bs-ink)]`}>
      {children}
      {shown ? (
        <button
          type="button"
          data-testid="screen-mode-toggle"
          aria-label={next === "day" ? labels.toggleToDay : labels.toggleToDark}
          onClick={() => {
            choose(next);
            wake();
          }}
          className="absolute left-[2.5vw] top-[2.5vw] z-10 inline-flex items-center gap-[0.6vw] rounded-full border-2 border-[var(--bs-ink)] bg-[var(--bs-bg)] px-[1.4vw] py-[0.5vw] text-[1.6vw] font-semibold text-[var(--bs-ink)]"
        >
          {next === "day" ? <Sun aria-hidden className="size-[1.8vw]" /> : <Moon aria-hidden className="size-[1.8vw]" />}
          {next === "day" ? labels.toggleToDay : labels.toggleToDark}
        </button>
      ) : null}
    </div>
  );
}
