"use client";

import { useBeachTextSize, useBeachTheme } from "@/components/live/theme-switch";

/**
 * The classes that carry this device's Daylight / Dark and Normal / Large choice, for things that open outside the themed page area
 * (a dialog, a toast, the floating Note button): they are added to the portal's own element, so nothing opens white on a dark page.
 */
export function useThemeScope(): string {
  const [theme] = useBeachTheme();
  const [size] = useBeachTextSize();
  return `${theme === "dark" ? "beach-dark" : "beach-day"} ${size === "large" ? "beach-text-large" : "beach-text-normal"}`;
}
