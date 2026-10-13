"use client";

import { useEffect } from "react";
import { ThemeSwitch, useBeachTheme } from "@/components/live/theme-switch";

/**
 * The front door opens in Daylight like every other page. This is the same Daylight / Dark choice as the officials' screens (kept on this device): it sets the front door's own theme
 * and the page behind it.
 */
export function HomeTheme() {
  const [theme, setTheme] = useBeachTheme();
  useEffect(() => {
    document.querySelector(".home")?.setAttribute("data-theme", theme);
  }, [theme]);
  return (
    <div className={`home-theme ${theme === "dark" ? "beach-dark" : "beach-day"} beach-text-normal`} data-testid="home-theme">
      <ThemeSwitch theme={theme} onChange={setTheme} />
    </div>
  );
}
