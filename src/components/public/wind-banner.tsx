import { Wind } from "lucide-react";
import type { PublicSite } from "@/lib/public/types";
import { copy } from "@/lib/ui-copy";

const STYLE: Record<string, { bg: string; fg: string }> = {
  red: { bg: "#991b1b", fg: "#ffffff" },
  amber: { bg: "#fcd34d", fg: "#111111" },
  green: { bg: "#14532d", fg: "#ffffff" },
};

/** The wind call, red / amber / green with its word and the message; set by the head judge or the organiser. Not shown when there is no call. */
export function WindBanner({ wind, big = false }: { wind: PublicSite["wind"]; big?: boolean }) {
  if (!wind) return null;
  const s = STYLE[wind.status] ?? STYLE.amber;
  return (
    <div data-testid="wind-banner" data-status={wind.status} role="status" style={{ backgroundColor: s.bg, color: s.fg }} className={big ? "flex items-center gap-4 px-8 py-4 text-4xl font-semibold" : "flex items-center gap-2 rounded-card px-3 py-2 text-name font-semibold"}>
      <Wind aria-hidden className={big ? "size-10 shrink-0" : "size-5 shrink-0"} />
      <span>
        {copy.pub.wind.label}: {copy.pub.wind.states[wind.status]}
        {wind.message ? ` — ${wind.message}` : ""}
      </span>
    </div>
  );
}
