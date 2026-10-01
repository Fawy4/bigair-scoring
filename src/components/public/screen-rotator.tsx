"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { copy } from "@/lib/ui-copy";

/**
 * The big screen's pages, one at a time. The pages are drawn on the server (so they stay fresh with every poll); this only decides which one is visible: it moves on every
 * N seconds, Space pauses and resumes, the number keys jump to a page. Pages change by swapping, never by sliding or fading (nothing that fights the sun).
 */
export function ScreenRotator({ seconds, children, labels }: { seconds: number; children: React.ReactNode[]; labels: string[] }) {
  const count = children.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  const go = useCallback((i: number) => setIndex(count ? ((i % count) + count) % count : 0), [count]);
  useEffect(() => {
    if (paused || count < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), Math.max(5, seconds) * 1000);
    return () => clearInterval(id);
  }, [paused, count, seconds]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (/^[1-9]$/.test(e.key)) go(Number(e.key) - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);
  const shown = Math.min(index, Math.max(0, count - 1));

  return (
    <div data-testid="screen-rotator" data-index={shown} data-paused={paused} className="flex h-full min-h-0 flex-1 flex-col">
      {children.map((child, i) => (
        <section key={i} data-testid="screen-slide" data-slide={labels[i]} hidden={i !== shown} aria-hidden={i !== shown} className="min-h-0 flex-1">
          {child}
        </section>
      ))}
      <p className="sr-only" aria-live="polite">
        {paused ? copy.pub.screen.pause : labels[shown]}
      </p>
      {paused ? (
        <p data-testid="screen-paused" className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border-2 border-white px-5 py-1 text-[1.6vw] font-semibold">
          {copy.pub.screen.pause}
        </p>
      ) : null}
    </div>
  );
}
