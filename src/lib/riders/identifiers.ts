/** What an entry stores about how a rider is recognised (docs/05 `entries.identifiers`). */
export interface Identifiers {
  vest_colour?: string;
  bib?: string | number;
  kite?: { brand?: string; model?: string; size?: string | number; colours?: string };
  rashguard_colour?: string;
  helmet_colour?: string;
}

const text = (v: unknown): string | undefined => {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  return s === "" ? undefined : s;
};

/** Drops empty values so a cleared cell really clears the identifier, and keeps only the keys we know. */
export function cleanIdentifiers(input: unknown): Identifiers {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: Identifiers = {};
  const vest = text(i.vest_colour);
  const bib = text(i.bib);
  const rash = text(i.rashguard_colour);
  const helmet = text(i.helmet_colour);
  if (vest) out.vest_colour = vest;
  if (bib) out.bib = bib;
  if (rash) out.rashguard_colour = rash;
  if (helmet) out.helmet_colour = helmet;
  const k = (i.kite && typeof i.kite === "object" ? i.kite : {}) as Record<string, unknown>;
  const kite: NonNullable<Identifiers["kite"]> = {};
  for (const key of ["brand", "model", "size", "colours"] as const) {
    const v = text(k[key]);
    if (v) kite[key] = v;
  }
  if (Object.keys(kite).length) out.kite = kite;
  return out;
}

/** One identifier changed in the table: returns the new identifiers without touching the rest. */
export function withIdentifier(current: Identifiers, field: "vest_colour" | "bib" | "rashguard_colour" | "helmet_colour" | "kiteBrand" | "kiteModel" | "kiteSize" | "kiteColours", value: string): Identifiers {
  const next: Record<string, unknown> = { ...current, kite: { ...(current.kite ?? {}) } };
  if (field.startsWith("kite")) (next.kite as Record<string, string>)[field.slice(4).toLowerCase()] = value;
  else next[field] = value;
  return cleanIdentifiers(next);
}
