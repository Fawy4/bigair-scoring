import { heatLabel, placeholderText, type DivisionDraw, type DrawHeat, type DrawRound } from "@/lib/engine/ladder";
import { riderLabelModel } from "@/lib/identification/rider-label";
import type { IdentificationScheme } from "@/lib/schemas/identification";
import { copy } from "@/lib/ui-copy";

/**
 * The draw on paper, worked out once: the page (HTML for Print / PDF) and the picture (canvas for PNG) both draw from these boxes, so
 * they are the same page. Everything is in `em`; `mmPerEm` scales the whole ladder to fit one A4 landscape page.
 */

/** A4 landscape with 8 mm margins, minus the header block (logo, event, division, date) and the footer line. */
export const PAGE_MM = { w: 297, h: 210 };
export const MARGIN_MM = 8;
export const HEADER_MM = 24;
export const FOOTER_MM = 8;
export const BODY_MM = { w: PAGE_MM.w - 2 * MARGIN_MM, h: PAGE_MM.h - 2 * MARGIN_MM - HEADER_MM - FOOTER_MM };

/** A round with more heats than this is spread over extra columns and the ladder goes onto two pages. */
export const MAX_HEATS_PER_COLUMN = 8;
/** Never bigger than this (a small ladder is not blown up): about 10 pt. */
export const MAX_MM_PER_EM = 3.6;

export const BOX = { colW: 21, colGap: 1.4, colHead: 2.4, heatHead: 1.7, seat: 1.6, pad: 0.4, heatGap: 0.7, rowIndent: 0.4, numberW: 1.3, tagW: 5.6 };

export interface PrintTag {
  /** "RED", "#12": always printed as text, so it survives black and white. */
  text: string;
  /** The real colour, for a lycra colour; absent for a bib number. */
  hex?: string;
  ink: string;
  /** White, black and very light or dark colours get an outline. */
  outlined: boolean;
}

export interface PrintSeat {
  number: number;
  kind: "rider" | "place" | "empty";
  tag: PrintTag | null;
  /** The rider's name, the place the seat waits for ("1st H1"), or "Empty seat". */
  text: string;
  /** Position inside the heat box, in em. */
  y: number;
}

export interface PrintHeat {
  uid: string;
  title: string;
  /** Local start time ("10:05") when a run order has one. */
  time: string | null;
  seats: PrintSeat[];
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PrintColumn {
  round: string;
  name: string;
  /** "2 of 2" when a big round continues in a second column. */
  part: { index: number; of: number } | null;
  summary: string;
  heats: PrintHeat[];
  x: number;
  w: number;
  h: number;
}

export interface PrintPage {
  index: number;
  of: number;
  columns: PrintColumn[];
  widthEm: number;
  heightEm: number;
  mmPerEm: number;
}

export interface PrintSheet {
  pages: PrintPage[];
  hasTimes: boolean;
}

function seatsOf(draw: DivisionDraw, scheme: IdentificationScheme, round: DrawRound, heat: DrawHeat): PrintSeat[] {
  const T = copy.draw.ladder;
  return heat.slots.map((slot, i) => {
    const y = BOX.heatHead + BOX.pad + i * BOX.seat;
    const rider = draw.entrants.find((e) => e.id === slot.entrantId);
    if (rider) {
      const label = riderLabelModel(scheme, { name: rider.name, identifiers: rider.identifiers, slotColour: slot.vestColour });
      const p = label.primary;
      const tag: PrintTag | null =
        p.kind === "colour" ? { text: p.text, hex: p.hex, ink: p.ink, outlined: p.outlined } : p.kind === "text" && p.text !== rider.name.trim() ? { text: p.text, ink: "#111111", outlined: true } : null;
      return { number: i + 1, kind: "rider" as const, tag, text: slot.modifier === "DNS" ? `${rider.name} (${T.walkover})` : rider.name, y };
    }
    if (slot.from) return { number: i + 1, kind: "place" as const, tag: null, text: placeholderText(draw, slot.from, round.id), y };
    return { number: i + 1, kind: "empty" as const, tag: null, text: T.emptySeat, y };
  });
}

const heatHeight = (seats: number) => BOX.heatHead + BOX.pad * 2 + seats * BOX.seat;

/** Splits a round's heats into columns of at most MAX_HEATS_PER_COLUMN, as evenly as possible (10 → 5 + 5). */
function chunks<T>(items: readonly T[]): T[][] {
  const columns = Math.max(1, Math.ceil(items.length / MAX_HEATS_PER_COLUMN));
  const size = Math.ceil(items.length / columns);
  return Array.from({ length: columns }, (_, c) => items.slice(c * size, (c + 1) * size)).filter((c) => c.length > 0 || items.length === 0);
}

function placePage(rounds: Array<{ round: DrawRound; part: { index: number; of: number } | null; heats: DrawHeat[] }>, draw: DivisionDraw, scheme: IdentificationScheme, times: Record<string, string>): Omit<PrintPage, "index" | "of"> {
  const columns: PrintColumn[] = rounds.map((c, i) => {
    let y = BOX.colHead;
    const heats: PrintHeat[] = c.heats.map((h) => {
      const seats = seatsOf(draw, scheme, c.round, h);
      const box: PrintHeat = { uid: h.uid ?? h.id, title: heatLabel(h), time: times[h.uid ?? h.id] ?? null, seats, x: i * (BOX.colW + BOX.colGap), y, w: BOX.colW, h: heatHeight(seats.length) };
      y += box.h + BOX.heatGap;
      return box;
    });
    const empty = c.heats.length === 0;
    return {
      round: c.round.id,
      name: c.round.name,
      part: c.part,
      summary: copy.draw.ladder.roundSummary(c.round.heats.filter((h) => !h.bye).length, c.round.heats.reduce((n, h) => n + h.slots.length, 0)),
      heats,
      x: i * (BOX.colW + BOX.colGap),
      w: BOX.colW,
      h: empty ? BOX.colHead + 3 : y - BOX.heatGap,
    };
  });
  const widthEm = columns.length * BOX.colW + Math.max(0, columns.length - 1) * BOX.colGap;
  const heightEm = Math.max(BOX.colHead + 3, ...columns.map((c) => c.h));
  const mmPerEm = Math.min(MAX_MM_PER_EM, BODY_MM.w / widthEm, BODY_MM.h / heightEm);
  return { columns, widthEm, heightEm, mmPerEm };
}

/**
 * The ladder as printed pages. One page; or two when a round has more than 8 heats: page 1 holds the big rounds (each spread over
 * columns of at most 8 heats), page 2 the rest. `times` maps a heat's uid to its start time when a run order exists.
 */
export function buildPrintSheet(draw: DivisionDraw, scheme: IdentificationScheme, options: { times?: Record<string, string> } = {}): PrintSheet {
  const times = options.times ?? {};
  const entries = (round: DrawRound) => {
    const parts = chunks(round.heats);
    return parts.map((heats, i) => ({ round, part: parts.length > 1 ? { index: i + 1, of: parts.length } : null, heats }));
  };
  const big = draw.rounds.filter((r) => r.heats.length > MAX_HEATS_PER_COLUMN);
  const groups = big.length === 0 ? [draw.rounds] : [big, draw.rounds.filter((r) => r.heats.length <= MAX_HEATS_PER_COLUMN)].filter((g) => g.length > 0);
  const pages = groups.map((g, i) => ({ index: i + 1, of: groups.length, ...placePage(g.flatMap(entries), draw, scheme, times) }));
  const hasTimes = pages.some((p) => p.columns.some((c) => c.heats.some((h) => h.time !== null)));
  return { pages, hasTimes };
}

/** What the head of every printed page says. */
export interface PrintHeader {
  eventName: string;
  divisionName: string;
  /** "Fri 2 Oct 2026", already formatted. */
  date: string | null;
  /** "Draft — you can still change it" / "Locked". */
  status: string;
  logoUrl: string | null;
}
