import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

/**
 * Test data never outlives a run. Every organisation and login a test creates is written to a ledger file for this run
 * (`test-results/.e2e-ledger-<run>.jsonl`). The global teardown empties it even when tests fail or time out; the next run's setup also
 * sweeps any ledger older than STALE_MIN minutes (a run that was killed) and any `e2e-` organisation or login older than that.
 */
const DIR = "test-results";
const STALE_MIN = 30;
export const service = () =>
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : null;

export interface LedgerEntry {
  orgSlug?: string;
  userId?: string;
  /** A master trick base version a test saved (the trick base editor tests); removed after the organisations, so no test event points at it. */
  trickVersionId?: string;
}

const ledgerFile = (runId = process.env.E2E_RUN_ID ?? "local") => join(DIR, `.e2e-ledger-${runId}.jsonl`);

/** Remember something a test created, before anything else can fail. */
export function record(entry: LedgerEntry): void {
  mkdirSync(DIR, { recursive: true });
  appendFileSync(ledgerFile(), `${JSON.stringify(entry)}\n`);
}

/** Removes every file under "<prefix>/" (also in sub-folders such as reg/) of the private buckets the app fills: rider photos, feedback screenshots, logos. */
export async function removeOrganisationFiles(db: NonNullable<ReturnType<typeof service>>, orgId: string): Promise<void> {
  for (const bucket of ["rider-photos", "feedback", "branding"]) {
    const walk = async (prefix: string): Promise<string[]> => {
      const { data } = await db.storage.from(bucket).list(prefix, { limit: 1000 });
      const paths: string[] = [];
      for (const o of data ?? []) {
        if (o.id) paths.push(`${prefix}/${o.name}`);
        else paths.push(...(await walk(`${prefix}/${o.name}`)));
      }
      return paths;
    };
    try {
      const paths = await walk(orgId);
      if (paths.length) await db.storage.from(bucket).remove(paths);
    } catch {
      // clean-up is best effort
    }
  }
}

async function purge(entries: LedgerEntry[]): Promise<void> {
  const db = service();
  if (!db) return;
  // master trick base versions last: first every throwaway event that may use them
  const sorted = [...entries.filter((e) => !e.trickVersionId), ...entries.filter((e) => e.trickVersionId)];
  for (const e of sorted) {
    try {
      if (e.orgSlug) {
        const { data: org } = await db.from("organisations").select("id").eq("slug", e.orgSlug).maybeSingle();
        if (org) {
          await removeOrganisationFiles(db, org.id);
          await db.rpc("purge_organisation", { p_org: org.id });
        }
      }
      if (e.userId) await db.auth.admin.deleteUser(e.userId);
      if (e.trickVersionId) await db.from("trick_vocabularies").delete().eq("id", e.trickVersionId).is("organisation_id", null).is("event_id", null);
    } catch {
      // one failure must never stop the rest of the clean-up
    }
  }
}

function readLedger(file: string): LedgerEntry[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as LedgerEntry];
      } catch {
        return [];
      }
    });
}

/** Remove everything this run created (global teardown: runs after the last test, pass or fail). */
export async function purgeThisRun(): Promise<void> {
  const file = ledgerFile();
  if (!existsSync(file)) return;
  await purge(readLedger(file));
  unlinkSync(file);
}

/** Remove what killed runs left behind: old ledgers, and `e2e-` organisations and logins older than STALE_MIN minutes. */
export async function sweepStale(): Promise<void> {
  const cutoff = Date.now() - STALE_MIN * 60_000;
  if (existsSync(DIR)) {
    for (const name of readdirSync(DIR).filter((n) => n.startsWith(".e2e-ledger-"))) {
      const file = join(DIR, name);
      if (statSync(file).mtimeMs < cutoff) {
        await purge(readLedger(file));
        unlinkSync(file);
      }
    }
  }
  const db = service();
  if (!db) return;
  try {
    const { data: orgs } = await db.from("organisations").select("slug").like("slug", "e2e-%").lt("created_at", new Date(cutoff).toISOString());
    await purge((orgs ?? []).map((o) => ({ orgSlug: o.slug })));
    const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
    const stale = (users?.users ?? []).filter((u) => /^e2e-.*@example\.com$/.test(u.email ?? "") && new Date(u.created_at).getTime() < cutoff);
    await purge(stale.map((u) => ({ userId: u.id })));
  } catch {
    // sweeping is best effort
  }
}
