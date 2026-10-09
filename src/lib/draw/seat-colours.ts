import type { DivisionDraw } from "@/lib/engine/ladder";
import { vestColourFor } from "@/lib/engine/ladder/build";
import type { IdentificationScheme } from "@/lib/schemas/identification";
import { copy } from "@/lib/ui-copy";

/** The event's (or the division's own) lycra colours as keys, in the organiser's order: seat 1 gets the first. */
export const colourKeys = (scheme: Pick<IdentificationScheme, "palette">): string[] => scheme.palette.map((c) => c.key);

/** Does this scheme hand out a different lycra colour per seat of a heat? */
export const dealsSeatColours = (scheme: Pick<IdentificationScheme, "primary" | "fallbackPrimary" | "secondary" | "vestAssignment">): boolean =>
  scheme.vestAssignment === "per_heat_slot" && [scheme.primary, scheme.fallbackPrimary, ...scheme.secondary].includes("vest_colour");

/** The most riders any heat of the draw holds (byes and finals included). */
export const biggestHeat = (draw: DivisionDraw): number => Math.max(0, ...draw.rounds.flatMap((r) => r.heats.map((h) => h.slots.length)));

/** The plain sentence when the list has fewer colours than the biggest heat, otherwise null. */
export function coloursRefusal(scheme: IdentificationScheme, biggest: number): string | null {
  if (!dealsSeatColours(scheme) || biggest <= scheme.palette.length) return null;
  return copy.draw.seatColours.tooFew(biggest);
}

/**
 * Deals the event's list onto a stored draw: the list is remembered in the draw and every seat of a heat that has not started
 * takes the colour of its seat number. Started and finished heats keep what they were played with.
 */
export function recolour(draw: DivisionDraw, keys: string[]): DivisionDraw {
  const next = structuredClone(draw);
  next.overrides.vestColours = keys;
  for (const round of next.rounds) {
    for (const heat of round.heats) {
      if (heat.status !== "pending") continue;
      heat.slots = heat.slots.map((s, i) => {
        const c = vestColourFor(next, i);
        const out = { ...s };
        if (c) out.vestColour = c;
        else delete out.vestColour;
        return out;
      });
    }
  }
  return next;
}

/** True when a seat of a heat that has not started wears a colour other than the one its seat number has in the list (a draw made before the list changed). */
export function staleColours(draw: DivisionDraw, scheme: IdentificationScheme): boolean {
  if (!dealsSeatColours(scheme)) return false;
  const keys = colourKeys(scheme);
  return draw.rounds.some((r) => r.heats.some((h) => h.status === "pending" && h.slots.some((s, i) => s.vestColour !== undefined && s.vestColour !== keys[i % keys.length])));
}
