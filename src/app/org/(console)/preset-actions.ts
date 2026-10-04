"use server";

import { z } from "zod";
import { getDb } from "@/lib/org/context";
import { copy } from "@/lib/ui-copy";

const E = copy.presetManage.errors;
type Fail = { ok: false; error: string; usedBy?: string[] };
type Ok = { ok: true };

const Kind = z.enum(["scoring_model", "format_template"]);
const Input = z.object({ organisationId: z.string().uuid(), kind: Kind, key: z.string().min(1).max(120) });

function explain(message: string | undefined): string {
  if (!message) return E.failed;
  if (message.includes("PRESET_NAME")) return E.name;
  if (message.includes("PRESET_IS_DEFAULT")) return E.isDefault;
  if (message.includes("NOT_FOUND")) return E.notFound;
  if (message.includes("NOT_ALLOWED")) return E.notAllowed;
  return E.failed;
}

/** Renames one of the organisation's own presets (every version: the name only, never the settings). */
export async function renamePreset(input: { organisationId: string; kind: "scoring_model" | "format_template"; key: string; name: string }): Promise<Ok | Fail> {
  const parsed = Input.extend({ name: z.string() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: E.failed };
  const { supabase } = await getDb();
  const { error } = await supabase.rpc("rename_org_preset", { p_org: parsed.data.organisationId, p_kind: parsed.data.kind, p_key: parsed.data.key, p_name: parsed.data.name });
  return error ? { ok: false, error: explain(error.message) } : { ok: true };
}

/** Deletes one of the organisation's own presets, or answers which divisions use it. */
export async function deletePreset(input: { organisationId: string; kind: "scoring_model" | "format_template"; key: string }): Promise<Ok | Fail> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: E.failed };
  const { supabase } = await getDb();
  const { data, error } = await supabase.rpc("delete_org_preset", { p_org: parsed.data.organisationId, p_kind: parsed.data.kind, p_key: parsed.data.key });
  if (error) return { ok: false, error: explain(error.message) };
  const answer = data as { ok: boolean; usedBy: string[] } | null;
  if (answer && !answer.ok) return { ok: false, error: E.inUse(answer.usedBy.join(", ")), usedBy: answer.usedBy };
  return { ok: true };
}

/** Hides a built-in preset from this organisation's Load… menus, or shows it again. */
export async function setBuiltInHidden(input: { organisationId: string; kind: "scoring_model" | "format_template"; key: string; hidden: boolean }): Promise<Ok | Fail> {
  const parsed = Input.extend({ hidden: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: E.failed };
  const { supabase } = await getDb();
  const { error } = await supabase.rpc("hide_builtin_preset", { p_org: parsed.data.organisationId, p_kind: parsed.data.kind, p_key: parsed.data.key, p_hidden: parsed.data.hidden });
  return error ? { ok: false, error: explain(error.message) } : { ok: true };
}

/** Writes the optional reason of an "Update preset from this division" in the audit log (the update itself is the next version, saved by `savePreset`). */
export async function logPresetUpdate(input: { organisationId: string; kind: "scoring_model" | "format_template"; key: string; version: number; reason: string }): Promise<void> {
  const parsed = Input.extend({ version: z.number().int(), reason: z.string().max(500) }).safeParse(input);
  if (!parsed.success) return;
  const { supabase } = await getDb();
  await supabase.rpc("log_org_preset_update", { p_org: parsed.data.organisationId, p_kind: parsed.data.kind, p_key: parsed.data.key, p_version: parsed.data.version, p_reason: parsed.data.reason });
}
