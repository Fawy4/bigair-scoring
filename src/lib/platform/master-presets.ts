import { z } from "zod";
import { parseFormatTemplate } from "@/lib/schemas/format-template";
import { parseIdentificationScheme } from "@/lib/schemas/identification";
import { parseScoringModel } from "@/lib/schemas/scoring-model";
import { copy } from "@/lib/ui-copy";

/** Master presets: system presets are versioned; a new version is a draft until an owner publishes it. */
export type MasterKind = "scoring_model" | "format_template" | "trick_vocabulary" | "identification";

export const MASTER_KINDS: Array<{ kind: MasterKind; label: string; slug: string }> = [
  { kind: "scoring_model", label: copy.admin.presets.kinds.scoring_model, slug: "scoring-models" },
  { kind: "format_template", label: copy.admin.presets.kinds.format_template, slug: "format-templates" },
  { kind: "trick_vocabulary", label: copy.admin.presets.kinds.trick_vocabulary, slug: "trick-vocabulary" },
  { kind: "identification", label: copy.admin.presets.kinds.identification, slug: "identification-schemes" },
];

export interface MasterRow {
  id: string;
  key: string;
  name: string;
  version: number;
  published_at: string | null;
  created_at?: string | null;
}

/** The version new divisions get: the highest published one. Drafts never count. */
export function defaultVersion<T extends MasterRow>(rows: readonly T[]): T | undefined {
  return rows.filter((r) => r.published_at).reduce<T | undefined>((best, r) => (!best || r.version > best.version ? r : best), undefined);
}

/** Editing always creates the next number after every version, drafts included. */
export function nextVersion(rows: readonly MasterRow[]): number {
  return rows.reduce((max, r) => Math.max(max, r.version), 0) + 1;
}

/** Only a draft newer than the current default can be published; publishing never moves the default backwards. */
export function canPublish(rows: readonly MasterRow[], id: string): { ok: true } | { ok: false; message: string } {
  const row = rows.find((r) => r.id === id);
  if (!row) return { ok: false, message: copy.admin.presets.errors.NOT_FOUND };
  const current = defaultVersion(rows);
  if (current && row.version <= current.version) return { ok: false, message: current.id === row.id ? copy.admin.presets.errors.ALREADY_DEFAULT : copy.admin.presets.errors.NOT_NEWER };
  return { ok: true };
}

type Result = { ok: true; value: Record<string, unknown> } | { ok: false; message: string };

const VOCABULARY_PARTS = ["baseTricks", "modifiers", "categoryPrecedence", "namingTemplate"];

/** Checks a preset the way the app will read it (the same schemas as the seed script). Never throws. */
export function validateMasterPreset(kind: MasterKind, json: unknown): Result {
  if (!json || typeof json !== "object" || Array.isArray(json)) return { ok: false, message: copy.admin.presets.errors.NOT_OBJECT };
  const value = json as Record<string, unknown>;
  try {
    if (kind === "scoring_model") parseScoringModel(value);
    else if (kind === "format_template") parseFormatTemplate(value);
    else if (kind === "identification") parseIdentificationScheme(value);
    else {
      const missing = VOCABULARY_PARTS.filter((k) => !(k in value));
      if (missing.length) return { ok: false, message: copy.admin.presets.vocabularyMissing(missing.join(", ")) };
    }
  } catch (e) {
    const message = e instanceof z.ZodError ? z.prettifyError(e) : (e as Error).message;
    return { ok: false, message: message || copy.admin.presets.errors.INVALID };
  }
  return { ok: true, value };
}

/** Pins the key (a preset cannot be renamed into another one by editing) and stamps the new version on scoring models. */
export function prepareNewVersion(kind: MasterKind, json: Record<string, unknown>, target: { key: string; version: number }): Record<string, unknown> {
  if (kind === "trick_vocabulary") return { ...json };
  const pinned = { ...json, id: target.key };
  return kind === "scoring_model" ? { ...pinned, version: target.version } : pinned;
}
