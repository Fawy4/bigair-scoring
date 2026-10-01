"use client";

import { useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { ThemeSwitch, useBeachTheme } from "@/components/live/theme-switch";
import type { ArrowScheme } from "@/lib/live/arrow-loader";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";
import { DesignSections, SECTION_IDS } from "./design-sections";

/** The /design page: a sticky Daylight / Dark switch and a "Jump to…" menu, then every part the official screens will use. Nothing is saved or live. */
export function DesignPreview({ arrow }: { arrow: ArrowScheme | null }) {
  const [theme, setTheme] = useBeachTheme();
  const menu = useRef<HTMLDetailsElement>(null);

  // the page behind the themed area (overscroll, notch) follows the theme too
  useEffect(() => {
    const bg = theme === "dark" ? "#0a0a0a" : "#ffffff";
    const prev = document.documentElement.style.backgroundColor;
    document.documentElement.style.backgroundColor = bg;
    return () => {
      document.documentElement.style.backgroundColor = prev;
    };
  }, [theme]);

  return (
    <div id="top" data-testid="design-root" data-theme={theme} className={cn(theme === "dark" ? "beach-dark" : "beach-day", "min-h-screen")}>
      <header className="sticky top-0 z-30 border-b-2 border-beach-border bg-beach-bg">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-3 py-2">
          <ThemeSwitch theme={theme} onChange={setTheme} />
          <details ref={menu} className="relative" data-testid="design-menu">
            <summary className="inline-flex min-h-tap cursor-pointer list-none items-center gap-2 whitespace-nowrap rounded-lg border-2 border-beach-border bg-beach-bg px-4 text-lg font-extrabold text-beach-ink [&::-webkit-details-marker]:hidden">
              {copy.design.menu}
              <ChevronDown aria-hidden className="size-5" />
            </summary>
            <nav aria-label={copy.design.menuLabel} className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-1.5rem))] rounded-lg border-4 border-beach-border bg-beach-bg p-2">
              <ul className="flex flex-col">
                {SECTION_IDS.map((id) => (
                  <li key={id}>
                    <a href={`#${id}`} onClick={() => menu.current?.removeAttribute("open")} className="flex min-h-tap items-center rounded-md px-3 text-lg font-bold text-beach-ink underline hover:bg-beach-surface">
                      {copy.design.sections[id]}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </details>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-10 px-3 pb-24 pt-4">
        <div>
          <h1 data-testid="not-live" className="rounded-lg border-4 border-beach-border bg-beach-surface p-3 text-3xl font-extrabold leading-tight">
            {copy.design.notLive}
          </h1>
          <p className="mt-3 text-xl font-semibold">{copy.design.intro}</p>
          <p className="mt-1 text-lg font-bold text-beach-muted">{copy.design.themeNote}</p>
        </div>
        <DesignSections arrow={arrow} />
        <a href="#top" className="flex min-h-tap items-center justify-center rounded-lg border-2 border-beach-border text-lg font-extrabold underline">
          {copy.design.backToTop}
        </a>
      </main>
    </div>
  );
}
