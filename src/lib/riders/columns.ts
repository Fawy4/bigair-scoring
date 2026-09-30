import type { IdentificationScheme } from "@/lib/schemas/identification";

export interface IdentifierColumns {
  lycra: boolean;
  bib: boolean;
  kite: Array<"brand" | "model" | "size" | "colours">;
  rashguard: boolean;
  helmet: boolean;
  photo: boolean;
}

/** Which identifier cells the Riders table shows for a scheme (the rest are behind "Show every identifier column"). */
export function identifierColumns(scheme: IdentificationScheme, showAll = false): IdentifierColumns {
  if (showAll) return { lycra: true, bib: true, kite: ["brand", "model", "size", "colours"], rashguard: true, helmet: true, photo: true };
  const used = new Set<string>([scheme.primary, ...(scheme.fallbackPrimary ? [scheme.fallbackPrimary] : []), ...scheme.secondary]);
  const kiteWanted = used.has("kite") || used.has("kite_size_colour") || scheme.kiteFields.length > 0;
  const kite = kiteWanted ? (scheme.kiteFields.length ? [...scheme.kiteFields] : (["size", "colours"] as const satisfies readonly IdentifierColumns["kite"][number][])) : [];
  return {
    lycra: scheme.vestAssignment === "fixed_per_rider" && used.has("vest_colour"),
    bib: used.has("bib_number") || scheme.bibNumbering !== "none",
    kite: [...kite],
    rashguard: used.has("rashguard_colour"),
    helmet: used.has("helmet_colour"),
    photo: used.has("photo"),
  };
}
