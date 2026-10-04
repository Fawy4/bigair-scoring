import { z } from "zod";

/** The event backup file (docs/EXPORT-FORMAT.md). One JSON file, one event. Restore does not exist yet: this file is the format a later import is written from. */
export const BACKUP_FORMAT = "bigair-event-backup";
export const BACKUP_FORMAT_VERSION = 1;

export type Row = Record<string, unknown>;

/** Columns of the seats table that go into the file: who the seat is and what it may do. Never a PIN, a hash, a link token, a phone number or the login behind the seat. */
export const SEAT_COLUMNS = ["id", "event_id", "name", "role", "active", "status", "scores", "spotter_assignment", "created_at", "updated_at"] as const;

/** Keys that must never appear anywhere in the file, at any depth (a PIN, its hash or encrypted copy, a link token, a password, a key). */
const SECRET_KEY = /^(pin|pin_code|pin_hash|pin_enc|join_pin_hash|qr_token|qr_token_hash|qr_token_expires_at|token|access_token|refresh_token|secret|password|passwd|api_key|service_role_key|authorization|auth_user_id)$/i;

/** Every place in a value where a secret key sits, as a path like `auditLog[3].before.pin_hash`. Empty means clean. */
export function findSecrets(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => findSecrets(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value as Row).flatMap(([k, v]) => (SECRET_KEY.test(k) ? [`${path}.${k}`] : findSecrets(v, `${path}.${k}`)));
  }
  return [];
}

/** The same value with every secret key taken out, at any depth (used on free-form JSON such as the audit log and the event settings, whose shape the file does not control). */
export function stripSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripSecrets(v)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Row).filter(([k]) => !SECRET_KEY.test(k)).map(([k, v]) => [k, stripSecrets(v)])) as T;
  }
  return value;
}

/** Only the named columns of a row. */
export const pick = (row: Row, columns: readonly string[]): Row => Object.fromEntries(columns.filter((c) => c in row).map((c) => [c, row[c]]));

const Rows = z.array(z.looseObject({ id: z.string() }));

export const BackupSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    formatVersion: z.literal(BACKUP_FORMAT_VERSION),
    exportedAt: z.string(),
    exportedBy: z.object({ role: z.enum(["organiser", "platform_owner"]), name: z.string().nullable() }),
    app: z.object({ version: z.string() }),
    organisation: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
    event: z.looseObject({ id: z.string(), name: z.string(), slug: z.string(), timezone: z.string() }),
    trickBase: z.object({
      masterVersion: z.number().nullable(),
      master: z.object({ key: z.string(), version: z.number(), contentHash: z.string().nullable() }).nullable(),
      localBlocks: z.array(z.unknown()),
    }),
    divisions: z.array(z.looseObject({ id: z.string(), name: z.string(), scoringModel: z.unknown(), formatTemplate: z.unknown() })),
    panels: Rows,
    panelMembers: Rows,
    riders: Rows,
    entries: Rows,
    officials: Rows,
    rounds: Rows,
    heats: Rows,
    heatSlots: Rows,
    plans: Rows,
    attempts: Rows,
    scores: Rows,
    impressionScores: Rows,
    penalties: Rows,
    attemptFlags: Rows,
    judgeSheets: Rows,
    decisions: Rows,
    results: Rows,
    windCalls: Rows,
    feedbackNotes: Rows,
    auditLog: Rows,
    counts: z.record(z.string(), z.number()),
  })
  .superRefine((b, ctx) => {
    for (const [name, n] of Object.entries(b.counts)) {
      const rows = (b as unknown as Record<string, unknown>)[name];
      if (!Array.isArray(rows) || rows.length !== n) ctx.addIssue({ code: "custom", message: `counts.${name} says ${n} but the file holds ${Array.isArray(rows) ? rows.length : "nothing"}` });
    }
    for (const where of findSecrets(b)) ctx.addIssue({ code: "custom", message: `a secret key is in the file: ${where}` });
  });

export type BackupFile = z.infer<typeof BackupSchema>;

/** The sections that are plain row lists (counted in `counts`). */
export const ROW_SECTIONS = ["divisions", "panels", "panelMembers", "riders", "entries", "officials", "rounds", "heats", "heatSlots", "plans", "attempts", "scores", "impressionScores", "penalties", "attemptFlags", "judgeSheets", "decisions", "results", "windCalls", "feedbackNotes", "auditLog"] as const;

export interface BackupSource {
  exportedAt: string;
  exportedBy: BackupFile["exportedBy"];
  appVersion: string;
  organisation: { id: string; name: string; slug: string };
  event: Row;
  master: BackupFile["trickBase"]["master"];
  localBlocks: unknown[];
  /** Divisions as stored, each with `scoringModel` and `formatTemplate` laid in (the preset's key, name, version and JSON as it was used). */
  divisions: Row[];
  panels: Row[];
  panelMembers: Row[];
  riders: Row[];
  entries: Row[];
  /** The seats table rows as read: only SEAT_COLUMNS are kept. */
  seats: Row[];
  rounds: Row[];
  heats: Row[];
  heatSlots: Row[];
  plans: Row[];
  attempts: Row[];
  scores: Row[];
  impressionScores: Row[];
  penalties: Row[];
  attemptFlags: Row[];
  judgeSheets: Row[];
  decisions: Row[];
  results: Row[];
  windCalls: Row[];
  feedbackNotes: Row[];
  auditLog: Row[];
}

/** Puts the file together from the rows read. Nothing is taken on trust: seats are cut to their allowed columns and free-form JSON is stripped of secret keys; `BackupSchema` then refuses a file that still holds one. */
export function buildBackup(src: BackupSource): BackupFile {
  const body = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: src.exportedAt,
    exportedBy: src.exportedBy,
    app: { version: src.appVersion },
    organisation: src.organisation,
    event: stripSecrets(src.event),
    trickBase: { masterVersion: (src.event.trick_vocabulary_version as number | null | undefined) ?? src.master?.version ?? null, master: src.master, localBlocks: src.localBlocks },
    divisions: stripSecrets(src.divisions),
    panels: src.panels,
    panelMembers: src.panelMembers,
    riders: src.riders,
    entries: stripSecrets(src.entries),
    officials: src.seats.map((s) => pick(s, SEAT_COLUMNS)),
    rounds: src.rounds,
    heats: src.heats,
    heatSlots: src.heatSlots,
    plans: stripSecrets(src.plans),
    attempts: src.attempts,
    scores: src.scores,
    impressionScores: src.impressionScores,
    penalties: src.penalties,
    attemptFlags: src.attemptFlags,
    judgeSheets: src.judgeSheets,
    decisions: stripSecrets(src.decisions),
    results: src.results,
    windCalls: src.windCalls,
    feedbackNotes: src.feedbackNotes,
    auditLog: stripSecrets(src.auditLog),
  };
  const counts = Object.fromEntries(ROW_SECTIONS.map((k) => [k, (body as unknown as Record<string, unknown[]>)[k].length]));
  return BackupSchema.parse({ ...body, counts });
}
