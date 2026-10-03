import { readFileSync } from "node:fs";
import path from "node:path";
import { PRODUCT_VERSION } from "@/lib/product-version";
import type { createClient } from "@/lib/supabase/server";
import { copy } from "@/lib/ui-copy";
import { newestFirst, parseReleases, readReleaseStatus, releaseProgress, type Release, type ReleaseProgress, type ReleaseSignoff, type ReleaseTick } from "./releases";

/** docs/RELEASES.md, shipped with the server (next.config.ts traces it for the admin pages). */
export const RELEASES_FILE = path.join(process.cwd(), "docs", "RELEASES.md");

/** Every entry newest first, or null when the file cannot be read. */
export function loadReleases(): Release[] | null {
  try {
    return newestFirst(parseReleases(readFileSync(RELEASES_FILE, "utf8")));
  } catch {
    return null;
  }
}

type Client = Awaited<ReturnType<typeof createClient>>;

/** The ticks and sign-offs (platform admins only), or null when the database did not answer. */
export async function loadReleaseStatus(supabase: Client): Promise<{ ticks: ReleaseTick[]; signoffs: ReleaseSignoff[] } | null> {
  try {
    const { data, error } = await supabase.rpc("admin_release_status");
    if (error) return null;
    return readReleaseStatus(data);
  } catch {
    return null;
  }
}

/** "0.10.0 — 2 of 6 checks done" (or "— tested", "— no checks to tick", "— no entry in the releases file"). */
export function progressLine(p: ReleaseProgress): string {
  const c = copy.admin.releases;
  if (!p.hasEntry) return c.statusNoEntry(p.version);
  if (p.tested) return c.statusTested(p.version);
  if (p.total === 0) return c.statusNoChecks(p.version);
  return c.statusLine(p.version, p.done, p.total);
}

/** The current version's testing in one line, for the Health page and the admin home. Never throws. */
export async function currentReleaseLine(supabase: Client): Promise<{ line: string; progress: ReleaseProgress }> {
  const releases = loadReleases() ?? [];
  const status = (await loadReleaseStatus(supabase)) ?? { ticks: [], signoffs: [] };
  const progress = releaseProgress(PRODUCT_VERSION, releases, status.ticks, status.signoffs);
  return { line: progressLine(progress), progress };
}
