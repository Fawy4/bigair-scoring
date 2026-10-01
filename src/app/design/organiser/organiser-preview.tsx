"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { MenuItem, Popover } from "@/components/org/popover";
import { Segmented } from "@/components/org/setting-controls";
import { useBeachTextSize, useBeachTheme } from "@/components/live/theme-switch";
import { BEACH_THEMES } from "@/lib/live/theme-tokens";
import { orgCopy } from "@/lib/org-design/copy";
import { cn } from "@/lib/utils";
import { PreviewSections, SECTION_IDS, type FrameKind } from "./sections";
import "@/components/org/org-tokens.css";

/** The /design/organiser page: a sticky bar (Daylight / Dark, Normal / Large, Laptop / Phone, a jump menu), then every part of the organiser look. Nothing is saved or live. */
export function OrganiserPreview() {
  const [theme, setTheme] = useBeachTheme();
  const [size, setSize] = useBeachTextSize();
  const [frame, setFrame] = useState<FrameKind>("laptop");

  // a narrow screen starts on the Phone frame; the choice is the visitor's after that
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("bigair.org-frame");
      if (saved === "laptop" || saved === "phone") return setFrame(saved);
    } catch {
      /* storage not available */
    }
    if (window.innerWidth < 768) setFrame("phone");
  }, []);
  const chooseFrame = (f: FrameKind) => {
    setFrame(f);
    try {
      window.localStorage.setItem("bigair.org-frame", f);
    } catch {
      /* not saved */
    }
  };

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
    <div id="top" data-testid="design-root" data-theme={theme} data-text={size} className={cn("org-ui min-h-screen md:[--org-sticky-top:64px]", theme === "dark" ? "beach-dark" : "beach-day", size === "large" ? "beach-text-large" : "beach-text-normal")}>
      <header data-testid="preview-bar" className="z-30 border-b border-beach-line bg-beach-bg md:sticky md:top-0">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented label={orgCopy.page.theme} value={theme} onChange={setTheme} options={[["day", orgCopy.page.day], ["dark", orgCopy.page.dark]]} />
            <Segmented label={orgCopy.page.textSize} value={size} onChange={setSize} options={[["normal", orgCopy.page.normal], ["large", orgCopy.page.large]]} />
            <Segmented label={orgCopy.page.frame} value={frame} onChange={chooseFrame} options={[["laptop", orgCopy.page.laptop], ["phone", orgCopy.page.phone]]} />
          </div>
          <Popover label={orgCopy.page.menu} ariaLabel={orgCopy.page.menuLabel} icon={Menu} align="end" panelRole="menu" testId="design-menu" panelClassName="max-h-[70dvh] overflow-y-auto">
            {(close) =>
              SECTION_IDS.map((id) => (
                <MenuItem key={id} href={`#${id}`} onClick={close}>
                  {orgCopy.page.sections[id]}
                </MenuItem>
              ))
            }
          </Popover>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1440px] flex-col gap-8 px-4 pb-16 pt-4">
        <div className="flex flex-col gap-1">
          <h1 data-testid="not-live" className="text-[20px] font-semibold leading-tight">
            {orgCopy.page.notLive}
          </h1>
          <p className="max-w-[80ch] text-body font-medium text-beach-muted">{orgCopy.page.intro}</p>
          <p className="max-w-[80ch] text-small font-medium text-beach-muted">{orgCopy.page.sizesNote}</p>
          <p className="max-w-[80ch] text-small font-medium text-beach-muted">{orgCopy.page.note}</p>
        </div>
        <PreviewSections frame={frame} prefs={{ theme, setTheme, size, setSize }} />
        <a href="#top" className="flex min-h-[var(--org-ctl)] items-center justify-center rounded-[8px] border border-beach-border text-body font-semibold underline">
          {orgCopy.page.backToTop}
        </a>
      </main>
    </div>
  );
}
