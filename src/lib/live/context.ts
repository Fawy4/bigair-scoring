import { parseScoringModel, type ScoringModel } from "@/lib/schemas/scoring-model";
import { divisionScheme } from "@/lib/identification/division-scheme";
import { effectiveScheme } from "@/lib/identification/effective";
import { cleanIdentifiers } from "@/lib/riders/identifiers";
import { toEntrantIdentifiers } from "@/lib/draw/entrants";
import { loadEventBlocks, loadEventVocabulary } from "@/lib/org/trick-vocabulary";
import { rowToPlan, type PlanRow } from "@/lib/schedule/plans";
import { buildHeatModel, type HeatRowDb } from "@/lib/schedule/model";
import { parseEventSettings } from "@/lib/schemas/event-settings";
import { parseDivisionLive } from "@/lib/schemas/division-live";
import { defaultScheme } from "@/lib/schemas/identification";
import { mergeOverrides, SCORING_NULLABLE } from "@/lib/scoring-ui/overrides";
import { createClient } from "@/lib/supabase/server";
import { blocksFromVocabulary, effectiveDisabled, parseTrickBase } from "@/lib/trick-base";
import { HEAT_COLUMNS, type HeatRow, type LiveContext, type LiveDivisionContext, type LiveRiderInfo, type SeatRole } from "./types";

type Db = Awaited<ReturnType<typeof createClient>>;

/** The format's flag-out from the stored draw's template (readable by officials of the event), or null. */
function flagOutOf(draw: unknown): { rounds: string[]; atMin: number; count: number } | null {
  const fo = (draw as { template?: { flagOut?: { rounds?: unknown; atMin?: unknown; count?: unknown } } } | null)?.template?.flagOut;
  if (!fo || !Array.isArray(fo.rounds) || typeof fo.atMin !== "number" || typeof fo.count !== "number") return null;
  return { rounds: fo.rounds.filter((r): r is string => typeof r === "string"), atMin: fo.atMin, count: fo.count };
}

const PLAN_COLUMNS = "id, event_id, day, name, items, anchors, actual_starts, hold, defaults, active, updated_at";

/**
 * Everything a live screen needs that does not change during a heat: the event, who is looking, the divisions with their rules (the model with the
 * division's overrides merged in), the Rider label scheme, the trick vocabulary, the heats and the riders' labels. Read as the signed-in person, so row
 * security decides what is visible. Returns null when the person is neither a seat of the event nor one of its organisers.
 */
export async function loadLiveContext(eventId: string, supabase?: Db): Promise<LiveContext | null> {
  const db = supabase ?? (await createClient());
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;
  const { data: event } = await db.from("events").select("id, organisation_id, name, slug, timezone, settings, is_simulation").eq("id", eventId).maybeSingle();
  if (!event) return null;
  const settings = parseEventSettings(event.settings);

  const { data: seats } = await db.from("judge_seats").select("id, name, role, active, status, spotter_assignment").eq("event_id", eventId).eq("auth_user_id", user.id).eq("active", true).eq("status", "active").limit(1);
  const seat = seats?.[0];
  let viewer: LiveContext["viewer"];
  if (seat) {
    const sa = (seat.spotter_assignment ?? {}) as { entries?: unknown; colours?: unknown };
    viewer = {
      kind: "seat",
      seatId: seat.id,
      name: seat.name,
      role: seat.role as SeatRole,
      spotterEntries: Array.isArray(sa.entries) ? sa.entries.filter((x): x is string => typeof x === "string") : [],
      spotterColours: Array.isArray(sa.colours) ? sa.colours.filter((x): x is string => typeof x === "string") : [],
    };
  } else {
    // an organiser of the event's organisation (row security: a person reads only their own membership)
    const { data: member } = await db.from("memberships").select("id").eq("organisation_id", event.organisation_id).eq("user_id", user.id).limit(1);
    if (!member?.length) return null;
    viewer = { kind: "organiser", name: user.email ?? "Organiser" };
  }

  const [{ data: divisionRows }, { data: roundRows }, { data: heatRows }, { data: panelRows }, { data: entryRows }, { data: planRows }, master, localBlocks] = await Promise.all([
    db.from("divisions").select("id, name, sort_order, scoring_model_id, scoring_overrides, trick_base, live_settings, identification, panel_id, draw").eq("event_id", eventId).order("sort_order"),
    db.from("rounds").select("id, division_id, name, short_name, sort_order").eq("event_id", eventId),
    db.from("heats").select(HEAT_COLUMNS).eq("event_id", eventId),
    db.from("panel_members").select("panel_id, judge_seat_id, seat_no").eq("event_id", eventId).order("seat_no"),
    db.from("v_entries").select("id, division_id, status, identifiers, first_name, last_name, nationality, sponsor, photo_url").eq("event_id", eventId),
    db.from("schedule_plans").select(PLAN_COLUMNS).eq("event_id", eventId).eq("active", true),
    loadEventVocabulary(db, eventId),
    loadEventBlocks(db, eventId),
  ]);

  const modelIds = [...new Set((divisionRows ?? []).map((d) => d.scoring_model_id).filter((x): x is string => Boolean(x)))];
  const { data: modelRows } = modelIds.length ? await db.from("scoring_models").select("id, json").in("id", modelIds) : { data: [] as Array<{ id: string; json: unknown }> };
  const eventIdentification = settings.identification ? { scheme: settings.identification.scheme, allowDivisionOverride: settings.identification.allowDivisionOverride } : { scheme: defaultScheme(), allowDivisionOverride: false };

  // off on the spotter: unticked, retired in the master base, or off by default and never ticked (docs/08 §1I-5)
  const allBlocks = master ? blocksFromVocabulary(master.vocabulary, localBlocks) : [];
  const divisions: LiveDivisionContext[] = [];
  for (const d of divisionRows ?? []) {
    const base = (modelRows ?? []).find((m) => m.id === d.scoring_model_id)?.json;
    let model: ScoringModel;
    try {
      model = parseScoringModel(mergeOverrides(base as never, d.scoring_overrides, SCORING_NULLABLE));
    } catch {
      continue; // a division without a usable scoring model cannot be scored; it simply does not appear
    }
    const own = divisionScheme(d.identification);
    const tb = parseTrickBase(d.trick_base);
    divisions.push({
      id: d.id,
      name: d.name,
      sortOrder: d.sort_order,
      model,
      scheme: effectiveScheme(eventIdentification, own ? { scheme: own } : null),
      trickBase: { disabled: effectiveDisabled(allBlocks, tb), layout: tb.layout ?? null },
      live: parseDivisionLive(d.live_settings),
      flagOut: flagOutOf(d.draw),
      panelSeatIds: (panelRows ?? []).filter((p) => p.panel_id === d.panel_id).map((p) => p.judge_seat_id),
      maxAttempts: model.heat.maxAttemptsPerRider,
    });
  }

  const riders: LiveRiderInfo[] = (entryRows ?? []).map((e) => {
    const ids = toEntrantIdentifiers(cleanIdentifiers(e.identifiers));
    return {
      entryId: e.id ?? "",
      divisionId: e.division_id ?? "",
      name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || "Rider",
      nationality: e.nationality,
      sponsor: e.sponsor,
      photoUrl: null,
      identifiers: ids as LiveRiderInfo["identifiers"],
    };
  });

  const plans = (planRows ?? []).map((r) => {
    const dp = rowToPlan(r as unknown as PlanRow, settings.readyCallMin);
    return { id: r.id, day: r.day, name: r.name, plan: dp.plan, defaults: dp.defaults, updatedAt: r.updated_at };
  });

  // breaks and "last heat of its round" come from the stored draw; only these small numbers go to the phone, not the draw itself
  const model = buildHeatModel(
    (divisionRows ?? []).map((d) => ({ id: d.id, name: d.name, sort_order: d.sort_order, draw: d.draw })),
    (roundRows ?? []).map((r) => ({ id: r.id, division_id: r.division_id, name: r.name, short_name: r.short_name, sort_order: r.sort_order })),
    (heatRows ?? []) as unknown as HeatRowDb[],
  );
  const heatMeta: LiveContext["heatMeta"] = {};
  for (const l of model.lives) heatMeta[l.heatId] = { roundLast: Boolean(l.roundLast), ...(l.breakAfterHeatMin !== undefined ? { breakAfterHeatMin: l.breakAfterHeatMin } : {}), ...(l.breakAfterRoundMin !== undefined ? { breakAfterRoundMin: l.breakAfterRoundMin } : {}) };

  // the judges' names: the head seat and an organiser read every seat of the event (row security), a judge only their own
  const panelSeatIds = [...new Set((panelRows ?? []).map((p) => p.judge_seat_id))];
  const { data: nameRows } = panelSeatIds.length ? await db.from("judge_seats").select("id, name").eq("event_id", eventId).in("id", panelSeatIds) : { data: [] as Array<{ id: string; name: string }> };
  const seatNames: Record<string, string> = {};
  for (const r of nameRows ?? []) seatNames[r.id] = r.name;

  return {
    event: { id: event.id, name: event.name, slug: event.slug, timezone: event.timezone, judgesMayLogAttempts: settings.judgesMayLogAttempts, maxRunningHeats: settings.maxRunningHeats, isSimulation: Boolean(event.is_simulation), readyCallMin: settings.readyCallMin },
    viewer,
    divisions,
    rounds: roundRows ?? [],
    heats: (heatRows ?? []) as HeatRow[],
    riders,
    vocabulary: master?.vocabulary ?? null,
    localBlocks,
    plans,
    heatMeta,
    seatNames,
    divisionTabs: (divisionRows ?? []).map((d) => ({ id: d.id, name: d.name })),
  };
}
