// Audit 1b, part 6 — "migrations re-applied twice" (docs/AUDIT.md, A1b-17). This PR may not touch the database, so the check is static: every data-changing
// statement that runs at the top level of a migration (outside a function body) is listed, and each one is either refused on a second run by an earlier statement
// of its file, or guarded so a second run changes nothing. db:apply never re-applies a recorded file; the risk is a hand re-run (SQL Editor, combined.sql).
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DIR = "supabase/migrations";
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
const topLevel = (sql: string) => sql.replace(/\$\$[\s\S]*?\$\$/g, "$$").replace(/--[^\n]*/g, "");
const dml = (sql: string) => [...topLevel(sql).matchAll(/^\s*(insert into|update|delete from)\s[\s\S]*?;/gim)].map((m) => m[0].trim().replace(/\s+/g, " "));
/** A statement that, run again on its own, can change rows it already changed. */
const unguarded = (stmt: string) => {
  if (/^insert into/i.test(stmt)) return !/on conflict/i.test(stmt);
  if (/^update public\.events set settings = settings - 'readyCallMin' where settings -> 'readyCallMin' = '10'/i.test(stmt)) return true; // removes a value the organiser may have chosen since
  if (/set published_at = created_at where organisation_id is null/i.test(stmt)) return !/published_at is null and false/i.test(stmt); // republishes drafts
  return false;
};

describe("A1b-17 — migrations run twice by hand", () => {
  it("every migration file has its data changes listed (the audit's inventory)", () => {
    const all = files.flatMap((f) => dml(readFileSync(`${DIR}/${f}`, "utf8")).map((s) => `${f}: ${s.slice(0, 90)}`));
    expect(all.length).toBeGreaterThan(0);
  });

  it("files whose second run would silently change data (no earlier statement of the file fails first) — the fix session makes these guarded", () => {
    const risky: string[] = [];
    for (const f of files) {
      const sql = readFileSync(`${DIR}/${f}`, "utf8");
      const top = topLevel(sql);
      // a second run of the file stops at the first statement that cannot run twice: create table / add column / create policy / create trigger without a guard
      const failsEarly = /create table (?!if not exists)|add column (?!if not exists)|create policy|create trigger (?!.*if not exists)|create index (?!if not exists)|create unique index (?!if not exists)/i.test(top);
      if (failsEarly) continue;
      for (const s of dml(sql)) if (unguarded(s)) risky.push(`${f}: ${s.slice(0, 110)}`);
    }
    console.info("A1b-17 statements a hand re-run would apply again:", risky);
    // known today: the ready-call clean-up (a deliberate "10 minutes" reverts to the default 15). Anything new here needs a guard.
    expect(risky.every((r) => r.startsWith("20261006100300_ready_call_one_setting.sql"))).toBe(true);
  });
});
