import { contrastRatio } from "./theme-tokens";
import { bestInk } from "@/lib/identification/label-style";

/** The word on a rider's bar must read at this contrast or better (beach readability: 7:1). */
export const BAR_WORD_CONTRAST = 7;

export interface RiderBarStyle {
  /** The bar's own colour: the rider's Lycra. */
  fill: string;
  /** The colour word's ink and what is directly behind it: the fill itself, or a plain black/white plate when the fill is too middling for 7:1. */
  wordInk: string;
  wordBg: string;
  plate: boolean;
}

/** How a rider's selectable bar is drawn from their Lycra colour: filled in it, the colour word in an ink that reads at 7:1 (on a plate when the fill alone cannot give that). */
export function riderBarStyle(hex: string): RiderBarStyle {
  const ink = bestInk(hex);
  if (contrastRatio(ink, hex) >= BAR_WORD_CONTRAST) return { fill: hex, wordInk: ink, wordBg: hex, plate: false };
  // a plate of the opposite extreme under the word; a fill that is itself close to the plate colour gets the other one
  const plateBg = contrastRatio("#111111", hex) >= 3 ? "#111111" : "#ffffff";
  return { fill: hex, wordInk: plateBg === "#111111" ? "#ffffff" : "#111111", wordBg: plateBg, plate: true };
}
