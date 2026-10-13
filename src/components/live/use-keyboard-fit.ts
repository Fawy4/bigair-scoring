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
    // iPhone sends many resize / scroll events while the keyboard slides: apply at most one per frame, so the screen follows without jumping
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };
    // when the keyboard has gone, the browser may leave the page scrolled up by the amount it moved for the typing box: put it back (header fully visible, no band at the bottom).
    // iPhone sends the last resize before the slide has finished, so the check is repeated once the slide is over.
    let settle: ReturnType<typeof setTimeout> | undefined;
    const reset = () => {
      update();
      if (window.innerHeight - vv.height <= KEYBOARD_MIN_PX && (window.scrollY !== 0 || window.scrollX !== 0)) window.scrollTo(0, 0);
    };
    const afterBlur = () => {
      clearTimeout(settle);
      settle = setTimeout(reset, 120);
      setTimeout(reset, 400);
    };
    update();
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    window.addEventListener("focusout", afterBlur);
    return () => {
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      window.removeEventListener("focusout", afterBlur);
      clearTimeout(settle);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [enabled]);
  return fit;
}

/** Brings an element fully into view by scrolling only the sheet's own body (never the page, which an iPhone would leave shifted when the keyboard closes). */
export function keepInView(el: HTMLElement | null | undefined): void {
  if (!el) return;
  const box = el.closest<HTMLElement>('[data-testid="screen-body"]');
  if (!box) return;
  const a = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  if (a.bottom > b.bottom) box.scrollTop += a.bottom - b.bottom;
  else if (a.top < b.top) box.scrollTop -= b.top - a.top;
}
