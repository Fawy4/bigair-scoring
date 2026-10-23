import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TEST_SLUG_PATTERN } from "./organisation";

/**
 * The owner's rule (CL1): nothing is deleted from the live database, and every organisation a test or script creates is marked as test the moment it is created.
 * This file reads the test code itself (it never touches the database) and fails when either rule would be broken by a change.
 */
const ROOTS = ["tests", "e2e", "scripts"];
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name === "img") return [];
    return statSync(path).isDirectory() ? walk(path) : /\.(ts|mjs)$/.test(name) ? [path] : [];
  });
const files = ROOTS.flatMap(walk).filter((f) => f.replaceAll("\\", "/") !== "scripts/manual/error-notes.ts"); // the manual's sentences about purge_organisation are text, not a call

const DELETE = /purge_organisation|auth\.admin\.deleteUser|\.storage\.from\([^)]*\)\.remove\(|\.delete\(\)|"delete_event"|delete_event:|admin_delete_organisation|admin_delete_preset/g;
const deletesIn = (file: string): number => (readFileSync(file, "utf8").match(DELETE) ?? []).length;

/**
 * Every delete (and every write to a table real organisers or the owner see) that is still in the test code, with its reason and what switches it on.
 * Two flags, both off in a normal run (tests/live-guard.ts):
 *   D = TESTS_MAY_DELETE=1        S = TESTS_MAY_WRITE_SHARED=1        D+S = both
 * "needs" are the guard names the file must contain, so a test that is meant to be off really is. "refusal" means the test asks for a delete and expects the database to say
 * no: nothing is removed when it works, so it stays on. A number may go down (good), never up; a new file needs a new line here, which means the owner is told.
 * When the separate test database exists, the flags can be on there and this list shrinks to the refusals.
 */
type Entry = { max: number; flag: "D" | "S" | "D+S" | "refusal" | "mixed" | "script"; needs?: string[]; reason: string };
const ALLOWED: Record<string, Entry> = {
  "e2e/admin-releases.spec.ts": { max: 1, flag: "S", needs: ["OFF_UNLESS_SHARED"], reason: "ticks a check of the real current release and takes the tick back" },
  "e2e/admin.spec.ts": { max: 2, flag: "mixed", needs: ["OFF_UNLESS_DELETE", "OFF_UNLESS_SHARED", "OFF_UNLESS_BOTH", "MAY_WRITE_SHARED"], reason: "deletes an organisation (D), changes the platform settings and a system preset and puts them back (S, D+S)" },
  "e2e/cleanup.ts": { max: 1, flag: "S", reason: "removes a master trick base version; only the S specs record one, so it never runs otherwise" },
  "e2e/manual-shots.spec.ts": { max: 2, flag: "D+S", needs: ["OFF_UNLESS_BOTH"], reason: "the picture run writes the owner's feedback and release ticks and removes what it made" },
  "e2e/master-presets.spec.ts": { max: 2, flag: "D+S", needs: ["OFF_UNLESS_BOTH"], reason: "the owner's master presets screen: adds, retires and deletes a built-in, sets the default" },
  "e2e/run-order-missing-heat.spec.ts": { max: 1, flag: "D", needs: ["OFF_UNLESS_DELETE"], reason: "the scenario is a heat that has been deleted" },
  "e2e/seat-colours.spec.ts": { max: 1, flag: "D", needs: ["OFF_UNLESS_DELETE"], reason: "the scenario is a heat seat that has been emptied" },
  "e2e/trick-base-editor.spec.ts": { max: 1, flag: "S", needs: ["OFF_UNLESS_SHARED"], reason: "saves and publishes master trick base versions, removes them afterwards" },
  "e2e/trick-base-version.spec.ts": { max: 1, flag: "S", needs: ["OFF_UNLESS_SHARED"], reason: "saves a master trick base version, removes it afterwards" },
  "scripts/public-preview.ts": { max: 3, flag: "script", reason: "the owner's own `remove` command for a preview event he asked to make; never runs unless he runs it" },
  "tests/rls/audit-1b-integrity.test.ts": { max: 5, flag: "mixed", needs: ["OFF_UNLESS_DELETE"], reason: "one test removes a rider (D); three refusals (a rider with a seat or attempts, a seat with scores, a division with heats) stay on" },
  "tests/rls/audit-1b-security.test.ts": { max: 4, flag: "D", needs: ["OFF_UNLESS_DELETE"], reason: "deletes an event and clears the join-attempt counter between rate-limit steps" },
  "tests/rls/draw-timetable.test.ts": { max: 6, flag: "mixed", needs: ["OFF_UNLESS_DELETE"], reason: "deletes a draft event and a plan (D); the refusals for locked draws and started heats stay on" },
  "tests/rls/event-delete.test.ts": { max: 9, flag: "D", needs: ["OFF_UNLESS_DELETE"], reason: "this file tests the product's Delete event feature itself" },
  "tests/rls/heat-length.test.ts": { max: 2, flag: "D", needs: ["OFF_UNLESS_DELETE"], reason: "removes a run-order plan and the simulation control row" },
  "tests/rls/helpers.ts": { max: 1, flag: "S", needs: ["MAY_WRITE_SHARED"], reason: "removes the throwaway SYSTEM preset, which only the S test makes" },
  "tests/rls/live-head.test.ts": { max: 1, flag: "refusal", reason: "a head judge's decision cannot be deleted" },
  "tests/rls/live-publish.test.ts": { max: 1, flag: "D", needs: ["OFF_UNLESS_DELETE"], reason: "the knockout tests clear the rounds the helper made before saving their own draw" },
  "tests/rls/observer.test.ts": { max: 4, flag: "mixed", needs: ["OFF_UNLESS_DELETE"], reason: "removes two observer seats it just added (D); the observer's refused writes and the refused delete-event call stay on" },
  "tests/rls/organiser-access.test.ts": { max: 1, flag: "refusal", needs: ["OFF_UNLESS_DELETE"], reason: "an organiser writing to the members table is refused (stays on); the two tests that remove an organiser are D" },
  "tests/rls/platform.test.ts": { max: 14, flag: "D+S", needs: ["OFF_UNLESS_BOTH"], reason: "the platform owner's delete-organisation feature, append-only tables, platform settings and throwaway presets" },
  "tests/rls/preset-management.test.ts": { max: 13, flag: "D+S", needs: ["OFF_UNLESS_BOTH"], reason: "deleting presets, the default preset and a throwaway built-in preset" },
  "tests/rls/public-trick-names.test.ts": { max: 1, flag: "D", needs: ["OFF_UNLESS_DELETE"], reason: "resets one event-level trick base row before inserting it again" },
  "tests/rls/rerun.test.ts": { max: 1, flag: "D", needs: ["OFF_UNLESS_DELETE"], reason: "clears the rounds the helper made before saving its own draw" },
  "tests/rls/rider-sheet.test.ts": { max: 5, flag: "mixed", needs: ["OFF_UNLESS_DELETE"], reason: "one test removes a score and an attempt (D); a judge's refused delete of a pending score stays on" },
  "tests/rls/riders-officials.test.ts": { max: 3, flag: "mixed", needs: ["OFF_UNLESS_DELETE", "OFF_UNLESS_SHARED", "MAY_WRITE_SHARED"], reason: "the feedback notes are the owner's inbox (S) and one test removes an organisation (D); one refused delete of a rider stays on" },
  "tests/rls/rls.test.ts": { max: 17, flag: "mixed", needs: ["OFF_UNLESS_DELETE", "OFF_UNLESS_BOTH"], reason: "system presets (D+S), branding files and divisions (D); the refusals (nobody may delete results, audit lines or other organisations' rows) stay on" },
  "tests/rls/simulator.test.ts": { max: 4, flag: "D", needs: ["OFF_UNLESS_DELETE"], reason: "tests deleting and resetting a simulation copy (the product feature)" },
  "tests/rls/test-organisations.test.ts": { max: 3, flag: "refusal", reason: "asks purge_organisation about Arrow, Redbull and EKL (rolled back by the probe) and as an organiser, and must be refused each time" },
  "tests/rls/trick-base-editor.test.ts": { max: 1, flag: "S", needs: ["OFF_UNLESS_SHARED"], reason: "saves and publishes master trick base versions, removes them afterwards" },
};

describe("nothing is deleted from the hosted database by tests or scripts (CL1)", () => {
  it("every delete left in the test code is on the list with its reason, and none was added", () => {
    const found: Record<string, number> = {};
    for (const f of files) {
      const n = deletesIn(f);
      if (n > 0) found[f.replaceAll("\\", "/")] = n;
    }
    const unlisted = Object.keys(found).filter((f) => !ALLOWED[f]);
    expect(unlisted, "these files delete something and are not on the list in test-hygiene.test.ts").toEqual([]);
    for (const [f, n] of Object.entries(found)) expect(n, `${f} has more deletes than the list allows`).toBeLessThanOrEqual(ALLOWED[f].max);
  });

  it("every test that is meant to be off unless a flag is set really contains its guard, and the two flags are the ones the docs name", () => {
    for (const [f, e] of Object.entries(ALLOWED)) {
      const text = readFileSync(f, "utf8");
      for (const name of e.needs ?? []) expect(text, `${f} should contain ${name}`).toContain(name);
    }
    const guard = readFileSync("tests/live-guard.ts", "utf8");
    expect(guard).toContain('process.env.TESTS_MAY_DELETE === "1"');
    expect(guard).toContain('process.env.TESTS_MAY_WRITE_SHARED === "1"');
    expect(process.env.TESTS_MAY_DELETE, "a normal unit run has the flag off").toBeUndefined();
  });

  it("no test file that writes a table organisers or the owner see, or deletes on purpose, is left without a guard (system presets, master trick base, platform settings, release ticks, feedback)", () => {
    const SHARED_WRITE = /from\("(platform_settings|platform_default_presets|release_check_ticks|release_signoffs)"\)\s*\.(insert|upsert|update)|rpc\("(admin_save_platform_settings|admin_create_preset_version|admin_publish_preset|admin_set_default_preset|admin_trick_base_save|admin_trick_base_publish|admin_release_tick|admin_release_mark_tested|admin_set_proposal_status)"|from\("feedback_notes"\)\s*\.(insert|update)|organisation_id:\s*null/;
    for (const f of files) {
      if (f.includes("test-hygiene") || f.startsWith("scripts/")) continue;
      const text = readFileSync(f, "utf8");
      if (!SHARED_WRITE.test(text)) continue;
      expect(text, `${f} writes shared tables and has no OFF_UNLESS guard`).toMatch(/OFF_UNLESS_(SHARED|BOTH)|MAY_WRITE_SHARED/);
    }
  });

  it("the old clean-up that removed whole organisations, logins and uploaded files is gone", () => {
    for (const f of files) {
      if (f.includes("test-hygiene")) continue;
      const text = readFileSync(f, "utf8");
      if (/purge_organisation/.test(text)) expect(f, "only the owner's preview remover, the riders feature test and the refusal proof may still mention purge_organisation").toMatch(/public-preview\.ts|riders-officials\.test\.ts|test-organisations\.test\.ts/);
    }
    const cleanup = readFileSync("e2e/cleanup.ts", "utf8");
    expect(cleanup).not.toMatch(/purge_organisation|deleteUser|storage/);
    const organiser = readFileSync("e2e/organiser.ts", "utf8");
    expect(organiser).not.toMatch(/purge_organisation|deleteUser|\.remove\(/);
    const helpers = readFileSync("tests/rls/helpers.ts", "utf8");
    expect(helpers).not.toMatch(/purge_organisation|deleteUser/);
  });
});

describe("every organisation a test or script creates is marked as test when it is created (CL1)", () => {
  // inserts written in the tests, one per line: from("organisations").insert({ ... }) or the fixtures' ins("organisations", { ... })
  const INSERT = /(?:from\("organisations"\)\s*\.insert\(|ins\("organisations",\s*)([^\n]*)/g;
  const REAL_ORGANISATION_SCRIPTS = ["scripts/bootstrap-organiser.ts"];

  it("each such insert says is_test: true (one test leaves it out on purpose, marked label-left-out, to prove the database trigger)", () => {
    let seen = 0;
    for (const f of files) {
      if (REAL_ORGANISATION_SCRIPTS.includes(f) || f.includes("test-hygiene")) continue;
      for (const m of readFileSync(f, "utf8").matchAll(INSERT)) {
        seen++;
        expect(m[1], `${f}: ${m[1]}`).toMatch(/is_test:\s*true|label-left-out/);
      }
    }
    expect(seen).toBeGreaterThan(10);
  });

  it("an organisation made through a screen or function by a test has a web address the database labels as test", () => {
    const names = ["e2e-x", "rls-a-1", "plat-a-1", "evdel-x-1", "p4-a-1", "reset-x-1"];
    for (const n of names) expect(TEST_SLUG_PATTERN.test(n)).toBe(true);
    for (const real of ["arrow", "redbull", "ekl", "demo-org", "e2e", "preview-1a2b3c4d", "my-rls-club"]) expect(TEST_SLUG_PATTERN.test(real)).toBe(false);
  });

  it("the TypeScript pattern and the database trigger use the same list of prefixes", () => {
    const sql = readFileSync("supabase/migrations/20261113100000_cl1_test_label.sql", "utf8");
    const fromSql = /~ '\^\(([a-z0-9|]+)\)-'/.exec(sql)?.[1];
    expect(fromSql).toBeTruthy();
    expect(TEST_SLUG_PATTERN.source).toBe(`^(${fromSql})-`);
  });
});
