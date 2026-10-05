import { copy } from "@/lib/ui-copy";

/**
 * The words of the wind-call banner. With a message: "Wind Call: ‹message›" (the head judge's or organiser's own words, alone). Without one: "Wind Call: Stop" / "Hold" /
 * "LETS GO!" for red / amber / green, so the banner never depends on its colour alone.
 */
export function windCallText(wind: { status: string; message: string | null }): string {
  const message = wind.message?.trim();
  return `${copy.pub.wind.label}: ${message || copy.pub.wind.states[wind.status] || copy.pub.wind.states.amber}`;
}
