"use client";

import { useEffect, useState } from "react";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

export type BeachTheme = "day" | "dark";
const KEY = "bigair.beach-theme";

/** The theme of this device: Daylight unless the person chose Dark. Stored in localStorage inside try/catch (private windows can refuse it). */
export function useBeachTheme(): [BeachTheme, (t: BeachTheme) => void] {
  const [theme, setTheme] = useState<BeachTheme>("day");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY);
      if (saved === "day" || saved === "dark") setTheme(saved);
    } catch {
      /* storage not available: stay on Daylight */
    }
  }, []);
  const choose = (t: BeachTheme) => {
    setTheme(t);
    try {
      window.localStorage.setItem(KEY, t);
    } catch {
      /* not saved; still works until the page closes */
    }
  };
  return [theme, choose];
}

/** Daylight / Dark. Two big buttons, the chosen one filled and marked "pressed"; the word is always there. */
export function ThemeSwitch({ theme, onChange }: { theme: BeachTheme; onChange: (t: BeachTheme) => void }) {
  const options: Array<[BeachTheme, string]> = [
    ["day", copy.design.day],
    ["dark", copy.design.dark],
  ];
  return (
    <div role="group" aria-label={copy.design.themeLabel} className="inline-flex overflow-hidden rounded-lg border-2 border-beach-border">
      {options.map(([value, text]) => (
        <button
          key={value}
          type="button"
          aria-pressed={theme === value}
          onClick={() => onChange(value)}
          className={cn("min-h-tap min-w-[5.5rem] px-4 text-lg font-extrabold", theme === value ? "bg-beach-selected text-beach-on-selected" : "bg-beach-bg text-beach-ink")}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
