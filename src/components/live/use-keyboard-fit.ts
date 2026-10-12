"use client";

import { useEffect, useState } from "react";

/** A soft keyboard takes at least this many pixels; anything smaller is a browser bar sliding in or out, not a keyboard. */
export const KEYBOARD_MIN_PX = 120;

export interface KeyboardFit {
  /** The height of what is really visible above the keyboard, or null while no keyboard is open (the screen then keeps its normal height). */
  height: number | null;
  /** How far the browser has scrolled the page to show the typing box (iPhone): the screen follows it, so it stays in view. */
  top: number;
}

/**
 * Keeps the whole screen inside the part of the display the keyboard leaves free. An iPhone (Safari and the home-screen icon) and Android Chrome do not shrink the
 * page when the keyboard opens: they only shrink the "visual viewport". The screen is a column with its buttons at the bottom, so giving the column that height puts
 * the text box, Log and CRASH (or a Rider sheet line) directly above the keyboard. Nothing happens when `enabled` is false or the browser has no visual viewport.
 */
export function useKeyboardFit(enabled: boolean): KeyboardFit {
  const [fit, setFit] = useState<KeyboardFit>({ height: null, top: 0 });
  useEffect(() => {
    const vv = typeof window === "undefined" ? null : window.visualViewport;
    if (!enabled || !vv) return;
    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      const open = window.innerHeight - vv.height > KEYBOARD_MIN_PX && covered >= -1;
      setFit((prev) => {
        const next: KeyboardFit = open ? { height: Math.round(vv.height), top: Math.round(vv.offsetTop) } : { height: null, top: 0 };
        return prev.height === next.height && prev.top === next.top ? prev : next;
      });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [enabled]);
  return fit;
}
