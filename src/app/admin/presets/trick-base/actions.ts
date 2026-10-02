"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/platform/session";
import { canonicalHash } from "@/lib/presets/plan";
import type { Json } from "@/lib/supabase/database.types";
import { MASTER_VOCABULARY_KEY } from "@/lib/org/trick-vocabulary";
import type { BuiltInFamily, VocabularyJson } from "@/lib/trick-base";
import { diffModels, KEY_PATTERN, publishedIds, toModel, toVocabulary, validateModel, type MasterBlock } from "@/lib/trick-base/master";
import { copy } from "@/lib/ui-copy";

type Fail = { ok: false; error: string; errors?: string[] };
const C = copy.trickEditor;
const PATH = "/admin/presets/trick-base";

/** A database refusal code → its sentence. */
function refusal(message: string | undefined): Fail {
  const code = Object.keys(C.codes).find((k) => message?.includes(k));
  return { ok: false, error: C.codes[code ?? "generic"] };
}

interface VersionRow {
  id: string;
  version: number;
  json: VocabularyJson;
  published_at: string | null;
  content_hash: string;
}

/** Every master version (drafts included), newest first. The caller is a platform admin, so row security lets drafts through. */
async function versions(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"]): Promise<VersionRow[]> {
  const { data } = await supabase.from("trick_vocabularies").select("id, version, json, published_at, content_hash").is("organisation_id", null).is("event_id", null).eq("key", MASTER_VOCABULARY_KEY).order("version", { ascending: false });
  return (data ?? []) as unknown as VersionRow[];
}

const published = (rows: VersionRow[]) => publishedIds(rows.filter((r) => r.published_at).map((r) => r.json));

/** Checks a draft against the version it started from and every published version, then saves it as a new draft version (or nothing when unchanged). */
async function saveChecked(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], rows: VersionRow[], next: VocabularyJson, baseVersion: number): Promise<{ ok: true; version: number; created: boolean } | Fail> {
  const base = rows.find((r) => r.version === baseVersion);
  const model = toModel(next);
  const errors = validateModel(model, published(rows), base ? toModel(base.json) : undefined);
  if (errors.length) return { ok: false, error: errors[0], errors };
  const json = toVocabulary(model);
  const { data, error } = await supabase.rpc("admin_trick_base_save", { p_json: json as unknown as Json, p_hash: canonicalHash(json), p_base_version: baseVersion });
  if (error) return refusal(error.message);
  const r = data as { version: number; created: boolean };
  revalidatePath(PATH);
  return { ok: true, version: r.version, created: r.created };
}

/** "Save as a new draft": every save is a new version that customers do not see until it is published. Owner only. */
export async function saveMasterTrickBase(input: { json: unknown; baseVersion: number }): Promise<{ ok: true; version: number; created: boolean } | Fail> {
  const { supabase, role } = await requireAdmin();
  if (role !== "owner") return { ok: false, error: C.codes.NOT_ALLOWED };
  const parsed = z.object({ json: z.record(z.string(), z.unknown()), baseVersion: z.number().int().min(0) }).safeParse(input);
  if (!parsed.success || !Array.isArray(parsed.data.json.baseTricks) || !Array.isArray(parsed.data.json.modifiers)) return { ok: false, error: C.codes.INVALID_JSON };
  const rows = await versions(supabase);
  return saveChecked(supabase, rows, parsed.data.json as unknown as VocabularyJson, parsed.data.baseVersion);
}

/** "Publish to all customers": the newest draft becomes the version new events start from, with the diff in words stored beside it. Owner only. */
export async function publishMasterTrickBase(input: { id: string }): Promise<{ ok: true; version: number; summary: string } | Fail> {
  const { supabase, role } = await requireAdmin();
  if (role !== "owner") return { ok: false, error: C.codes.NOT_ALLOWED };
  if (!z.string().uuid().safeParse(input.id).success) return { ok: false, error: C.codes.NOT_FOUND };
  const rows = await versions(supabase);
  const draft = rows.find((r) => r.id === input.id);
  if (!draft) return { ok: false, error: C.codes.NOT_FOUND };
  const live = rows.find((r) => r.published_at);
  const summary = live ? diffModels(toModel(live.json), toModel(draft.json)).summary : "";
  const { data, error } = await supabase.rpc("admin_trick_base_publish", { p_id: input.id, p_summary: summary });
  if (error) return refusal(error.message);
  revalidatePath(PATH);
  revalidatePath("/org", "layout");
  return { ok: true, version: data as number, summary };
}

const ProposalRef = z.object({ eventId: z.string().uuid(), family: z.enum(["direction", "multiplier", "base", "addon", "grab_landing"]), key: z.string().regex(KEY_PATTERN) });

/**
 * Accept a proposal into the master base: the owner may first change its name and aliases and choose the family it is shown in. It goes into a new draft
 * (published with the next "Publish to all customers"); the block keeps its key, so the event's own block and the master one are the same block.
 */
export async function acceptTrickProposal(input: { eventId: string; family: string; key: string; label: string; aliases: string[]; shownIn: string; category: string | null; baseVersion: number }): Promise<{ ok: true; version: number } | Fail> {
  const { supabase, role } = await requireAdmin();
  if (role !== "owner") return { ok: false, error: C.codes.NOT_ALLOWED };
  const ref = ProposalRef.safeParse(input);
  const rest = z.object({ label: z.string().max(40), aliases: z.array(z.string().max(60)).max(30), shownIn: z.string().max(60), category: z.string().max(40).nullable(), baseVersion: z.number().int().min(1) }).safeParse(input);
  if (!ref.success || !rest.success) return { ok: false, error: C.codes.generic };
  const { data: list } = await supabase.rpc("admin_trick_proposals");
  const proposal = (list ?? []).find((p) => p.event_id === ref.data.eventId && p.family === ref.data.family && p.key === ref.data.key);
  if (!proposal) return { ok: false, error: C.codes.NOT_FOUND };

  const rows = await versions(supabase);
  const working = rows.find((r) => r.version === rest.data.baseVersion);
  if (!working || rows[0].version !== working.version) return { ok: false, error: C.codes.TRICK_BASE_STALE };
  const model = toModel(working.json);
  const home = ref.data.family as BuiltInFamily;
  const id = `${home}:${ref.data.key}`;
  if (model.blocks[id]) return { ok: false, error: C.proposals.clash };
  const fixed = home === "direction" || home === "multiplier";
  const target = model.families.find((f) => f.key === rest.data.shownIn && (fixed ? f.key === home : f.key !== "direction" && f.key !== "multiplier")) ?? model.families.find((f) => f.key === home)!;
  const block: MasterBlock = {
    id,
    home,
    key: ref.data.key,
    label: rest.data.label.trim().replace(/\s+/g, " "),
    aliases: [...new Set(rest.data.aliases.map((a) => a.trim()).filter(Boolean))],
    category: fixed ? null : rest.data.category,
    takesMultiplier: home === "base",
    rotation: "none",
    defaultOn: true,
    retired: false,
    extra: {},
  };
  const next = { ...model, blocks: { ...model.blocks, [id]: block }, families: model.families.map((f) => (f.key === target.key ? { ...f, blocks: [...f.blocks, id] } : f)) };
  const saved = await saveChecked(supabase, rows, toVocabulary(next), working.version);
  if (!saved.ok) return saved;
  const marked = await supabase.rpc("admin_set_proposal_status", { p_event: ref.data.eventId, p_family: ref.data.family, p_key: ref.data.key, p_status: "accepted" });
  if (marked.error) return refusal(marked.error.message);
  return { ok: true, version: saved.version };
}

/** Dismiss a proposal with a reason the organiser sees; the block stays in that event only. Owner only. */
export async function dismissTrickProposal(input: { eventId: string; family: string; key: string; reason: string }): Promise<{ ok: true } | Fail> {
  const { supabase, role } = await requireAdmin();
  if (role !== "owner") return { ok: false, error: C.codes.NOT_ALLOWED };
  const ref = ProposalRef.safeParse(input);
  const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 300) : "";
  if (!ref.success) return { ok: false, error: C.codes.generic };
  if (!reason) return { ok: false, error: C.codes.REASON_REQUIRED };
  const { error } = await supabase.rpc("admin_set_proposal_status", { p_event: ref.data.eventId, p_family: ref.data.family, p_key: ref.data.key, p_status: "declined", p_reason: reason });
  if (error) return refusal(error.message);
  revalidatePath(PATH);
  return { ok: true };
}
