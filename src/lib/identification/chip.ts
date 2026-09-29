import type { IdentificationScheme, PaletteColour } from "@/lib/schemas/identification";

/** What we know about one rider when a chip is drawn. Identifiers follow docs/05 `entries.identifiers`. */
export interface ChipRider {
  name: string;
  nationality?: string | null;
  sponsor?: string | null;
  photoUrl?: string | null;
  /** Palette key of the vest for THIS heat's slot (vestAssignment = per_heat_slot). */
  slotColour?: string | null;
  identifiers?: {
    vest_colour?: string;
    bib?: string | number;
    kite?: { brand?: string; model?: string; size?: number | string; colours?: string };
    rashguard_colour?: string;
    helmet_colour?: string;
  };
}

export interface ChipPrimary {
  kind: "colour" | "text" | "photo" | "none";
  /** Always filled: colour names are shown as text too (beach standard 00.5). */
  text: string;
  hex?: string;
  /** White and black (and any very light or very dark colour) get an outline. */
  outlined: boolean;
  /** Text colour that stays readable on `hex`. */
  ink: "#111111" | "#ffffff";
  usedFallback: boolean;
}

export interface ChipModel {
  primary: ChipPrimary;
  secondary: Array<{ key: string; text: string }>;
  /** What the spotter calls out for this rider. */
  callout: string;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function inkFor(hex: string): "#111111" | "#ffffff" {
  return luminance(hex) > 0.35 ? "#111111" : "#ffffff";
}

function colourOf(palette: PaletteColour[], key: string | null | undefined): PaletteColour | null {
  if (!key) return null;
  return palette.find((c) => c.key === key) ?? null;
}

function kiteText(k: NonNullable<ChipRider["identifiers"]>["kite"]): string {
  if (!k) return "";
  const head = [k.brand, k.model, k.size !== undefined && k.size !== "" ? String(k.size) : ""].filter(Boolean).join(" ");
  return [head, k.colours].filter(Boolean).join(" · ");
}

function colourFor(scheme: IdentificationScheme, rider: ChipRider, which: string): PaletteColour | null {
  const ids = rider.identifiers ?? {};
  if (which === "vest_colour") {
    const key = scheme.vestAssignment === "per_heat_slot" ? (rider.slotColour ?? ids.vest_colour) : (ids.vest_colour ?? rider.slotColour);
    return colourOf(scheme.palette, key);
  }
  if (which === "rashguard_colour") return colourOf(scheme.palette, ids.rashguard_colour);
  if (which === "helmet_colour") return colourOf(scheme.palette, ids.helmet_colour);
  return null;
}

function primaryFor(scheme: IdentificationScheme, rider: ChipRider, which: string, usedFallback: boolean): ChipPrimary | null {
  const ids = rider.identifiers ?? {};
  if (which === "vest_colour" || which === "rashguard_colour" || which === "helmet_colour") {
    const c = colourFor(scheme, rider, which);
    if (!c) return null;
    const lum = luminance(c.hex);
    return { kind: "colour", text: c.label.toUpperCase(), hex: c.hex, outlined: lum > 0.8 || lum < 0.02 || /^(white|black)$/i.test(c.label), ink: inkFor(c.hex), usedFallback };
  }
  if (which === "bib_number") {
    if (ids.bib === undefined || ids.bib === "") return null;
    return { kind: "text", text: String(ids.bib), outlined: true, ink: "#111111", usedFallback };
  }
  if (which === "kite") {
    const t = kiteText(ids.kite);
    return t ? { kind: "text", text: t, outlined: true, ink: "#111111", usedFallback } : null;
  }
  if (which === "photo") {
    return rider.photoUrl ? { kind: "photo", text: rider.name, outlined: true, ink: "#111111", usedFallback } : null;
  }
  return null;
}

/** Works out what a rider chip shows for a scheme; the React component only draws this. */
export function chipModel(scheme: IdentificationScheme, rider: ChipRider): ChipModel {
  const primary =
    primaryFor(scheme, rider, scheme.primary, false) ??
    (scheme.fallbackPrimary ? primaryFor(scheme, rider, scheme.fallbackPrimary, true) : null) ?? {
      kind: "none" as const,
      text: "NOT SET",
      outlined: true,
      ink: "#111111" as const,
      usedFallback: false,
    };

  const ids = rider.identifiers ?? {};
  const secondary: ChipModel["secondary"] = [];
  const push = (key: string, text: string | null | undefined) => {
    if (text) secondary.push({ key, text });
  };
  for (const key of scheme.secondary) {
    switch (key) {
      case "name":
        push(key, rider.name);
        break;
      case "nationality":
        push(key, rider.nationality);
        break;
      case "sponsor":
        push(key, rider.sponsor);
        break;
      case "vest_colour":
      case "rashguard_colour":
      case "helmet_colour": {
        const c = colourFor(scheme, rider, key);
        if (c) push(key, `${key === "vest_colour" ? "Vest" : key === "rashguard_colour" ? "Rash guard" : "Helmet"}: ${c.label}`);
        break;
      }
      case "bib_number":
        if (ids.bib !== undefined && ids.bib !== "") push(key, `#${ids.bib}`);
        break;
      case "kite":
        push(key, kiteText(ids.kite));
        break;
      case "kite_size_colour":
        push(key, [ids.kite?.size !== undefined && ids.kite.size !== "" ? `${ids.kite.size} m` : "", ids.kite?.colours].filter(Boolean).join(" · "));
        break;
      case "photo":
        if (rider.photoUrl) push(key, "Photo on file");
        break;
    }
  }
  return { primary, secondary, callout: calloutFor(scheme, rider, primary) };
}

function calloutFor(scheme: IdentificationScheme, rider: ChipRider, primary: ChipPrimary): string {
  const ids = rider.identifiers ?? {};
  if (scheme.calloutLabel === "number") return ids.bib !== undefined && ids.bib !== "" ? String(ids.bib) : primary.text;
  if (scheme.calloutLabel === "kite") {
    const first = ids.kite?.colours?.split(/[\/,]/)[0]?.trim();
    const label = [first, ids.kite?.model ?? ids.kite?.brand].filter(Boolean).join(" ");
    return label || primary.text;
  }
  const c = primary.kind === "colour" ? primary.text : "";
  return c ? c.charAt(0) + c.slice(1).toLowerCase() : primary.text;
}
