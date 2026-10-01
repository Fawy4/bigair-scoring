import type { DivisionDraw, Entrant, EntrantIdentifiers, HeatStatus, IdentificationSchemeId } from "@/lib/engine/ladder";
import type { IdentificationScheme } from "@/lib/schemas/identification";

/** An entry of the Riders step as the draw needs it. */
export interface EntryInput {
  id: string;
  seed: number | null;
  status: string;
  name: string;
  identifiers?: EntrantIdentifiers | null;
  createdAt?: string;
}

/** The Riders step keeps a kite even without a brand; the engine needs the brand to tell two kites apart, so such a kite is left out. */
export function toEntrantIdentifiers(i: { vest_colour?: string; bib?: string | number; kite?: { brand?: string; model?: string; size?: string | number; colours?: string }; rashguard_colour?: string } | null | undefined): EntrantIdentifiers {
  const out: EntrantIdentifiers = {};
  if (!i) return out;
  if (i.vest_colour) out.vest_colour = i.vest_colour;
  if (i.bib !== undefined && i.bib !== "") out.bib = i.bib;
  if (i.rashguard_colour) out.rashguard_colour = i.rashguard_colour;
  if (i.kite?.brand) out.kite = { brand: i.kite.brand, ...(i.kite.model ? { model: i.kite.model } : {}), ...(i.kite.size !== undefined && i.kite.size !== "" ? { size: i.kite.size } : {}), ...(i.kite.colours ? { colours: i.kite.colours } : {}) };
  return out;
}

const ENGINE_SCHEMES: IdentificationSchemeId[] = ["name-callout", "vests-per-heat", "fixed-lycra-per-rider", "bib-numbers", "kites-no-vests", "brand-launch-same-kites"];

/** The engine knows six schemes by id; an organisation's own scheme maps to the one that behaves like it. */
export function engineSchemeId(scheme: Pick<IdentificationScheme, "id" | "primary" | "vestAssignment">): IdentificationSchemeId {
  if ((ENGINE_SCHEMES as string[]).includes(scheme.id)) return scheme.id as IdentificationSchemeId;
  if (scheme.vestAssignment === "per_heat_slot") return "vests-per-heat";
  if (scheme.vestAssignment === "fixed_per_rider") return "fixed-lycra-per-rider";
  if (scheme.primary === "bib_number") return "bib-numbers";
  if (scheme.primary === "kite") return "kites-no-vests";
  return "name-callout";
}

/** Only confirmed riders take part: registered, withdrawn and no-show riders are left out. In seed order, then in the order they were entered. */
export function confirmedEntrants(entries: readonly EntryInput[]): Entrant[] {
  return [...entries]
    .filter((e) => e.status === "confirmed")
    .sort((a, b) => (a.seed ?? Number.MAX_SAFE_INTEGER) - (b.seed ?? Number.MAX_SAFE_INTEGER) || (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id))
    .map((e) => ({ id: e.id, name: e.name, ...(e.identifiers && Object.keys(e.identifiers).length ? { identifiers: e.identifiers } : {}) }));
}

/**
 * Brings the riders of a stored draw in line with the Riders step without changing any seat: riders confirmed since the draw are added
 * (so they can be placed by hand, and the check says they have no heat), and riders who are no longer confirmed are flagged as withdrawn.
 */
export function syncEntrants(draw: DivisionDraw, entries: readonly EntryInput[]): DivisionDraw {
  const next = structuredClone(draw);
  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const e of entries) {
    if (e.status === "confirmed" && !next.entrants.some((x) => x.id === e.id)) {
      next.entrants.push({ id: e.id, name: e.name, ...(e.identifiers && Object.keys(e.identifiers).length ? { identifiers: e.identifiers } : {}) });
      next.seedOrder.push(e.id);
    }
  }
  next.entrants = next.entrants.map((x) => {
    const e = byId.get(x.id);
    const withdrawn = e ? e.status !== "confirmed" : true;
    return { ...x, ...(e ? { name: e.name } : {}), withdrawn };
  });
  return next;
}

/** heats.status in the database → the engine's three states. Only "scheduled" has not started. */
export function heatStatusFromDb(status: string): HeatStatus {
  if (status === "scheduled" || status === "cancelled") return "pending";
  if (status === "published") return "published";
  return "running";
}

/** Sets every heat's status from the stored heat rows (matched by the heat's draw id), the truth about what has started. */
export function applyHeatStatuses(draw: DivisionDraw, rows: ReadonlyArray<{ draw_uid: string | null; status: string; started_at?: string | null }>): DivisionDraw {
  const next = structuredClone(draw);
  const byUid = new Map(rows.flatMap((r) => (r.draw_uid ? [[r.draw_uid, r] as const] : [])));
  for (const round of next.rounds) {
    for (const heat of round.heats) {
      const row = byUid.get(heat.uid ?? heat.id);
      if (!row) continue;
      heat.status = row.started_at && row.status === "scheduled" ? "running" : heatStatusFromDb(row.status);
    }
  }
  return next;
}
