"use client";

import { useLayoutEffect, useRef } from "react";

/** The smallest the content may be scaled to: 0.55 of its normal size (still large print on a TV or a projector). Below this the page keeps its size and the number of rows is the organiser's call. */
export const FIT_MIN_ZOOM = 0.55;

/**
 * One page of the big screen, fitted to the room it has: if the content (a long timetable, long names that wrap onto second lines) is taller than the page, it is scaled
 * down a step at a time until it fits, so nothing is cut off at the bottom. The scale is worked out in the browser after every redraw and whenever the page changes size
 * (a hidden page measures nothing and is fitted when it is shown). Text always wraps rather than being cut with "…".
 */
export function FitSlide({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const fit = () => {
    const outer = box.current;
    const el = inner.current;
    if (!outer || !el || outer.clientHeight === 0) return;
    let zoom = 1;
    el.style.zoom = "1";
    while (zoom > FIT_MIN_ZOOM && (outer.scrollHeight > outer.clientHeight + 1 || outer.scrollWidth > outer.clientWidth + 1)) {
      zoom = Math.round((zoom - 0.04) * 100) / 100;
      el.style.zoom = String(zoom);
    }
    el.dataset.zoom = String(zoom);
  };
  useLayoutEffect(fit); // after every redraw (the data changes with every poll)
  useLayoutEffect(() => {
    const outer = box.current;
    if (!outer) return;
    const ro = new ResizeObserver(fit);
    ro.observe(outer);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} data-testid="fit-slide" className="h-full w-full overflow-hidden">
      <div ref={inner} className="h-full w-full">
        {children}
      </div>
    </div>
  );
}
