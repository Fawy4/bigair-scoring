import { defaultScheme, type IdentificationScheme } from "@/lib/schemas/identification";
import { copy } from "@/lib/ui-copy";
import { riderLabelModel, type LabelModel, type LabelRider } from "./rider-label";

/**
 * The scheme a division really uses: its own when the event allows per-division schemes and the division has one,
 * otherwise the event's. Every screen after the Divisions step asks this one function.
 */
export function effectiveScheme(
  event: { scheme: IdentificationScheme; allowDivisionOverride: boolean } | null,
  division: { scheme: IdentificationScheme } | null,
): IdentificationScheme {
  if (event && event.allowDivisionOverride && division?.scheme) return division.scheme;
  return event?.scheme ?? defaultScheme();
}

/**
 * The Rider label as the Riders table shows it. Before the draw a scheme that hands out a lycra colour per heat has no colour yet,
 * so the table says so instead of showing "not set".
 */
export function tableLabel(scheme: IdentificationScheme, rider: LabelRider): LabelModel {
  const model = riderLabelModel(scheme, rider);
  if (scheme.vestAssignment === "per_heat_slot" && scheme.primary === "vest_colour") {
    return { ...model, primary: { kind: "none", text: copy.riders.lycraAtDraw, outlined: true, ink: "#111111", usedFallback: false } };
  }
  return model;
}
