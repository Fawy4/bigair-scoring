import type { SupabaseClient } from "@supabase/supabase-js";
import { applyDrawEdit, arrangedParts, checkDraw, expandFormat, regenerateKeeping, type DivisionDraw, type DrawEdit, type DrawCheckWarning } from "@/lib/engine/ladder";
import { divisionScheme } from "@/lib/identification/division-scheme";
import { effectiveScheme } from "@/lib/identification/effective";
import { cleanIdentifiers } from "@/lib/riders/identifiers";
import { parseEventSettings } from "@/lib/schemas/event-settings";
import { parseFormatTemplate, type FormatTemplate } from "@/lib/schemas/format-template";
import { defaultScheme, type IdentificationScheme } from "@/lib/schemas/identification";
import { FORMAT_NULLABLE, mergeOverrides } from "@/lib/scoring-ui/overrides";
import type { Database, Json } from "@/lib/supabase/database.types";
import { applyHeatStatuses, confirmedEntrants, engineSchemeId, syncEntrants, toEntrantIdentifiers, type EntryInput } from "./entrants";
import { drawProjection } from "./projection";

export type Db = SupabaseClient<Database>;

export class DrawError extends Error {
  constructor(
    public code: "no_format" | "no_riders" | "locked" | "started" | "not_allowed" | "no_draw" | "bad_format" | "failed" | "reason",
    message: string,
  ) {
    super(message);
    this.name = "DrawError";
  }
}

export interface DivisionContext {
  id: string;
  eventId: string;
  name: string;
  locked: boolean;
  draw: DivisionDraw | null;
  scheme: IdentificationScheme;
  template: FormatTemplate | null;
  templateError: string | null;
  entries: EntryInput[];
  /** Any heat of the division has started: the draw cannot be regenerated and those heats cannot be edited. */
  started: boolean;
  heatRows: Array<{ id: string; draw_uid: string | null; number: number; status: string; started_at: string | null }>;
}

/** The columns of a division `divisionContextFrom` reads (with the event's settings and the division's format, in the same request). */
export const DIVISION_CONTEXT_COLUMNS = "id, event_id, name, draw, draw_locked_at, format_template_id, format_params, identification, events(settings), format_templates(name, json)";
export const CONTEXT_ENTRY_COLUMNS = "id, division_id, seed, status, identifiers, created_at, riders(first_name, last_name)";
export const CONTEXT_HEAT_COLUMNS = "id, division_id, draw_uid, number, status, started_at";

export interface ContextDivisionRow {
  id: string;
  event_id: string;
  name: string;
  draw: unknown;
  draw_locked_at: string | null;
  format_template_id: string | null;
  format_params: unknown;
  identification: unknown;
  events: { settings: unknown } | null;
  format_templates: { name?: string; json: unknown } | null;
}
export interface ContextEntryRow {
  id: string;
  seed: number | null;
  status: string;
  identifiers: unknown;
  created_at: string;
  riders: { first_name: string | null; last_name: string | null } | null;
}

/** The division's context from rows already read: the division (with event settings and format), its riders, its heats. */
export function divisionContextFrom(div: ContextDivisionRow, entryRows: readonly ContextEntryRow[], heatRows: DivisionContext["heatRows"]): DivisionContext {
  const settings = parseEventSettings(div.events?.settings);
  const eventIdentification = settings.identification
    ? { scheme: settings.identification.scheme, allowDivisionOverride: settings.identification.allowDivisionOverride }
    : { scheme: defaultScheme(), allowDivisionOverride: false };
  const own = divisionScheme(div.identification);
  const scheme = effectiveScheme(eventIdentification, own ? { scheme: own } : null);

  let template: FormatTemplate | null = null;
  let templateError: string | null = null;
  if (div.format_template_id && div.format_templates) {
    try {
      template = parseFormatTemplate(mergeOverrides(div.format_templates.json as never, div.format_params as never, FORMAT_NULLABLE));
    } catch (e) {
      templateError = (e as Error).message;
    }
  }
  const entries: EntryInput[] = entryRows.map((e) => ({
    id: e.id,
    seed: e.seed,
    status: e.status as EntryInput["status"],
    name: `${e.riders?.first_name ?? ""} ${e.riders?.last_name ?? ""}`.trim() || "Rider",
    identifiers: toEntrantIdentifiers(cleanIdentifiers(e.identifiers)),
    createdAt: e.created_at,
  }));
  const rows = heatRows;
  let draw = (div.draw as unknown as DivisionDraw | null) ?? null;
  if (draw) draw = applyHeatStatuses(syncEntrants(draw, entries), rows);
  return {
    id: div.id,
    eventId: div.event_id,
    name: div.name,
    locked: Boolean(div.draw_locked_at),
    draw,
    scheme,
    template,
    templateError,
    entries,
    started: rows.some((h) => h.status !== "scheduled" || Boolean(h.started_at)),
    heatRows: rows,
  };
}

/** Everything the Draw step needs to know about one division, read as the signed-in organiser (row security decides what is visible). Three requests at the same time. */
export async function loadDivisionContext(supabase: Db, divisionId: string): Promise<DivisionContext> {
  const [{ data: div }, { data: entryRows }, { data: heatRows }] = await Promise.all([
    supabase.from("divisions").select(DIVISION_CONTEXT_COLUMNS).eq("id", divisionId).maybeSingle(),
    supabase.from("entries").select(CONTEXT_ENTRY_COLUMNS).eq("division_id", divisionId),
    supabase.from("heats").select(CONTEXT_HEAT_COLUMNS).eq("division_id", divisionId).order("number"),
  ]);
  if (!div) throw new DrawError("not_allowed", "No such division.");
  return divisionContextFrom(div as unknown as ContextDivisionRow, (entryRows ?? []) as unknown as ContextEntryRow[], (heatRows ?? []) as DivisionContext["heatRows"]);
}

/** The database's named errors (raised by the draw functions and guards) in plain words the caller can map to screen text. */
export function drawErrorOf(message: string): DrawError {
  if (/DRAW_LOCKED/.test(message)) return new DrawError("locked", message);
  if (/HEAT_STARTED/.test(message)) return new DrawError("started", message);
  if (/NOT_ALLOWED|row-level|permission denied/i.test(message)) return new DrawError("not_allowed", message);
  if (/REASON_REQUIRED/.test(message)) return new DrawError("reason", message);
  if (/NO_DRAW/.test(message)) return new DrawError("no_draw", message);
  return new DrawError("failed", message);
}

async function save(supabase: Db, divisionId: string, draw: DivisionDraw, action: "generate" | "edit", audit: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc("save_division_draw", {
    p_division: divisionId,
    p_draw: draw as unknown as Json,
    p_projection: drawProjection(draw) as unknown as Json,
    p_action: action,
    p_audit: audit as Json,
  });
  if (error) throw drawErrorOf(error.message);
}

export interface GenerateResult {
  draw: DivisionDraw;
  kept: string[];
  dropped: string[];
}

/** "Generate draw" / "Regenerate": runs the division's format on its confirmed riders. Refused once a heat has started or while the draw is locked. */
export async function generate(supabase: Db, divisionId: string, options: { keepArranged: boolean }): Promise<GenerateResult> {
  const ctx = await loadDivisionContext(supabase, divisionId);
  if (ctx.locked) throw new DrawError("locked", "The draw is locked.");
  if (ctx.started) throw new DrawError("started", "A heat has started.");
  if (!ctx.template) throw new DrawError(ctx.templateError ? "bad_format" : "no_format", ctx.templateError ?? "No format.");
  const entrants = confirmedEntrants(ctx.entries);
  if (entrants.length === 0) throw new DrawError("no_riders", "No confirmed riders.");
  let fresh: DivisionDraw;
  try {
    fresh = expandFormat(ctx.template, entrants, { identification: engineSchemeId(ctx.scheme) });
  } catch (e) {
    throw new DrawError("bad_format", (e as Error).message);
  }
  let kept: string[] = [];
  let dropped: string[] = [];
  if (options.keepArranged && ctx.draw && arrangedParts(ctx.draw).heats.length > 0) {
    const r = regenerateKeeping(ctx.draw, fresh);
    fresh = r.draw;
    kept = r.kept;
    dropped = r.dropped;
  }
  const heats = fresh.rounds.flatMap((r) => r.heats).filter((h) => !h.bye).length;
  await save(supabase, divisionId, fresh, "generate", {
    after: { summary: `${ctx.draw ? "Regenerated" : "Generated"} the draw for ${entrants.length} riders: ${fresh.rounds.length} rounds, ${heats} heats${kept.length ? `; kept ${kept.join(", ")}` : ""}${dropped.length ? `; could not keep ${dropped.join(", ")}` : ""}` },
    before: ctx.draw ? { heats: ctx.draw.rounds.reduce((n, r) => n + r.heats.length, 0) } : null,
  });
  return { draw: fresh, kept, dropped };
}

/** Which heats an edit touches, for the audit line's before and after. */
function touchedHeatIds(edit: DrawEdit): string[] {
  switch (edit.op) {
    case "move":
      return [edit.from.heatId, edit.to.heatId];
    case "place":
    case "setPlace":
    case "clear":
    case "addSeat":
    case "removeSeat":
    case "removeHeat":
    case "renameHeat":
      return [edit.heatId];
    default:
      return [];
  }
}

function snapshot(draw: DivisionDraw, ids: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const r of draw.rounds) {
    for (const h of r.heats) {
      if (!ids.includes(h.id)) continue;
      out[h.name ?? (h.number !== null ? `Heat ${h.number}` : h.id)] = h.slots.map((s) => (s.entrantId ? (draw.entrants.find((e) => e.id === s.entrantId)?.name ?? "a rider") : s.from ? `${s.from.round} H${s.from.heat} place ${s.from.place}` : "empty"));
    }
  }
  return out;
}

export interface EditOutcome {
  draw: DivisionDraw;
  summary: string;
  warnings: DrawCheckWarning[];
}

/** One hand edit: applied by the engine, saved in one transaction, audited with the heats before and after. */
export async function edit(supabase: Db, divisionId: string, e: DrawEdit): Promise<EditOutcome> {
  const ctx = await loadDivisionContext(supabase, divisionId);
  if (!ctx.draw) throw new DrawError("no_draw", "No draw yet.");
  if (ctx.locked) throw new DrawError("locked", "The draw is locked.");
  const before = snapshot(ctx.draw, touchedHeatIds(e));
  let result;
  try {
    result = applyDrawEdit(ctx.draw, e);
  } catch (err) {
    throw new DrawError("failed", (err as Error).message);
  }
  const after = { summary: result.summary, ...snapshot(result.draw, touchedHeatIds(e)) };
  await save(supabase, divisionId, result.draw, "edit", { before, after });
  return { draw: result.draw, summary: result.summary, warnings: checkDraw(result.draw) };
}

export async function lock(supabase: Db, divisionId: string): Promise<void> {
  const { error } = await supabase.rpc("lock_division_draw", { p_division: divisionId });
  if (error) throw drawErrorOf(error.message);
}

export async function unlock(supabase: Db, divisionId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("unlock_division_draw", { p_division: divisionId, p_reason: reason });
  if (error) throw drawErrorOf(error.message);
}
