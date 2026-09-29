import { z } from "zod";
import { FormatTemplateSchema, type FormatTemplate } from "@/lib/schemas/format-template";
import { ScoringModelSchema, type ScoringModel } from "@/lib/schemas/scoring-model";
import { friendlyMessage } from "@/lib/schema-form/nodes";

/** Export and import of scoring models and formats as JSON files (docs/06 §1). Pure; imports always become NEW organisation presets. */
export type PresetKind = "scoring_model" | "format_template";

export const MAX_IMPORT_BYTES = 300 * 1024;

export function slugKey(text: string): string {
  return (
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "preset"
  );
}

export function exportPreset(json: unknown, name: string): { filename: string; text: string } {
  return { filename: `${slugKey(name)}.json`, text: `${JSON.stringify(json, null, 2)}\n` };
}

/** "line 3, column 5" for a JSON syntax error, whatever wording the JS engine used. */
export function describeJsonError(text: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  let where = "";
  const lc = message.match(/line (\d+) column (\d+)/i);
  if (lc) where = ` (line ${lc[1]}, column ${lc[2]})`;
  else {
    const pos = message.match(/position (\d+)/i);
    if (pos) {
      const before = text.slice(0, Number(pos[1]));
      const line = before.split("\n").length;
      where = ` (line ${line}, column ${before.length - before.lastIndexOf("\n")})`;
    }
  }
  return `This file is not valid JSON${where}. ${message.replace(/ in JSON at position \d+.*/, "").replace(/ \(line \d+ column \d+\)/, "")}`;
}

function zodProblems(error: z.ZodError): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of error.issues) {
    const where = i.path.length ? i.path.join(" › ") : "the file";
    const line = `${where}: ${friendlyMessage(i.message)}`;
    if (!seen.has(line)) {
      seen.add(line);
      out.push(line);
    }
  }
  return out;
}

function looksLike(json: unknown): PresetKind | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if ("trick" in o || "panel" in o || "heat" in o) return "scoring_model";
  if ("timing" in o || "kind" in o || "entrants" in o) return "format_template";
  return null;
}

export type ImportResult<T> = { ok: true; json: Record<string, unknown>; parsed: T; name: string } | { ok: false; problems: string[] };

function importAs<T>(kind: PresetKind, text: string, schema: z.ZodType<T>, noun: string): ImportResult<T> {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) return { ok: false, problems: [`This file is larger than ${MAX_IMPORT_BYTES / 1024} KB, which is far more than a ${noun} needs. Is it the right file?`] };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { ok: false, problems: [describeJsonError(text, e)] };
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) return { ok: false, problems: [`A ${noun} file must contain one JSON object (starting with “{”).`] };
  const other = looksLike(json);
  if (other && other !== kind) {
    return { ok: false, problems: [`This looks like a ${other === "scoring_model" ? "scoring model" : "format"}, not a ${noun}. Import it in the matching place.`] };
  }
  const r = schema.safeParse(json);
  if (!r.success) return { ok: false, problems: zodProblems(r.error) };
  const name = String((json as { name?: unknown }).name ?? "Imported");
  return { ok: true, json: json as Record<string, unknown>, parsed: r.data, name };
}

export const importScoringModel = (text: string): ImportResult<ScoringModel> => importAs("scoring_model", text, ScoringModelSchema, "scoring model");
export const importFormatTemplate = (text: string): ImportResult<FormatTemplate> => importAs("format_template", text, FormatTemplateSchema, "format");

/**
 * The organisation-preset copy of an imported (or duplicated) file: new key, version 1, `basedOn` remembers the source.
 * Existing keys get a numeric suffix so an import never overwrites anything.
 */
export function asNewPreset(json: Record<string, unknown>, name: string, takenKeys: readonly string[]): { key: string; json: Record<string, unknown> } {
  const base = slugKey(name);
  let key = base;
  for (let n = 2; takenKeys.includes(key); n++) key = `${base}-${n}`;
  const basedOn = typeof json.basedOn === "string" ? json.basedOn : typeof json.id === "string" ? json.id : undefined;
  return { key, json: { ...json, id: key, name, version: 1, ...(basedOn ? { basedOn } : {}) } };
}
