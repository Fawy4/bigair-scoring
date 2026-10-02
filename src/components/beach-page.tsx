"use client";

import type { ReactNode } from "react";
import { useBeachTheme } from "@/components/live/theme-switch";
import { cn } from "@/lib/utils";

/** A whole page in the design system, Daylight or Dark as the visitor chose on this device. */
export function BeachPage({ children, testId, className }: { children: ReactNode; testId?: string; className?: string }) {
  const [theme] = useBeachTheme();
  return (
    <div data-testid={testId} className={cn("beach-text-normal min-h-screen bg-beach-bg text-beach-ink", theme === "dark" ? "beach-dark" : "beach-day", className)}>
      {children}
    </div>
  );
}
