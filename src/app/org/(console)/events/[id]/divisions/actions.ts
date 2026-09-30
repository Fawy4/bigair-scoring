"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOrgContext } from "@/lib/org/context";
import { canonicalHash } from "@/lib/presets/plan";
import { asNewPreset, importFormatTemplate, importScoringModel, type PresetKind } from "@/lib/presets/io";
import type { PresetRow } from "@/lib/presets/options";
import { FormatTemplateSchema } from "@/lib/schemas/format-template";
import { IdentificationSchemeSchema } from "@/lib/schemas/identification";
import { ScoringModelSchema } from "@/lib/schemas/scoring-model";
import { FORMAT_NULLABLE, mergeOverrides, SCORING_NULLABLE } from "@/lib/scoring-ui/overrides";
import { issuesToMap } from "@/lib/form/path";
import { copy } from "@/lib/ui-copy";

const E = copy.divisions.errors;
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Fail = { ok: false; error: string; problems?: string[] };
type Ok<T> = { ok: true } & T;

const Name = z.string().trim().min(2, E.nameMin).max(60, E.nameMax);
const uuid = z.string().uuid();

/** Turns database error codes (from the Phase 3/4 functions and triggers) into plain sentences. */
function explain(message: string | undefined): string {
  if (!message) return E.failed;
  if (message.includes("RULES_LOCKED")) return E.rulesLocked;
  if (message.includes("DIVISION_HAS_HEATS")) return E.hasHeats;
  if (message.includes("REASON_REQUIRED")) return E.reason;
  if (message.includes("NOT_ALLOWED")) return E.notAllowed;
  return E.failed;
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
  if (!parsed.success || !uuid.safeParse(eventId).success) return { ok: false, error: parsed.success ? E.unknownEvent : parsed.error.issues[0].message };
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
  if (!d) return { ok: false, error: E.notFound };
  const { error } = await supabase.from("divisions").update({ name: parsed.data }).eq("id", divisionId);
  if (error) return { ok: false, error: explain(error.message) };
  refresh(d.event_id);
  return { ok: true };
}

/** Moves a division one place up (-1) or down (+1) and renumbers the whole list, so the order is always 1..n. */
export async function moveDivision(divisionId: string, direction: -1 | 1): Promise<Ok<{ order: string[] }> | Fail> {
  const { supabase } = await getOrgContext();
  const d = await eventOf(supabase, divisionId);
  if (!d) return { ok: false, error: E.notFound };
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
    .select("event_id, name, scoring_model_id, scoring_overrides, format_template_id, format_params, description, identification, trick_base")
    .eq("id", divisionId)
    .maybeSingle();
  if (!src) return { ok: false, error: E.notFound };
  const { data: last } = await supabase.from("divisions").select("sort_order").eq("event_id", src.event_id).order("sort_order", { ascending: false }).limit(1);
  const name = `${src.name}${copy.divisions.copySuffix}`.slice(0, 60);
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
      description: src.description,
      identification: src.identification,
      trick_base: src.trick_base,
    }) // the judges (panel) are not copied: each division has its own panel, chosen in the Officials step
    .select("id")
    .single();
  if (error) return { ok: false, error: explain(error.message) };
  refresh(src.event_id);
  return { ok: true, id: data.id, name };
}

export async function deleteDivision(divisionId: string): Promise<Ok<object> | Fail> {
  const { supabase } = await getOrgContext();
  const d = await eventOf(supabase, divisionId);
  if (!d) return { ok: false, error: E.notFound };
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
  if (!d) return { ok: false, error: E.notFound };
  const overrides = input.overrides && typeof input.overrides === "object" && !Array.isArray(input.overrides) ? input.overrides : {};

  if (input.presetId) {
    const { data: base } = await from(supabase, input.kind).select("id, json").eq("id", input.presetId).maybeSingle();
    if (!base) return { ok: false, error: E.presetNotFound };
    const schema = input.kind === "scoring_model" ? ScoringModelSchema : FormatTemplateSchema;
    const baseParsed = schema.safeParse(base.json);
    if (!baseParsed.success) return { ok: false, error: E.presetInvalid };
    const merged = schema.safeParse(mergeOverrides(baseParsed.data, overrides, input.kind === "scoring_model" ? SCORING_NULLABLE : FORMAT_NULLABLE));
    if (!merged.success) {
      return { ok: false, error: E.notValidTogether, problems: Object.entries(issuesToMap(merged.error.issues)).map(([k, m]) => `${k.replace(/\./g, " › ")}: ${m}`) };
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
  if (error || !data) return { ok: false, error: E.presetSaveFailed };
  return { ok: true, row: data as PresetRow };
}

/**
 * Saves rules as an organisation preset. "new": a new preset. "version": a NEW VERSION of one of the organisation's own presets
 * (editing a saved preset never changes it in place: divisions that use the old version keep it; docs/06 §12 decision 8).
 */
export async function savePreset(input: { kind: PresetKind; organisationId: string; name: string; json: unknown; newVersionOfKey?: string }): Promise<Ok<{ row: PresetRow }> | Fail> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) return { ok: false, error: E.presetName };
  const schema = input.kind === "scoring_model" ? ScoringModelSchema : FormatTemplateSchema;
  const parsed = schema.safeParse(input.json);
  if (!parsed.success) return { ok: false, error: E.presetNotValid, problems: Object.entries(issuesToMap(parsed.error.issues)).map(([k, m]) => `${k.replace(/\./g, " › ")}: ${m}`) };
  const { supabase } = await getOrgContext();
  const json = input.json as Record<string, unknown>;

  const { data: existing } = await from(supabase, input.kind).select("key, version, organisation_id").or(`organisation_id.is.null,organisation_id.eq.${input.organisationId}`);
  if (input.newVersionOfKey) {
    const mine = (existing ?? []).filter((r) => r.organisation_id === input.organisationId && r.key === input.newVersionOfKey);
    if (mine.length === 0) return { ok: false, error: E.onlyOwn };
    const version = Math.max(...mine.map((r) => r.version)) + 1;
    return insertPreset(supabase, input.kind, input.organisationId, input.newVersionOfKey, name, version, { ...json, id: input.newVersionOfKey, name, version });
  }
  const { key, json: prepared } = asNewPreset(json, name, (existing ?? []).map((r) => r.key));
  return insertPreset(supabase, input.kind, input.organisationId, key, name, 1, prepared);
}

/** Imports a JSON file as a NEW organisation preset (never overwrites). Readable problems come back as a list. */
export async function importPreset(input: { kind: PresetKind; organisationId: string; text: string }): Promise<Ok<{ row: PresetRow }> | Fail> {
  const result = input.kind === "scoring_model" ? importScoringModel(input.text) : importFormatTemplate(input.text);
  if (!result.ok) return { ok: false, error: E.cannotImport, problems: result.problems };
  const { supabase } = await getOrgContext();
  const { data: existing } = await from(supabase, input.kind).select("key").or(`organisation_id.is.null,organisation_id.eq.${input.organisationId}`);
  const { key, json } = asNewPreset(result.json, result.name, (existing ?? []).map((r) => r.key));
  return insertPreset(supabase, input.kind, input.organisationId, key, result.name, 1, json);
}

export async function unlockRules(divisionId: string, reason: string): Promise<Ok<object> | Fail> {
  const { supabase } = await getOrgContext();
  const d = await eventOf(supabase, divisionId);
  if (!d) return { ok: false, error: E.notFound };
  const { error } = await supabase.rpc("unlock_division_rules", { p_division: divisionId, p_reason: reason });
  if (error) return { ok: false, error: explain(error.message) };
  refresh(d.event_id);
  return { ok: true };
}


/** A division's own Rider label scheme, or null to go back to the event's. */
export async function saveDivisionIdentification(input: { divisionId: string; scheme: unknown | null; basedOn?: string }): Promise<Ok<object> | Fail> {
  const I = copy.divisions.identification.errors;
  if (!uuid.safeParse(input.divisionId).success) return { ok: false, error: E.notFound };
  let stored: { scheme: unknown; basedOn?: string } | null = null;
  if (input.scheme !== null) {
    const parsed = IdentificationSchemeSchema.safeParse(input.scheme);
    if (!parsed.success) return { ok: false, error: I.invalid };
    stored = { scheme: parsed.data, ...(input.basedOn ? { basedOn: input.basedOn } : {}) };
  }
  const { supabase } = await getOrgContext();
  const d = await eventOf(supabase, input.divisionId);
  if (!d) return { ok: false, error: E.notFound };
  const { data, error } = await supabase.from("divisions").update({ identification: stored as never }).eq("id", input.divisionId).select("id");
  if (error || !data?.length) return { ok: false, error: I.failed };
  refresh(d.event_id);
  return { ok: true };
}

/** The level description riders see on the registration page. */
export async function saveDivisionDescription(divisionId: string, text: string): Promise<Ok<object> | Fail> {
  if (!uuid.safeParse(divisionId).success) return { ok: false, error: E.notFound };
  const value = text.trim().slice(0, 300);
  const { supabase } = await getOrgContext();
  const d = await eventOf(supabase, divisionId);
  if (!d) return { ok: false, error: E.notFound };
  const { data, error } = await supabase.from("divisions").update({ description: value || null }).eq("id", divisionId).select("id");
  if (error || !data?.length) return { ok: false, error: E.failed };
  refresh(d.event_id);
  return { ok: true };
}
