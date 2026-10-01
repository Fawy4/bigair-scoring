"use client";

import { useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { TextSizeSwitch, ThemeSwitch, useBeachTextSize, useBeachTheme } from "@/components/live/theme-switch";
import type { ArrowScheme } from "@/lib/live/arrow-loader";
import { BEACH_THEMES } from "@/lib/live/theme-tokens";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";
import { DesignSections, SECTION_IDS } from "./design-sections";

/** The /design page: a sticky Daylight / Dark switch and a "Jump to…" menu, then every part the official screens will use. Nothing is saved or live. */
export function DesignPreview({ arrow }: { arrow: ArrowScheme | null }) {
  const [theme, setTheme] = useBeachTheme();
  const [textSize, setTextSize] = useBeachTextSize();
  const menu = useRef<HTMLDetailsElement>(null);

  // the page behind the themed area (overscroll, notch) follows the theme too
  useEffect(() => {
    const bg = theme === "dark" ? BEACH_THEMES.dark.bg : BEACH_THEMES.day.bg;
    const prev = document.documentElement.style.backgroundColor;
    document.documentElement.style.backgroundColor = bg;
    return () => {
      document.documentElement.style.backgroundColor = prev;
    };
  }, [theme]);

  return (
    <div id="top" data-testid="design-root" data-theme={theme} data-text={textSize} className={cn(theme === "dark" ? "beach-dark" : "beach-day", textSize === "large" ? "beach-text-large" : "beach-text-normal", "min-h-screen")}>
      <header className="beach-text-normal sticky top-0 z-30 border-b border-beach-line bg-beach-bg">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-1.5 px-2 py-1.5">
          <ThemeSwitch theme={theme} onChange={setTheme} />
          <TextSizeSwitch size={textSize} onChange={setTextSize} />
          <details ref={menu} className="relative" data-testid="design-menu">
            <summary className="inline-flex min-h-tap cursor-pointer list-none items-center gap-1 whitespace-nowrap rounded-xl border border-beach-border bg-beach-bg px-2.5 text-[13px] font-semibold text-beach-ink [&::-webkit-details-marker]:hidden">
              {copy.design.menu}
              <ChevronDown aria-hidden className="size-4" />
            </summary>
            <nav aria-label={copy.design.menuLabel} className="absolute right-0 mt-2 max-h-[70dvh] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-card border border-beach-border bg-beach-bg p-2">
              <ul className="flex flex-col">
                {SECTION_IDS.map((id) => (
                  <li key={id}>
                    <a href={`#${id}`} onClick={() => menu.current?.removeAttribute("open")} className="flex min-h-tap items-center rounded-lg px-3 text-body font-semibold text-beach-ink hover:bg-beach-surface">
                      {copy.design.sections[id]}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </details>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-3 pb-24 pt-4">
        <div>
          <h1 data-testid="not-live" className="rounded-card border border-beach-line bg-beach-surface p-3 text-digit font-semibold leading-tight">
            {copy.design.notLive}
          </h1>
          <p className="mt-3 text-body font-medium">{copy.design.intro}</p>
          <p className="mt-1 text-small font-medium text-beach-muted">{copy.design.settingsNote}</p>
        </div>
        <DesignSections arrow={arrow} />
        <a href="#top" className="flex min-h-tap items-center justify-center rounded-xl border border-beach-border text-body font-semibold underline">
          {copy.design.backToTop}
        </a>
      </main>
    </div>
  );
}
