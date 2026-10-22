import type { DivisionRules, Placing, ReportAttempt, ReportBlock, ReportContext, ReportData, ReportEntry, ReportHeat, ReportParts, ReportResult, ReportRound } from "./types";

/**
 * Fixed example data for the report tests: made-up riders, a small trick base, a Round 1 (top one goes through) and a Final. Nothing here is a real person or a real event.
 */
export const BLOCKS: ReportBlock[] = [
  { id: "direction:left", family: "direction", key: "left", label: "In", category: null, retired: false },
  { id: "direction:right", family: "direction", key: "right", label: "Out", category: null, retired: false },
  { id: "multiplier:x1", family: "multiplier", key: "x1", label: "×1", category: null, retired: false },
  { id: "multiplier:x2", family: "multiplier", key: "x2", label: "×2", category: null, retired: false },
  { id: "base:backroll", family: "base", key: "backroll", label: "Backroll", category: "rotation", retired: false },
  { id: "base:frontroll", family: "base", key: "frontroll", label: "Frontroll", category: "rotation", retired: false },
  { id: "base:kiteloop", family: "base", key: "kiteloop", label: "Kiteloop", category: "kiteloop", retired: false },
  { id: "base:local_kiteloop", family: "base", key: "local_kiteloop", label: "Kiteloop", category: "kiteloop", retired: true },
  { id: "base:megaloop", family: "base", key: "megaloop", label: "Megaloop", category: "kiteloop", retired: false },
  { id: "base:straight_jump", family: "base", key: "straight_jump", label: "Straight jump", category: "other", retired: false },
  { id: "addon:board_off", family: "addon", key: "board_off", label: "Board-off", category: "board_off", retired: false },
];

export const P = {
  backroll: { items: [{ id: "base:backroll" }] } as ReportParts,
  backroll2BoardOff: { items: [{ id: "base:backroll", multiplier: "x2" }, { id: "addon:board_off" }] } as ReportParts,
  /** the same trick, tapped in the other order and with the multiplier written ×1 where there is none */
  boardOffBackroll2: { items: [{ id: "addon:board_off" }, { id: "base:backroll", multiplier: "x2" }] } as ReportParts,
  kiteloop: { items: [{ id: "base:kiteloop" }] } as ReportParts,
  localKiteloop: { items: [{ id: "base:local_kiteloop" }] } as ReportParts,
  megaloop: { items: [{ id: "base:megaloop" }] } as ReportParts,
  frontroll: { items: [{ id: "base:frontroll" }] } as ReportParts,
  jump: { items: [{ id: "base:straight_jump" }] } as ReportParts,
  typed: (text: string): ReportParts => ({ items: [], freeText: text }),
};

const CAT: Record<string, string> = { backroll: "rotation", backroll2BoardOff: "board_off", boardOffBackroll2: "board_off", kiteloop: "kiteloop", localKiteloop: "kiteloop", megaloop: "kiteloop", frontroll: "rotation", jump: "other" };

/** One attempt. `kind` picks a trick of the example base; `at` is the second of the heat. */
export function att(seq: number, o: Partial<ReportAttempt> & { status?: "landed" | "crashed"; kind?: keyof typeof P | null; at?: number | null; side?: "left" | "right" | null } = {}): ReportAttempt {
  const status = o.status ?? "landed";
  const kind = o.kind === undefined ? "backroll" : o.kind;
  const parts = kind ? ((P as Record<string, ReportParts>)[kind] ?? null) : null;
  return {
    seq,
    status,
    score: status === "landed" ? (o.score === undefined ? 5 : o.score) : null,
    counted: o.counted ?? false,
    ignored: o.ignored ?? null,
    direction: o.side === undefined ? "left" : o.side,
    trick: kind ? `${kind}` : null,
    category: kind ? (CAT[kind] ?? null) : null,
    parts,
    at_sec: o.at === undefined ? seq * 60 : o.at,
    ...(o.parts !== undefined ? { parts: o.parts } : {}),
  };
}

export function res(entry: string, place: number, attempts: ReportAttempt[], o: Partial<ReportResult> & { impression?: number | null } = {}): ReportResult {
  const counted = attempts.filter((a) => a.counted).map((a) => ({ seq: a.seq, score: a.score as number }));
  const tricks = Math.round(counted.reduce((s, c) => s + c.score, 0) * 100) / 100;
  const impression = o.impression === undefined ? 5 : o.impression;
  return { entry_id: entry, place, total: o.total ?? Math.round((tricks + (impression ?? 0)) * 100) / 100, status: "ok", tricks_total: tricks, impression, counted, attempts, ...o };
}

export function heat(number: number, results: ReportResult[], o: Partial<ReportHeat> = {}): ReportHeat {
  return {
    id: `heat-${number}`,
    number,
    suffix: null,
    name: null,
    published_at: "2026-10-19T10:00:00Z",
    started_at: null,
    ended_at: null,
    duration_sec: 600,
    paused_total_sec: 0,
    slots: results.map((r, i) => ({ position: i + 1, entry_id: r.entry_id, modifier: null })),
    results,
    ...o,
  };
}

export function round(id: string, name: string, sort: number, heats: ReportHeat[], advance: ReportRound["advance"]): ReportRound {
  return { id: `round-${id}`, draw_round: id, name, short_name: null, sort_order: sort, advance, heats };
}

export const R1_ADVANCE: ReportRound["advance"] = [{ to: "R2", places: [1] }, { to: "eliminated", places: "rest" }];
export const FINAL_ADVANCE: ReportRound["advance"] = [{ to: "final_placing", places: "rest" }];

export const ENTRIES: ReportEntry[] = ["a:Ana", "b:Ben", "c:Cy", "d:Di", "e:Eli", "f:Flo"].map((s) => {
  const [id, first] = s.split(":");
  return { id, division_id: "div", first_name: first, last_name: "Sample", withdrawn: false, report_withheld: false };
});

export const RULES: DivisionRules = { attemptCap: 7, countedN: 3, impressionName: "Impression" };

export function ctxOf(rounds: ReportRound[], o: { entries?: ReportEntry[]; rules?: Partial<DivisionRules>; placings?: Record<string, Placing>; status?: string; impressionName?: string; sideWords?: { left: string; right: string } } = {}): ReportContext {
  const data: ReportData = {
    allowed: true,
    how: "preview",
    event: { id: "ev", name: "Sample Open", slug: "sample-open", timezone: "Africa/Cairo", status: o.status ?? "live", start_date: "2026-10-19", end_date: "2026-10-19" },
    impression_name: null,
    blocks: BLOCKS,
    divisions: [{ id: "div", name: "Pro", sort_order: 1, rounds }],
    entries: o.entries ?? ENTRIES,
  };
  return { data, sideWords: o.sideWords ?? { left: "In", right: "Out" }, impressionName: o.impressionName ?? "Impression", divisionRules: { div: { ...RULES, ...o.rules } }, placings: o.placings ?? {}, loopCategories: ["kiteloop"] };
}
