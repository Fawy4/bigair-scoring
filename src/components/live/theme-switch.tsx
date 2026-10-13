"use client";

import { useEffect, useState } from "react";
import { copy } from "@/lib/ui-copy";
import { PillSwitch } from "./chip";

export type BeachTheme = "day" | "dark";
export type BeachTextSize = "normal" | "large";

/** A per-device choice kept in localStorage inside try/catch (private windows can refuse it); the first value is the default. */
function useDeviceChoice<T extends string>(key: string, allowed: readonly T[]): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(allowed[0]);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved && (allowed as readonly string[]).includes(saved)) setValue(saved as T);
    } catch {
      /* storage not available: stay on the default */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once on the first paint
  }, []);
  const choose = (v: T) => {
    setValue(v);
    try {
      window.localStorage.setItem(key, v);
    } catch {
      /* not saved; still works until the page closes */
    }
  };
  return [value, choose];
}

export const useBeachTheme = () => useDeviceChoice<BeachTheme>("bigair.beach-theme", ["day", "dark"]);
export const useBeachTextSize = () => useDeviceChoice<BeachTextSize>("bigair.beach-text", ["normal", "large"]);

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return <PillSwitch label={label} value={value} options={options.map(([key, text]) => ({ key, text }))} onChange={onChange} />;
}

/** Daylight / Dark. */
export function ThemeSwitch({ theme, onChange }: { theme: BeachTheme; onChange: (t: BeachTheme) => void }) {
  return (
    <Segmented
      label={copy.design.themeLabel}
      value={theme}
      options={[
        ["day", copy.design.day],
        ["dark", copy.design.dark],
      ]}
      onChange={onChange}
    />
  );
}

/** Normal / Large text, next to the theme switch. */
export function TextSizeSwitch({ size, onChange }: { size: BeachTextSize; onChange: (s: BeachTextSize) => void }) {
  return (
    <Segmented
      label={copy.design.textSizeLabel}
      value={size}
      options={[
        ["normal", copy.design.textNormal],
        ["large", copy.design.textLarge],
      ]}
      onChange={onChange}
    />
  );
}
