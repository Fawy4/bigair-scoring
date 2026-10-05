import { Wind } from "lucide-react";
import type { PublicSite } from "@/lib/public/types";
import { copy } from "@/lib/ui-copy";

const STYLE: Record<string, { bg: string; fg: string }> = {
  red: { bg: "#991b1b", fg: "#ffffff" },
  amber: { bg: "#fcd34d", fg: "#111111" },
  green: { bg: "#14532d", fg: "#ffffff" },
};

/**
 * The wind call, drawn in its colour (red / amber / green) and reading "Wind Call: ‹message›": the head judge's or organiser's own words, not the name of the colour or a
 * stop / caution / go word. With no message it reads "Wind Call". On the big screens it is the first thing at the top. Not shown when there is no call.
 */
export function WindBanner({ wind, big = false }: { wind: PublicSite["wind"]; big?: boolean }) {
  if (!wind) return null;
  const s = STYLE[wind.status] ?? STYLE.amber;
  return (
    <div data-testid="wind-banner" data-status={wind.status} role="status" style={{ backgroundColor: s.bg, color: s.fg }} className={big ? "mb-[1vw] flex items-center gap-4 px-8 py-4 text-4xl font-semibold" : "flex items-center gap-2 rounded-card px-3 py-2 text-name font-semibold"}>
      <Wind aria-hidden className={big ? "size-10 shrink-0" : "size-5 shrink-0"} />
      <span>
        {copy.pub.wind.label}
        {wind.message ? `: ${wind.message}` : ""}
      </span>
    </div>
  );
}
