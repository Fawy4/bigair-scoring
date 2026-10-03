"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/platform/session";
import { loadReleases } from "@/lib/releases/load";
import { copy } from "@/lib/ui-copy";

type Result = { ok: true } | { ok: false; error: string };
const C = copy.admin.releases;

/** A database refusal code → its sentence. */
function refusal(message: string | undefined): Result {
  const code = Object.keys(C.codes).find((k) => message?.includes(k));
  return { ok: false, error: C.codes[code ?? "generic"] };
}

function refresh() {
  revalidatePath("/admin/releases");
  revalidatePath("/admin/health");
  revalidatePath("/admin");
}

/** The check as the releases file has it now: a tick is only stored for a check that is still in the file. */
function findCheck(version: string, key: string) {
  const entry = loadReleases()?.find((r) => r.version === version);
  return { entry, check: entry?.checks.find((c) => c.key === key) };
}

const TickInput = z.object({ version: z.string().max(20), key: z.string().max(16), ticked: z.boolean() });

/** Tick or untick one check of a version (saved at once, with who and when). Platform owner only; staff look. */
export async function tickReleaseCheck(input: { version: string; key: string; ticked: boolean }): Promise<Result> {
  const { supabase, role } = await requireAdmin();
  if (role !== "owner") return { ok: false, error: C.codes.NOT_ALLOWED };
  const parsed = TickInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: C.codes.INVALID_CHECK };
  const { entry, check } = findCheck(parsed.data.version, parsed.data.key);
  if (!entry) return { ok: false, error: C.codes.INVALID_VERSION };
  if (!check) return { ok: false, error: C.codes.INVALID_CHECK };
  const { error } = await supabase.rpc("admin_release_tick", { p_version: entry.version, p_key: check.key, p_text: check.text, p_ticked: parsed.data.ticked });
  if (error) return refusal(error.message);
  refresh();
  return { ok: true };
}

/** "Confirm version tested": refused by the database while one of the version's checks is not ticked. */
export async function markReleaseTested(input: { version: string }): Promise<Result> {
  const { supabase, role } = await requireAdmin();
  if (role !== "owner") return { ok: false, error: C.codes.NOT_ALLOWED };
  const version = z.string().max(20).safeParse(input.version);
  const entry = version.success ? loadReleases()?.find((r) => r.version === version.data) : undefined;
  if (!entry) return { ok: false, error: C.codes.INVALID_VERSION };
  if (entry.checks.length === 0) return { ok: false, error: C.codes.INVALID_CHECK };
  const { error } = await supabase.rpc("admin_release_mark_tested", { p_version: entry.version, p_keys: entry.checks.map((c) => c.key) });
  if (error) return refusal(error.message);
  refresh();
  return { ok: true };
}
