import type { Access } from "@/lib/exports/access";
import { excludeSimulations } from "@/lib/exports/exclude-simulations";
import { buildBackup, SEAT_COLUMNS, type BackupFile, type Row } from "@/lib/export-format/backup";
import { fetchAll } from "@/lib/export-format/fetch-all";
import { PRODUCT_VERSION } from "@/lib/product-version";
import { EVENT_VOCABULARY_KEY, MASTER_VOCABULARY_KEY } from "@/lib/org/trick-vocabulary";
import { copy } from "@/lib/ui-copy";

type Ok = Extract<Access, { ok: true }>;

/** The event row's columns, named one by one: the PIN hash of the event's join code is not among them, and never will be. */
const EVENT_COLUMNS = "id, organisation_id, name, slug, location, timezone, start_date, end_date, status, settings, branding, trick_vocabulary_version, is_simulation, simulation_of, archived_at, created_at, updated_at";

/**
 * The whole event as one file (docs/EXPORT-FORMAT.md). Read-only, with the service key, after `authoriseExport` has said this person is an organiser of the event.
 * Seats are read by named columns only and the free-form parts are stripped of secret keys; the schema check inside `buildBackup` refuses the file if one remains.
 */
export async function loadBackup(a: Ok, now: string = new Date().toISOString()): Promise<{ ok: true; file: BackupFile } | { ok: false; sentence: string }> {
  if (excludeSimulations([a.event]).length === 0) return { ok: false, sentence: copy.exportFiles.refused.simulation };
  const s = a.service;
  const id = a.event.id;
  // every table keyed by event_id, read whole in pages of 1000 (a 15-heat event holds thousands of score rows)
  const all = (table: string, columns = "*") => fetchAll<Row>((from, to) => s.from(table as never).select(columns).eq("event_id", id).order("id").range(from, to));

  const [eventRes, orgRes] = await Promise.all([s.from("events").select(EVENT_COLUMNS).eq("id", id).single(), s.from("organisations").select("id, name, slug").eq("id", a.event.organisation_id).single()]);
  if (!eventRes.data || !orgRes.data) return { ok: false, sentence: copy.exportFiles.refused.failed };

  const [divisions, panels, panelMembers, entries, seats, rounds, heats, heatSlots, plans, attempts, scores, impressionScores, penalties, attemptFlags, judgeSheets, decisions, results, windCalls, feedbackNotes, auditLog, localVocab] = await Promise.all([
    all("divisions"),
    all("panels"),
    all("panel_members"),
    all("entries"),
    all("judge_seats", SEAT_COLUMNS.join(", ")),
    all("rounds"),
    all("heats"),
    all("heat_slots"),
    all("schedule_plans"),
    all("trick_attempts"),
    all("trick_scores"),
    all("impression_scores"),
    all("penalties"),
    all("attempt_flags"),
    all("judge_sheets"),
    all("heat_decisions"),
    all("heat_results"),
    all("wind_calls"),
    all("feedback_notes"),
    all("audit_log"),
    s.from("trick_vocabularies").select("json").eq("event_id", id).eq("key", EVENT_VOCABULARY_KEY).limit(1),
  ]);

  // the riders of this event's entries, and the scoring model and format each division uses (as they are now, by id, name and version)
  const riderIds = [...new Set(entries.map((e) => e.rider_id as string))];
  const riders: Row[] = [];
  for (let i = 0; i < riderIds.length; i += 200) {
    const { data } = await s.from("riders").select("*").in("id", riderIds.slice(i, i + 200));
    riders.push(...((data ?? []) as Row[]));
  }
  const modelIds = [...new Set(divisions.map((d) => d.scoring_model_id as string | null).filter((x): x is string => Boolean(x)))];
  const formatIds = [...new Set(divisions.map((d) => d.format_template_id as string | null).filter((x): x is string => Boolean(x)))];
  const [{ data: models }, { data: formats }] = await Promise.all([
    modelIds.length ? s.from("scoring_models").select("id, key, name, version, content_hash, json").in("id", modelIds) : Promise.resolve({ data: [] as Row[] }),
    formatIds.length ? s.from("format_templates").select("id, key, name, version, content_hash, json").in("id", formatIds) : Promise.resolve({ data: [] as Row[] }),
  ]);
  const byId = (rows: Row[] | null) => new Map((rows ?? []).map((r) => [r.id as string, r] as const));
  const modelById = byId(models as Row[] | null);
  const formatById = byId(formats as Row[] | null);

  // the master trick base version this event uses, by key, version and content hash (the file names it; it does not copy the whole master)
  const version = (eventRes.data.trick_vocabulary_version as number | null) ?? null;
  const masterQuery = s.from("trick_vocabularies").select("key, version, content_hash").is("organisation_id", null).is("event_id", null).eq("key", MASTER_VOCABULARY_KEY);
  const { data: masterRows } = await (version !== null ? masterQuery.eq("version", version) : masterQuery.not("published_at", "is", null).order("version", { ascending: false })).limit(1);
  const m = masterRows?.[0];
  const blocks = (localVocab.data?.[0]?.json as { blocks?: unknown } | undefined)?.blocks;

  let file: BackupFile;
  try {
    file = buildBackup({
      exportedAt: now,
      exportedBy: { role: "organiser", name: a.userName },
      appVersion: PRODUCT_VERSION,
      organisation: { id: orgRes.data.id, name: orgRes.data.name, slug: orgRes.data.slug },
      event: eventRes.data as unknown as Row,
      master: m ? { key: m.key, version: m.version, contentHash: m.content_hash ?? null } : null,
      localBlocks: Array.isArray(blocks) ? blocks : [],
      divisions: divisions.map((d) => ({ ...d, scoringModel: modelById.get(d.scoring_model_id as string) ?? null, formatTemplate: formatById.get(d.format_template_id as string) ?? null })),
      panels,
      panelMembers,
      riders,
      entries,
      seats,
      rounds,
      heats,
      heatSlots,
      plans,
      attempts,
      scores,
      impressionScores,
      penalties,
      attemptFlags,
      judgeSheets,
      decisions,
      results,
      windCalls,
      feedbackNotes,
      auditLog,
    });
  } catch {
    return { ok: false, sentence: copy.exportFiles.refused.failed };
  }
  return { ok: true, file };
}
