"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOrgContext } from "@/lib/org/context";
import { canonicalHash } from "@/lib/presets/plan";
import { asNewPreset, importFormatTemplate, importScoringModel, type PresetKind } from "@/lib/presets/io";
import type { PresetRow } from "@/lib/presets/options";
import { FormatTemplateSchema } from "@/lib/schemas/format-template";
import { ScoringModelSchema } from "@/lib/schemas/scoring-model";
import { FORMAT_NULLABLE, mergeOverrides, SCORING_NULLABLE } from "@/lib/scoring-ui/overrides";
import { issuesToMap } from "@/lib/form/path";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Fail = { ok: false; error: string; problems?: string[] };
type Ok<T> = { ok: true } & T;

const Name = z.string().trim().min(2, "Give the division a name (at least 2 characters).").max(60, "That name is too long (60 characters at most).");
const uuid = z.string().uuid();

/** Turns database error codes (from the Phase 3/4 functions and triggers) into plain sentences. */
function explain(message: string | undefined): string {
  if (!message) return "That did not work. Nothing was changed; try again.";
  if (message.includes("RULES_LOCKED")) return "Scoring and format are locked because a heat of this division has started. Unlock them with a written reason first.";
  if (message.includes("DIVISION_HAS_HEATS")) return "This division already has heats, so it cannot be deleted.";
  if (message.includes("REASON_REQUIRED")) return "Write a reason (at least 5 characters).";
  if (message.includes("NOT_ALLOWED")) return "You do not have permission to do that.";
  return "That did not work. Nothing was changed; try again.";
}

async function eventOf(supabase: Supabase, divisionId: string) {
  const { data } = await supabase.from("divisions").select("id, event_id, sort_order").eq("id", divisionId).maybeSingle();
  return data;
}

const refresh = (eventId: string) => {
  revalidatePath(`/org/events/${eventId}`, "layout");
};

export async function addDivision(eventId: string, name: string): Promise<Ok<{ id: string; sortOrder: number }> | Fail> {
  const parsed = Name.safeParse(name);
  if (!parsed.success || !uuid.safeParse(eventId).success) return { ok: false, error: parsed.success ? "Unknown event." : parsed.error.issues[0].message };
  const { supabase } = await getOrgContext();
  const { data: last } = await supabase.from("divisions").select("sort_order").eq("event_id", eventId).order("sort_order", { ascending: false }).limit(1);
  const sortOrder = (last?.[0]?.sort_order ?? 0) + 1;
  const { data, error } = await supabase.from("divisions").insert({ event_id: eventId, name: parsed.data, sort_order: sortOrder }).select("id").single();
  if (error) return { ok: false, error: explain(error.message) };
  refresh(eventId);
  return { ok: true, id: data.id, sortOrder };
}

export async function renameDivision(divisionId: string, name: string): Promise<Ok<object> | Fail> {
  const parsed = Name.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { supabase } = await getOrgContext();
  const d = await eventOf(supabase, divisionId);
  if (!d) return { ok: false, error: "That division was not found." };
  const { error } = await supabase.from("divisions").update({ name: parsed.data }).eq("id", divisionId);
  if (error) return { ok: false, error: explain(error.message) };
  refresh(d.event_id);
  return { ok: true };
}

/** Moves a division one place up (-1) or down (+1) and renumbers the whole list, so the order is always 1..n. */
export async function moveDivision(divisionId: string, direction: -1 | 1): Promise<Ok<{ order: string[] }> | Fail> {
  const { supabase } = await getOrgContext();
  const d = await eventOf(supabase, divisionId);
  if (!d) return { ok: false, error: "That division was not found." };
  const { data: all } = await supabase.from("divisions").select("id").eq("event_id", d.event_id).order("sort_order").order("created_at");
  const ids = (all ?? []).map((r) => r.id);
  const from = ids.indexOf(divisionId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ids.length) return { ok: true, order: ids };
  ids.splice(to, 0, ids.splice(from, 1)[0]);
  for (const [i, id] of ids.entries()) {
    const { error } = await supabase.from("divisions").update({ sort_order: i + 1 }).eq("id", id);
    if (error) return { ok: false, error: explain(error.message) };
  }
  refresh(d.event_id);
  return { ok: true, order: ids };
}

export async function duplicateDivision(divisionId: string): Promise<Ok<{ id: string; name: string }> | Fail> {
  const { supabase } = await getOrgContext();
  const { data: src } = await supabase
    .from("divisions")
    .select("event_id, name, scoring_model_id, scoring_overrides, format_template_id, format_params, panel_id")
    .eq("id", divisionId)
    .maybeSingle();
  if (!src) return { ok: false, error: "That division was not found." };
  const { data: last } = await supabase.from("divisions").select("sort_order").eq("event_id", src.event_id).order("sort_order", { ascending: false }).limit(1);
  const name = `${src.name} (copy)`.slice(0, 60);
  const { data, error } = await supabase
    .from("divisions")
    .insert({
      event_id: src.event_id,
      name,
      sort_order: (last?.[0]?.sort_order ?? 0) + 1,
      scoring_model_id: src.scoring_model_id,
      scoring_overrides: src.scoring_overrides,
      format_template_id: src.format_template_id,
      format_params: src.format_params,
      panel_id: src.panel_id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: explain(error.message) };
  refresh(src.event_id);
  return { ok: true, id: data.id, name };
}

export async function deleteDivision(divisionId: string): Promise<Ok<object> | Fail> {
  const { supabase } = await getOrgContext();
  const d = await eventOf(supabase, divisionId);
  if (!d) return { ok: false, error: "That division was not found." };
  const { count } = await supabase.from("heats").select("id", { count: "exact", head: true }).eq("division_id", divisionId);
  if ((count ?? 0) > 0) return { ok: false, error: explain("DIVISION_HAS_HEATS") };
  const { error } = await supabase.from("divisions").delete().eq("id", divisionId);
  if (error) return { ok: false, error: explain(error.message) };
  refresh(d.event_id);
  return { ok: true };
}

const table = (kind: PresetKind) => (kind === "scoring_model" ? "scoring_models" : "format_templates");
// scoring_models and format_templates have the same columns, so one typed builder serves both.
const from = (supabase: Supabase, kind: PresetKind) => supabase.from(table(kind) as "scoring_models");

/** Validates and stores a division's preset choice plus its overrides. The rules actually used are checked before saving. */
export async function saveDivisionRules(input: { divisionId: string; kind: PresetKind; presetId: string | null; overrides: unknown }): Promise<Ok<object> | Fail> {
  const { supabase } = await getOrgContext();
  const d = await eventOf(supabase, input.divisionId);
  if (!d) return { ok: false, error: "That division was not found." };
  const overrides = input.overrides && typeof input.overrides === "object" && !Array.isArray(input.overrides) ? input.overrides : {};

  if (input.presetId) {
    const { data: base } = await from(supabase, input.kind).select("id, json").eq("id", input.presetId).maybeSingle();
    if (!base) return { ok: false, error: "That preset was not found." };
    const schema = input.kind === "scoring_model" ? ScoringModelSchema : FormatTemplateSchema;
    const baseParsed = schema.safeParse(base.json);
    if (!baseParsed.success) return { ok: false, error: "The chosen preset is not valid." };
    const merged = schema.safeParse(mergeOverrides(baseParsed.data, overrides, input.kind === "scoring_model" ? SCORING_NULLABLE : FORMAT_NULLABLE));
    if (!merged.success) {
      return { ok: false, error: "These settings are not valid together.", problems: Object.entries(issuesToMap(merged.error.issues)).map(([k, m]) => `${k.replace(/\./g, " › ")}: ${m}`) };
    }
  }

  const patch = input.kind === "scoring_model" ? { scoring_model_id: input.presetId, scoring_overrides: overrides as never } : { format_template_id: input.presetId, format_params: overrides as never };
  const { error } = await supabase.from("divisions").update(patch).eq("id", input.divisionId);
  if (error) return { ok: false, error: explain(error.message) };
  refresh(d.event_id);
  return { ok: true };
}

async function insertPreset(supabase: Supabase, kind: PresetKind, organisationId: string, key: string, name: string, version: number, json: Record<string, unknown>): Promise<Ok<{ row: PresetRow }> | Fail> {
  const { data, error } = await from(supabase, kind)
    .insert({ organisation_id: organisationId, key, name, version, json: json as never, content_hash: canonicalHash(json) })
    .select("id, key, name, version, organisation_id, json")
    .single();
  if (error || !data) return { ok: false, error: "The preset could not be saved. Nothing was changed; try again." };
  return { ok: true, row: data as PresetRow };
}

/**
 * Saves rules as an organisation preset. "new": a new preset. "version": a NEW VERSION of one of the organisation's own presets
 * (editing a saved preset never changes it in place: divisions that use the old version keep it; docs/06 §12 decision 8).
 */
export async function savePreset(input: { kind: PresetKind; organisationId: string; name: string; json: unknown; newVersionOfKey?: string }): Promise<Ok<{ row: PresetRow }> | Fail> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Give the preset a name (2 to 80 characters)." };
  const schema = input.kind === "scoring_model" ? ScoringModelSchema : FormatTemplateSchema;
  const parsed = schema.safeParse(input.json);
  if (!parsed.success) return { ok: false, error: "The settings are not valid yet, so they cannot be saved as a preset.", problems: Object.entries(issuesToMap(parsed.error.issues)).map(([k, m]) => `${k.replace(/\./g, " › ")}: ${m}`) };
  const { supabase } = await getOrgContext();
  const json = input.json as Record<string, unknown>;

  const { data: existing } = await from(supabase, input.kind).select("key, version, organisation_id").or(`organisation_id.is.null,organisation_id.eq.${input.organisationId}`);
  if (input.newVersionOfKey) {
    const mine = (existing ?? []).filter((r) => r.organisation_id === input.organisationId && r.key === input.newVersionOfKey);
    if (mine.length === 0) return { ok: false, error: "Only your own presets can get new versions. Use “Save as new preset” for built-in ones." };
    const version = Math.max(...mine.map((r) => r.version)) + 1;
    return insertPreset(supabase, input.kind, input.organisationId, input.newVersionOfKey, name, version, { ...json, id: input.newVersionOfKey, name, version });
  }
  const { key, json: prepared } = asNewPreset(json, name, (existing ?? []).map((r) => r.key));
  return insertPreset(supabase, input.kind, input.organisationId, key, name, 1, prepared);
}

/** Imports a JSON file as a NEW organisation preset (never overwrites). Readable problems come back as a list. */
export async function importPreset(input: { kind: PresetKind; organisationId: string; text: string }): Promise<Ok<{ row: PresetRow }> | Fail> {
  const result = input.kind === "scoring_model" ? importScoringModel(input.text) : importFormatTemplate(input.text);
  if (!result.ok) return { ok: false, error: "This file cannot be imported.", problems: result.problems };
  const { supabase } = await getOrgContext();
  const { data: existing } = await from(supabase, input.kind).select("key").or(`organisation_id.is.null,organisation_id.eq.${input.organisationId}`);
  const { key, json } = asNewPreset(result.json, result.name, (existing ?? []).map((r) => r.key));
  return insertPreset(supabase, input.kind, input.organisationId, key, result.name, 1, json);
}

export async function unlockRules(divisionId: string, reason: string): Promise<Ok<object> | Fail> {
  const { supabase } = await getOrgContext();
  const d = await eventOf(supabase, divisionId);
  if (!d) return { ok: false, error: "That division was not found." };
  const { error } = await supabase.rpc("unlock_division_rules", { p_division: divisionId, p_reason: reason });
  if (error) return { ok: false, error: explain(error.message) };
  refresh(d.event_id);
  return { ok: true };
}

