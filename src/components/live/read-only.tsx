"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";

const Observing = createContext(false);

/** True inside an observed screen: nothing on it may act (the database refuses an observer's writes anyway; this keeps the screen from even trying). */
export function useObserving(): boolean {
  return useContext(Observing);
}

const BLOCKED = ["click", "dblclick", "auxclick", "contextmenu", "pointerdown", "mousedown", "submit", "input", "change", "drop", "paste", "cut"] as const;

/**
 * An official's screen, read only: every button, box and choice is disabled (a disabled fieldset around the whole screen), and every tap, key and form event is
 * stopped before the screen hears it, including in dialogs and menus drawn outside the fieldset. Scrolling still works. The screen itself is unchanged, so the
 * observer sees exactly what the official sees.
 */
export function ReadOnlyFrame({ children }: { children: ReactNode }) {
  useEffect(() => {
    const stop = (e: Event) => {
      e.stopPropagation();
      if (e.cancelable && e.type !== "pointerdown" && e.type !== "mousedown") e.preventDefault(); // pointer / mouse down stay cancel-free so a finger can still scroll
    };
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Tab" || e.key.startsWith("Arrow") || e.key === "PageUp" || e.key === "PageDown" || e.key === "Home" || e.key === "End") return;
      e.stopPropagation();
      e.preventDefault();
    };
    for (const t of BLOCKED) document.addEventListener(t, stop, true);
    document.addEventListener("keydown", keys, true);
    document.documentElement.dataset.observing = "true";
    return () => {
      for (const t of BLOCKED) document.removeEventListener(t, stop, true);
      document.removeEventListener("keydown", keys, true);
      delete document.documentElement.dataset.observing;
    };
  }, []);
  return (
    <Observing.Provider value={true}>
      <fieldset disabled data-testid="observed-screen" className="contents">
        {children}
      </fieldset>
    </Observing.Provider>
  );
}
