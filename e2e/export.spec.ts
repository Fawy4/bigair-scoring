import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { BackupSchema } from "../src/lib/export-format/backup";
import { closePhones, expect, installSupabaseProxy, test } from "./base";
import { createPublicWorld, type PublicWorld } from "./public-world";

/**
 * Export 1 on a throwaway event (Arrow, EKL and Demo are never touched): Pro Men heat 1 and the Knockout's first heat are published, Pro Men heat 2 is under review.
 * The organiser downloads the results CSV (two heats; the third only with the draft box), opens the printable page (it carries the export time and its heat rows match the
 * public results page), and downloads one backup file with no PIN in it. The head judge has the results buttons on the laptop and nothing on a phone; judges,
 * spotters and observers never see a button, and every route refuses them.
 */
let w: PublicWorld;
const contexts: BrowserContext[] = [];
test.beforeEach(async () => {
  w = await createPublicWorld();
  // heat 2 of Pro Men is finished and waiting for the head judge's review
  await w.db.from("heats").update({ status: "under_review", ended_at: new Date().toISOString() }).eq("id", w.running);
});
test.afterEach(async () => {
  await closePhones(contexts);
  await w?.cleanup();
});

async function open(browser: Browser, viewport: { width: number; height: number }): Promise<Page> {
  const context = await browser.newContext({ viewport });
  contexts.push(context);
  await installSupabaseProxy(context);
  return context.newPage();
}

const readDownload = async (download: import("@playwright/test").Download) => readFileSync((await download.path())!, "utf8");
/** Rows of the heat table (everything before the first blank line), by header name. A trick name never holds a comma in this world, so a plain split is enough. */
function heatRows(csv: string): Array<Record<string, string>> {
  const lines = csv.replace(/^﻿/, "").split("\r\n");
  const end = lines.indexOf("");
  const head = lines[0].split(",");
  return lines.slice(1, end === -1 ? undefined : end).map((l) => Object.fromEntries(l.split(",").map((v, i) => [head[i], v])));
}

test("Download results gives the two published heats and not the one under review unless the draft box is ticked; the printable page matches the public page; the backup is one file", async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await open(browser, { width: 1280, height: 900 });
  await w.org.signIn(page, `/org/events/${w.eventId}`);
  await expect(page.getByTestId("export-card")).toBeVisible({ timeout: 60_000 });

  // what the event holds before: nothing may change because of the downloads
  const snapshot = async () => ({
    heats: (await w.db.from("heats").select("id, status, live_rev, updated_at").eq("event_id", w.eventId).order("id")).data,
    attempts: (await w.db.from("trick_attempts").select("id", { count: "exact", head: true }).eq("event_id", w.eventId)).count,
    scores: (await w.db.from("trick_scores").select("id", { count: "exact", head: true }).eq("event_id", w.eventId)).count,
    results: (await w.db.from("heat_results").select("id", { count: "exact", head: true }).eq("event_id", w.eventId)).count,
  });
  const before = await snapshot();

  // the results CSV: published heats only
  const [csvDownload] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-results").click()]);
  expect(csvDownload.suggestedFilename()).toMatch(new RegExp(`^${w.slug}-results-\\d{4}-\\d{2}-\\d{2}-\\d{4}\\.csv$`));
  const csv = await readDownload(csvDownload);
  expect(csv.startsWith("﻿")).toBe(true);
  const rows = heatRows(csv);
  const heatsInFile = new Set(rows.map((r) => `${r["Division"]}|${r["Round"]}|${r["Heat"]}`));
  expect(heatsInFile.size).toBe(2);
  expect(heatsInFile.has("Pro Men|R1|Heat 1")).toBe(true);
  expect(heatsInFile.has("Pro Men|R1|Heat 2")).toBe(false);
  expect(rows.every((r) => r["Draft"] === "")).toBe(true);
  const first = rows.find((r) => r["Division"] === "Pro Men" && r["Place in heat"] === "1")!;
  expect(first["Heat total"]).toBe("20.5");
  expect(first["Attempt 1 trick"]).toBe("Backroll");
  expect(first["Attempt 1 result"]).toBe("Landed");
  expect(first["Attempt 1 score"]).toBe("7");
  expect(first["Attempt 1 counted"]).toBe("Yes");
  expect(first["Attempt 4 result"]).toBe("Crashed");
  expect(csv).toContain("Ladder seats");

  // with the draft box: the heat under review comes in, labelled DRAFT
  await page.getByTestId("export-draft").check();
  const [draftDownload] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-results").click()]);
  const draftRows = heatRows(await readDownload(draftDownload));
  const draftHeats = new Set(draftRows.filter((r) => r["Draft"] === "DRAFT").map((r) => r["Heat"]));
  expect([...draftHeats]).toEqual(["Heat 2"]);
  expect(new Set(draftRows.map((r) => `${r["Division"]}|${r["Heat"]}`)).size).toBe(3);

  // the printable page: export time in the header; every published heat's rows are the public page's rows
  await page.getByTestId("export-draft").uncheck();
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.getByTestId("export-print").click()]);
  await expect(popup.getByTestId("results-print")).toBeVisible({ timeout: 60_000 });
  await expect(popup.getByTestId("print-header")).toContainText(`E2E Live ${w.org.run}`);
  await expect(popup.getByTestId("print-exported-at")).toContainText(/Exported \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
  await expect(popup.getByTestId("print-heat")).toHaveCount(2);
  await expect(popup.locator('[data-draft="true"]')).toHaveCount(0);
  const printed = await popup.locator(`[data-heat-id="${w.published}"] [data-testid="public-rider"]`).allInnerTexts();
  const pub = await open(browser, { width: 420, height: 900 });
  await pub.goto(`/e/${w.slug}/results?heat=${w.published}`);
  await expect(pub.getByTestId("heat-summary")).toBeVisible({ timeout: 60_000 });
  const publicRows = await pub.locator('[data-testid="heat-summary"] [data-testid="public-rider"]').allInnerTexts();
  expect(printed.length).toBe(4);
  expect(printed).toEqual(publicRows);

  // with the draft box the page carries the DRAFT word and watermark on the heat under review only
  const draftPage = await open(browser, { width: 1280, height: 900 });
  await w.org.signIn(draftPage, `/export/${w.eventId}/print?draft=1`);
  await expect(draftPage.getByTestId("print-heat")).toHaveCount(3, { timeout: 60_000 });
  await expect(draftPage.locator('[data-draft="true"]')).toHaveCount(1);
  await expect(draftPage.getByTestId("print-watermark")).toHaveCount(1);
  await expect(draftPage.getByTestId("print-draft-word")).toHaveText("DRAFT");

  // the backup: one file, the event in it, no PIN or hash anywhere
  const pins = { pin_hash: `$2a$06$${randomUUID().replace(/-/g, "")}`, pin_enc: `enc:${randomUUID()}`, qr_token_hash: `qr${randomUUID()}` };
  await w.db.from("judge_seats").update(pins).eq("id", w.seats.head.id);
  const [backupDownload] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-backup").click()]);
  expect(backupDownload.suggestedFilename()).toMatch(new RegExp(`^${w.slug}-backup-\\d{4}-\\d{2}-\\d{2}-\\d{4}\\.json$`));
  const text = await readDownload(backupDownload);
  const file = BackupSchema.parse(JSON.parse(text));
  expect(file.event.slug).toBe(w.slug);
  expect(file.divisions.map((d) => d.name)).toContain("Pro Men");
  expect(file.officials.map((s) => (s as unknown as { name: string }).name)).toContain("Head judge");
  expect(file.counts.heats).toBeGreaterThanOrEqual(3);
  for (const secret of Object.values(pins)) expect(text).not.toContain(secret);
  expect(text).not.toMatch(/pin_hash|pin_enc|qr_token_hash|join_pin_hash/);

  // nothing changed in the event, and the audit log says who exported what
  expect(await snapshot()).toEqual(before);
  const { data: audit } = await w.db.from("audit_log").select("action, actor_user_id, after").eq("event_id", w.eventId).in("action", ["results_exported", "backup_downloaded"]);
  expect(audit?.filter((a) => a.action === "results_exported").length).toBeGreaterThanOrEqual(4);
  expect(audit?.filter((a) => a.action === "backup_downloaded").length).toBe(1);
  expect(audit?.every((a) => (a.after as { by?: string }).by === w.org.email)).toBe(true);
});

test("the head judge has the results buttons on the laptop and nothing on a phone; judges, spotters and observers see neither button and every route refuses them", async ({ browser }) => {
  test.setTimeout(300_000);
  // an observer seat of its own
  const email = `e2e-${w.org.run}-observer@example.com`;
  const { data: u, error } = await w.db.auth.admin.createUser({ email, password: `Pw-${w.org.run}-obs`, email_confirm: true });
  if (error || !u.user) throw new Error(error?.message);
  const observerId = u.user.id;
  w.org.trackUser(observerId);
  await w.db.from("judge_seats").insert({ event_id: w.eventId, name: "Guest", role: "observer", scores: false, auth_user_id: observerId, status: "active", active: true });
  const signInObserver = async (page: Page, next: string) => {
    const { data } = await w.db.auth.admin.generateLink({ type: "magiclink", email });
    await page.goto(`/auth/confirm?token_hash=${(data as unknown as { properties: { hashed_token: string } }).properties.hashed_token}&type=magiclink&next=${encodeURIComponent(next)}`);
  };
  const base = `/export/${w.eventId}`;

  // the head judge, on a laptop: Download results and Open printable results; no backup, no draft box
  const laptop = await open(browser, { width: 1280, height: 900 });
  await w.signInAs(laptop, "head", `/head/${w.eventId}`);
  await expect(laptop.getByTestId("export-results")).toBeVisible({ timeout: 60_000 });
  await expect(laptop.getByTestId("export-print")).toBeVisible();
  await expect(laptop.getByTestId("export-backup")).toHaveCount(0);
  await expect(laptop.getByTestId("export-draft")).toHaveCount(0);
  const [download] = await Promise.all([laptop.waitForEvent("download"), laptop.getByTestId("export-results").click()]);
  expect(heatRows(await readDownload(download)).length).toBeGreaterThan(0);
  // the head judge may not take the backup or the draft copy
  expect((await laptop.request.get(`${base}/backup.json`)).status()).toBe(403);
  expect((await laptop.request.get(`${base}/results.csv?draft=1`)).status()).toBe(403);

  // on a phone the console has no export button at all
  const phone = await open(browser, { width: 390, height: 844 });
  await w.signInAs(phone, "head", `/head/${w.eventId}`);
  await expect(phone.getByTestId("details-toggle")).toBeVisible({ timeout: 60_000 });
  await expect(phone.getByTestId("export-buttons")).toHaveCount(0);

  // judge, spotter, observer: their own screens have neither button; each route says no
  for (const [who, screen] of [["j1", `/judge/${w.eventId}`], ["spotter", `/spot/${w.eventId}`], ["observer", `/observe/${w.eventId}`]] as const) {
    const page = await open(browser, { width: 1280, height: 900 });
    if (who === "observer") await signInObserver(page, screen);
    else await w.signInAs(page, who, screen);
    await expect(page.locator("body")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("export-buttons"), who).toHaveCount(0);
    await expect(page.getByTestId("export-results"), who).toHaveCount(0);
    await expect(page.getByTestId("export-backup"), who).toHaveCount(0);
    expect((await page.request.get(`${base}/results.csv`)).status(), `${who} csv`).toBe(403);
    expect((await page.request.get(`${base}/backup.json`)).status(), `${who} backup`).toBe(403);
    expect((await page.request.get(`${base}/print`)).status(), `${who} print`).toBe(404);
  }

  // the public: no button on any public page, and the routes want a sign-in
  const visitor = await open(browser, { width: 420, height: 900 });
  for (const path of ["", "/results", "/ladder", "/placings"]) {
    await visitor.goto(`/e/${w.slug}${path}`);
    await expect(visitor.getByTestId("public-site")).toBeVisible({ timeout: 60_000 });
    await expect(visitor.getByTestId("export-results")).toHaveCount(0);
  }
  expect((await visitor.request.get(`${base}/results.csv`)).status()).toBe(401);
  expect((await visitor.request.get(`${base}/backup.json`)).status()).toBe(401);
  expect((await visitor.request.get(`${base}/print`)).status()).toBe(404);
});
