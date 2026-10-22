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
 * The deletes that are still there, and why each cannot go. A number may go down (good), never up; a new file needs a new line here, which means the owner is told.
 * "refusal" = the test asks for a delete and expects the database to say no (nothing is removed when it works).
 */
const ALLOWED: Record<string, { max: number; reason: string }> = {
  "e2e/admin-releases.spec.ts": { max: 1, reason: "takes back the release tick it makes on the real current release, so the owner's checklist is not left ticked" },
  "e2e/admin.spec.ts": { max: 2, reason: "puts the platform settings back as they were (removes the keys the test added) and removes its throwaway system preset" },
  "e2e/cleanup.ts": { max: 1, reason: "removes the master trick base version a test saved: it belongs to no organisation, so organisers of real organisations would see it" },
  "e2e/manual-shots.spec.ts": { max: 2, reason: "removes the master trick base version and the release ticks the picture run makes (both visible to the owner)" },
  "e2e/master-presets.spec.ts": { max: 2, reason: "the test deletes a division as its scenario and removes a throwaway system preset organisers would see" },
  "e2e/run-order-missing-heat.spec.ts": { max: 1, reason: "the scenario under test is a heat that has been deleted" },
  "e2e/seat-colours.spec.ts": { max: 1, reason: "the scenario under test is a heat seat that has been emptied" },
  "e2e/trick-base-editor.spec.ts": { max: 1, reason: "removes the master trick base version the test saved (visible to organisers)" },
  "e2e/trick-base-version.spec.ts": { max: 1, reason: "removes the master trick base version the test saved (visible to organisers)" },
  "scripts/public-preview.ts": { max: 3, reason: "the owner's own `remove` command for a preview event he asked to make; never runs unless he runs it" },
  "tests/rls/audit-1b-concurrency.test.ts": { max: 1, reason: "refusal: asks for a delete while other writes race and expects the database to decide" },
  "tests/rls/audit-1b-integrity.test.ts": { max: 5, reason: "tests the rules for deleting a rider, a seat and a division (refused while they are in use, allowed otherwise)" },
  "tests/rls/audit-1b-security.test.ts": { max: 4, reason: "deletes an event to prove its seat stops working, and clears the join-attempt counter between rate-limit steps" },
  "tests/rls/draw-timetable.test.ts": { max: 6, reason: "refusals for locked draws and started heats, plus a test that a draft event and a run-order plan can be deleted" },
  "tests/rls/event-delete.test.ts": { max: 9, reason: "this file tests the product's Delete event feature itself" },
  "tests/rls/he1-heat-end.test.ts": { max: 1, reason: "refusal: a delete of a heat result is attempted and must fail" },
  "tests/rls/heat-length.test.ts": { max: 2, reason: "removes a run-order plan and the simulation control row as part of the scenario" },
  "tests/rls/helpers.ts": { max: 1, reason: "removes the throwaway SYSTEM preset (no organisation), which organisers of real organisations would otherwise see" },
  "tests/rls/live-head.test.ts": { max: 1, reason: "refusal: a head judge's decision cannot be deleted" },
  "tests/rls/live-publish.test.ts": { max: 1, reason: "deletes a round as part of the scenario" },
  "tests/rls/live-realtime.test.ts": { max: 1, reason: "refusal or scenario step on a live heat" },
  "tests/rls/live-spotter.test.ts": { max: 1, reason: "refusal: a spotter cannot delete attempts" },
  "tests/rls/observer.test.ts": { max: 4, reason: "refusals for the observer role, a call to the delete-event function that must be refused, and removal of two observer seats it just added" },
  "tests/rls/organiser-access.test.ts": { max: 1, reason: "tests that removing an organiser ends their access" },
  "tests/rls/platform.test.ts": { max: 14, reason: "tests the platform owner's delete-organisation feature and the tables that must stay append-only, and puts the platform settings and throwaway presets back" },
  "tests/rls/preset-management.test.ts": { max: 13, reason: "tests deleting presets (the owner's built-in delete feature) and removes its throwaway built-in preset (no organisation)" },
  "tests/rls/public-trick-names.test.ts": { max: 1, reason: "resets one throwaway row before inserting it again" },
  "tests/rls/rerun.test.ts": { max: 1, reason: "deletes a round as part of the scenario" },
  "tests/rls/rider-sheet.test.ts": { max: 5, reason: "scenario steps: removes a pending score, a score and an attempt to test what the rider sheet shows afterwards" },
  "tests/rls/riders-officials.test.ts": { max: 3, reason: "the owner's feedback note (visible in his inbox), the 'deleting an organisation deletes its notes' feature test, and one refusal" },
  "tests/rls/rls.test.ts": { max: 17, reason: "mostly refusals (nobody may delete results, audit lines, presets or divisions they do not own); a few delete throwaway presets and branding files the test uploaded" },
  "tests/rls/simulator.test.ts": { max: 4, reason: "tests deleting a simulation copy (the product feature) and its reset" },
  "tests/rls/test-organisations.test.ts": { max: 3, reason: "refusal: asks purge_organisation about Arrow, Redbull and EKL (rolled back by the probe) and as an organiser, and must be refused each time" },
  "tests/rls/trick-base-editor.test.ts": { max: 1, reason: "removes the master trick base versions the test saved (visible to organisers)" },
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
