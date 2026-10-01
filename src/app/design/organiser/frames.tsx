"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A laptop-sized page. It is drawn at the width of the page (1024 to 1440 px) and is not scaled, so the sizes you see are the real sizes.
 * Only when the screen is narrower than 1024 px (a phone with the Laptop frame chosen) is it drawn at 1024 and shrunk to fit, so nothing scrolls sideways.
 */
export function LaptopFrame({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [m, setM] = useState({ width: 0, scale: 1, height: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const available = outer.current?.clientWidth ?? 0;
      const width = Math.max(1024, Math.min(available, 1440));
      const next = { width, scale: available > 0 ? Math.min(1, available / width) : 1, height: inner.current?.offsetHeight ?? 0 };
      setM((prev) => (prev.width === next.width && prev.scale === next.scale && prev.height === next.height ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (outer.current) observer.observe(outer.current);
    if (inner.current) observer.observe(inner.current);
    return () => observer.disconnect();
  }, []);
  const shrunk = m.scale < 1;
  return (
    <div ref={outer} data-testid="laptop-frame" className="overflow-x-clip rounded-card border border-beach-line bg-beach-bg" style={shrunk ? { height: m.height * m.scale } : undefined}>
      <div ref={inner} style={shrunk ? { width: m.width, transform: `scale(${m.scale})`, transformOrigin: "top left" } : { width: m.width || undefined, maxWidth: "100%", marginInline: "auto" }}>
        {children}
      </div>
    </div>
  );
}

/**
 * A phone-shaped box. On a computer it is 390 × 844 and measures like a touch screen (44 px controls); on a phone it fills the display.
 * `data-testid="screen-body"` is the part that scrolls, so a sticky header or footer can be seen to stay put.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div
      data-testid="phone-frame"
      style={{ "--org-sticky-top": "0px" } as React.CSSProperties}
      className={cn("org-touch relative mx-auto flex w-full flex-col overflow-hidden border border-beach-line bg-beach-bg", "h-[calc(100dvh-24px)] rounded-card md:h-[844px] md:w-[390px] md:rounded-[36px] md:border-[6px] md:border-beach-ink")}
    >
      <div data-testid="screen-body" className="min-h-0 flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
