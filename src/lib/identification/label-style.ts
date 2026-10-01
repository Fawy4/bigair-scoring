import type { IdentificationScheme } from "@/lib/schemas/identification";
import { contrastRatio } from "@/lib/live/theme-tokens";

/**
 * How the Rider label looks follows the identification scheme; there is no manual switch (owner, round 3).
 * - colour-block: Lycra, rash guard or helmet colour is the main identifier: the colour word in a block of that colour, the name beside it.
 * - number-block: a bib number (or a kite) is the main identifier: that text in a neutral block, the name beside it.
 * - name-first: the name is the main identifier (name call-out, photo): the name first, no block.
 */
export type LabelStyle = "colour-block" | "number-block" | "name-first";

export function labelStyleFor(scheme: Pick<IdentificationScheme, "primary">): LabelStyle {
  switch (scheme.primary) {
    case "vest_colour":
    case "rashguard_colour":
    case "helmet_colour":
      return "colour-block";
    case "bib_number":
    case "kite":
      return "number-block";
    default:
      return "name-first";
  }
}

/** Black or white, whichever reads better on a Lycra colour. (The older threshold gave white on green and orange at 3.3:1 and 2.8:1.) */
export function bestInk(hex: string): "#111111" | "#ffffff" {
  return contrastRatio("#111111", hex) >= contrastRatio("#ffffff", hex) ? "#111111" : "#ffffff";
}

/** The style of an already worked-out label, from which identifier is its main one. */
export function labelStyleOfPrimary(p: { source?: string; kind: string }): LabelStyle {
  if (p.source === "vest_colour" || p.source === "rashguard_colour" || p.source === "helmet_colour") return "colour-block";
  if (p.source === "bib_number" || p.source === "kite") return "number-block";
  return "name-first";
}
