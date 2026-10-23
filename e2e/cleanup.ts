import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

/**
 * Nothing a test makes is deleted from the hosted database (the owner's rule, CL1). Every organisation a test creates is marked as test the moment it is created
 * (organisations.is_test), so the public site and the default Organisations list never show it; its logins and files stay too. Every organisation and login a test
 * creates is still written to a ledger file for this run (`test-results/.e2e-ledger-<run>.jsonl`), so a run can be traced afterwards.
 * The single thing still removed is a master trick base version a test saved (trickVersionId): it has no organisation, so organisers of real organisations would see it.
 */
const DIR = "test-results";
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

/** Removes only the master trick base versions the run saved (global, live-affecting rows). Organisations, logins and files are kept. */
async function purge(entries: LedgerEntry[]): Promise<void> {
  const db = service();
  if (!db) return;
  for (const e of entries.filter((x) => x.trickVersionId)) {
    try {
      await db.from("trick_vocabularies").delete().eq("id", e.trickVersionId!).is("organisation_id", null).is("event_id", null);
    } catch {
      // one failure must never stop the rest
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

/** After the last test, pass or fail: removes the run's master trick base versions (see above) and the local ledger file. Nothing else is deleted. */
export async function purgeThisRun(): Promise<void> {
  const file = ledgerFile();
  if (!existsSync(file)) return;
  await purge(readLedger(file));
  unlinkSync(file);
}

/** Before a run: ledgers of killed runs only get their master trick base versions removed (as above); no organisation or login is deleted. */
export async function sweepStale(): Promise<void> {
  if (!existsSync(DIR)) return;
  for (const name of readdirSync(DIR).filter((n) => n.startsWith(".e2e-ledger-"))) {
    const file = join(DIR, name);
    if (file === ledgerFile()) continue;
    await purge(readLedger(file));
    unlinkSync(file);
  }
}
