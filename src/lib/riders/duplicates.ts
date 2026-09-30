import type { IdentificationScheme } from "@/lib/schemas/identification";
import { copy } from "@/lib/ui-copy";

export interface ClashRider {
  id: string;
  name: string;
  identifiers: {
    vest_colour?: string;
    bib?: string | number;
    kite?: { brand?: string; model?: string; size?: number | string; colours?: string };
    rashguard_colour?: string;
    helmet_colour?: string;
  };
}

export type ClashKind = "lycra" | "bib" | "kite" | "rashguard" | "name";
export interface Clash {
  kind: ClashKind;
  riderIds: string[];
  message: string;
}

type Kite = NonNullable<ClashRider["identifiers"]["kite"]>;

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const colourSet = (s: unknown) => new Set(String(s ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
const sizeOf = (s: unknown) => {
  const n = parseFloat(String(s ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** Two kites a spotter could confuse: same brand and model, sizes within half a metre, and the same colours (any order). */
export function kitesAlike(a: Kite, b: Kite): boolean {
  if (!(norm(a.brand) || norm(a.model)) || !(norm(b.brand) || norm(b.model))) return false;
  if (norm(a.brand) !== norm(b.brand) || norm(a.model) !== norm(b.model)) return false;
  const sa = sizeOf(a.size);
  const sb = sizeOf(b.size);
  if (sa !== null && sb !== null && Math.abs(sa - sb) > 0.5) return false;
  const ca = colourSet(a.colours);
  const cb = colourSet(b.colours);
  if (ca.size !== cb.size) return false;
  return [...ca].every((c) => cb.has(c));
}

const bibKey = (v: string | number | undefined) => {
  const s = String(v ?? "").trim().toLowerCase();
  return /^\d+$/.test(s) ? String(Number(s)) : s;
};

function groupBy(riders: ClashRider[], key: (r: ClashRider) => string): ClashRider[][] {
  const map = new Map<string, ClashRider[]>();
  for (const r of riders) {
    const k = key(r);
    if (!k) continue;
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return [...map.values()].filter((g) => g.length > 1);
}

/**
 * Warnings (never blocks) about riders of one division who share an identifier that has to be unique under the scheme:
 * the same fixed lycra colour, the same bib number, near-identical kites, the same rash guard colour, the same name.
 */
export function findClashes(scheme: IdentificationScheme, riders: ClashRider[]): Clash[] {
  const out: Clash[] = [];
  const names = (g: ClashRider[]) => g.map((r) => r.name).join(", ");
  const label = (key: string | undefined) => scheme.palette.find((c) => c.key === key)?.label ?? key ?? "";
  const ids = (g: ClashRider[]) => g.map((r) => r.id);

  const fixedLycra = scheme.vestAssignment === "fixed_per_rider" && (scheme.primary === "vest_colour" || scheme.secondary.includes("vest_colour"));
  if (fixedLycra) {
    for (const g of groupBy(riders, (r) => r.identifiers.vest_colour ?? "")) {
      out.push({ kind: "lycra", riderIds: ids(g), message: copy.riders.clash.lycra(label(g[0].identifiers.vest_colour), names(g)) });
    }
  }

  if (scheme.primary === "bib_number" || scheme.bibNumbering !== "none" || scheme.secondary.includes("bib_number")) {
    for (const g of groupBy(riders, (r) => bibKey(r.identifiers.bib))) {
      out.push({ kind: "bib", riderIds: ids(g), message: copy.riders.clash.bib(String(g[0].identifiers.bib), names(g)) });
    }
  }

  if (scheme.primary === "kite" || scheme.fallbackPrimary === "kite") {
    const withKite = riders.filter((r) => r.identifiers.kite);
    const used = new Set<string>();
    for (const r of withKite) {
      if (used.has(r.id)) continue;
      const group = withKite.filter((o) => o.id === r.id || (!used.has(o.id) && kitesAlike(r.identifiers.kite!, o.identifiers.kite!)));
      if (group.length > 1) {
        group.forEach((g) => used.add(g.id));
        out.push({ kind: "kite", riderIds: ids(group), message: copy.riders.clash.kite(names(group)) });
      }
    }
  }

  if (scheme.primary === "rashguard_colour") {
    for (const g of groupBy(riders, (r) => r.identifiers.rashguard_colour ?? "")) {
      out.push({ kind: "rashguard", riderIds: ids(g), message: copy.riders.clash.rashguard(label(g[0].identifiers.rashguard_colour), names(g)) });
    }
  }

  if (scheme.primary === "name" || scheme.calloutLabel === "name") {
    for (const g of groupBy(riders, (r) => norm(r.name))) {
      out.push({ kind: "name", riderIds: ids(g), message: copy.riders.clash.name(g[0].name.trim().replace(/\s+/g, " ")) });
    }
  }
  return out;
}
