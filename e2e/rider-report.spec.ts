import { test, expect } from "./base";
import { createReportWorld, type ReportWorld } from "./report-world";

// RA1: Rider reports. A throwaway event with made-up riders. Off by default; the organiser's preview; after each heat; when the event is complete; a rider under 18; what the
// page shows (names from the event, published scores only, never a judge's score); 390 px with no sideways scroll; its own Day / Dark switch.
test.describe.configure({ mode: "serial" });
let w: ReportWorld;
test.beforeAll(async () => {
  test.setTimeout(300_000);
  w = await createReportWorld({ setting: "off" });
});
test.afterAll(async () => {
  await w?.cleanup();
});
const riderUrl = (id: string) => `/e/${w.slug}/riders/${id}`;
const reportUrl = (id: string) => `${riderUrl(id)}/report`;

test("Off (the default of every event): the rider page has no link, and the report address is not available", async ({ page, request }) => {
  test.setTimeout(120_000);
  const { data } = await w.db.from("events").select("settings").eq("id", w.eventId).single();
  expect((data!.settings as { riderReports?: string }).riderReports).toBe("off");
  await page.goto(riderUrl(w.entry("Ana")));
  await expect(page.getByTestId("rider-card")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("open-report")).toHaveCount(0);
  expect((await request.get(reportUrl(w.entry("Ana")))).status()).toBe(404);
});

test("the organiser's preview works while it is Off, says so, and the public still cannot read it", async ({ page, request }) => {
  test.setTimeout(180_000);
  await w.org.signIn(page, `/org/events/${w.eventId}/event`);
  await expect(page.getByTestId("event-panel")).toBeVisible({ timeout: 60_000 });
  await page.goto(`${reportUrl(w.entry("Ana"))}?preview=1`);
  await expect(page.getByTestId("report-preview-banner")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("report-name")).toContainText("Ana");
  expect((await request.get(`${reportUrl(w.entry("Ana"))}?preview=1`)).status()).toBe(404);
});

test("Event step: Rider reports sits in the Public page card with its three choices, is saved, and offers the preview", async ({ page }) => {
  test.setTimeout(240_000);
  await w.org.signIn(page, `/org/events/${w.eventId}/event`);
  await expect(page.getByTestId("event-panel")).toBeVisible({ timeout: 60_000 });
  const toggle = page.getByTestId("advanced-toggle");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  const card = page.getByTestId("public-page-settings");
  await expect(card).toBeVisible({ timeout: 15_000 });
  const group = card.getByTestId("rider-reports");
  await expect(group).toContainText("Off");
  await expect(group).toContainText("After each heat");
  await expect(group).toContainText("When the event is complete");
  await expect(card.getByTestId("rider-reports-off")).toBeChecked();
  await expect(card.getByTestId("rider-reports-line")).toContainText("trick names, sides and times");
  await card.getByTestId("rider-reports-after_heat").check();
  await page.getByRole("button", { name: "Save event" }).click();
  await expect.poll(async () => ((await w.db.from("events").select("settings").eq("id", w.eventId).single()).data?.settings as { riderReports?: string }).riderReports, { timeout: 30_000 }).toBe("after_heat");
  await card.getByTestId("rider-reports-pick").selectOption(w.entry("Ben"));
  await expect(card.getByTestId("rider-reports-open")).toHaveAttribute("href", `${reportUrl(w.entry("Ben"))}?preview=1`);
});

test("After each heat: the rider page offers the report, which shows the tiles, path, takeaways and every heat, with the event's own words and only published scores", async ({ page }) => {
  test.setTimeout(240_000);
  await w.setting("after_heat");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(riderUrl(w.entry("Ana")));
  await expect(page.getByTestId("open-report")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("open-report").click();
  await expect(page.getByTestId("rider-report")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("report-name")).toContainText("Ana");
  await expect(page.getByTestId("report-place")).toBeVisible();
  await expect(page.getByTestId("path-step").first()).toBeVisible();
  await expect(page.getByTestId("report-tiles").locator(".tile")).toHaveCount(13);
  await expect(page.getByTestId("report-heat").first()).toBeVisible();
  const heats = await page.getByTestId("report-heat").count();
  expect(heats).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId("heat-timeline")).toHaveCount(heats);
  await expect(page.getByTestId("field-average-line").first()).toBeAttached();
  const body = await page.locator("body").innerText();
  // the event's words: the score is "Impression", the sides In / Out
  expect(body).toContain("Impression");
  expect(body).toMatch(/\b(IN|OUT)\b|In|Out/);
  expect(body).not.toContain("Variety");
  // trick names are there although the division shows numbers only
  expect(body).toMatch(/Backroll|Frontroll|Kiteloop|Megaloop|dangle/);
  // never a judge's score or a judge
  for (const bad of ["J1", "J2", "Judge", "Missed", "outlier"]) expect(body).not.toContain(bad);
  // the stored judge scores of the sample (9.9, 1.1 and 9.8) stand alone as numbers nowhere on the page
  expect(body).not.toMatch(/(?<![\d.])(9\.9|1\.1|9\.8)(?![\d])/);
  // My notes: three boxes, and only the true line about them
  await expect(page.locator(".report textarea")).toHaveCount(3);
  expect(body).toContain("Saved on this phone only. Come back to this report on the same phone and your notes are still here.");
  expect(body).not.toContain("Private to you");
  expect(body).not.toContain("Next time, your report opens");
  expect(body).not.toContain("draft");
  // no sideways scroll at 390 px
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("My notes are kept on this phone: type in a box, reload, the words are still there; another rider's report has its own", async ({ page }) => {
  test.setTimeout(180_000);
  await w.setting("after_heat");
  const seen: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET") seen.push(`${r.method()} ${r.url()}`);
  });
  await page.goto(reportUrl(w.entry("Ana")));
  const well = page.getByTestId("notes-well");
  await expect(well).toBeVisible({ timeout: 60_000 });
  await expect(well).toHaveAttribute("placeholder", "Write a few words…");
  await well.fill("Two clean loops, good wind");
  await page.getByTestId("notes-goal").fill("Land a handle pass");
  await page.reload();
  await expect(page.getByTestId("notes-well")).toHaveValue("Two clean loops, good wind", { timeout: 60_000 });
  await expect(page.getByTestId("notes-goal")).toHaveValue("Land a handle pass");
  await expect(page.getByTestId("notes-work")).toHaveValue("");
  // never sent anywhere: typing made no request that carries them
  expect(seen.filter((x) => x.includes("Two clean loops") || x.includes("handle pass"))).toEqual([]);
  // the stored text is in this browser only, under the report's own key
  const keys = await page.evaluate(() => Object.keys(window.localStorage).filter((k) => k.startsWith("sendbook.report-notes.")));
  expect(keys).toEqual([`sendbook.report-notes.${w.slug}.${w.entry("Ana")}`]);
  // another rider's report starts empty
  await page.goto(reportUrl(w.entry("Ben")));
  await expect(page.getByTestId("notes-well")).toHaveValue("", { timeout: 60_000 });
});

test("when the browser blocks storage the boxes still work, they are just not kept", async ({ browser }) => {
  test.setTimeout(180_000);
  await w.setting("after_heat");
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    const deny = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    Object.defineProperty(window, "localStorage", { get: deny });
  });
  const page = await ctx.newPage();
  await page.goto(reportUrl(w.entry("Ana")));
  const box = page.getByTestId("notes-work");
  await expect(box).toBeVisible({ timeout: 60_000 });
  await box.fill("kept only while this page is open");
  await expect(box).toHaveValue("kept only while this page is open");
  await ctx.close();
});

test("'so far' shows only while a heat of the division is not published; once all are published it is gone, in the top card, the highlights and the field figures", async ({ page }) => {
  test.setTimeout(240_000);
  await w.setting("after_heat", "live");
  const other = w.ladder.heats["R1-H2"];
  await w.db.from("heats").update({ status: "ended" }).eq("id", other);
  try {
    await page.goto(reportUrl(w.entry("Ana")));
    await expect(page.getByTestId("report-so-far")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("so-far-field")).toBeVisible();
    if (await page.getByTestId("report-highlights").count()) await expect(page.getByTestId("so-far-highlights")).toBeVisible();
  } finally {
    await w.db.from("heats").update({ status: "published" }).eq("id", other);
  }
  await page.goto(reportUrl(w.entry("Ana")));
  await expect(page.getByTestId("rider-report")).toBeVisible({ timeout: 60_000 });
  // every heat is published now, the event is still "live" (not marked complete)
  await expect(page.getByTestId("report-so-far")).toHaveCount(0);
  await expect(page.getByTestId("so-far-field")).toHaveCount(0);
  await expect(page.getByTestId("so-far-highlights")).toHaveCount(0);
});

test("the totals on the report are the published totals of the heats", async ({ page }) => {
  test.setTimeout(180_000);
  await w.setting("after_heat");
  const ana = w.entry("Ana");
  const { data: rows } = await w.db.from("heat_results").select("heat_id, total, version").eq("entry_id", ana).eq("version", 2);
  expect((rows ?? []).length).toBeGreaterThanOrEqual(2);
  await page.goto(reportUrl(ana));
  await expect(page.getByTestId("rider-report")).toBeVisible({ timeout: 60_000 });
  const totals = await page.getByTestId("heat-total").allInnerTexts();
  for (const r of rows ?? []) expect(totals.some((t) => t.includes(`${Number(r.total).toFixed(2)} `))).toBe(true);
});

test("its own Day / Dark switch, at the top of the report, changes the report", async ({ page }) => {
  test.setTimeout(180_000);
  await w.setting("after_heat");
  await page.goto(reportUrl(w.entry("Ana")));
  const root = page.getByTestId("rider-report");
  await expect(root).toBeVisible({ timeout: 60_000 });
  await expect(root).not.toHaveAttribute("data-theme", "dark");
  const ink = () => root.evaluate((el) => getComputedStyle(el).color);
  const day = await ink();
  await page.getByTestId("report-theme").getByRole("button", { name: "Dark" }).click();
  await expect(root).toHaveAttribute("data-theme", "dark");
  expect(await ink()).not.toBe(day);
  await page.getByTestId("report-theme").getByRole("button", { name: "Daylight" }).click();
  await expect(root).not.toHaveAttribute("data-theme", "dark");
});

test("the rider picker lists the riders whose report is open, with their place, and opens the one chosen", async ({ page }) => {
  test.setTimeout(180_000);
  await w.setting("after_heat");
  await page.goto(reportUrl(w.entry("Ana")));
  const picker = page.getByTestId("rider-picker");
  await expect(picker).toBeVisible({ timeout: 60_000 });
  const options = await picker.locator("option").allInnerTexts();
  expect(options.length).toBeGreaterThanOrEqual(2);
  expect(options.some((o) => /Ana/.test(o) && /(1st|2nd|3rd|\dth|reached)/.test(o))).toBe(true);
  // a rider under 18 is not in the list
  const minorFirst = w.ladder.names[w.ladder.entries.indexOf(w.minor)].split(" ")[0];
  expect(options.some((o) => o.startsWith(minorFirst))).toBe(false);
  await picker.selectOption(w.entry("Ben"));
  await expect(page).toHaveURL(new RegExp(`${w.entry("Ben")}/report`), { timeout: 30_000 });
  await expect(page.getByTestId("report-name")).toContainText("Ben");
});

test("a rider under 18 has no report and no link; nothing says why", async ({ page, request }) => {
  test.setTimeout(120_000);
  await w.setting("after_heat");
  await page.goto(riderUrl(w.minor));
  await expect(page.getByTestId("rider-card")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("open-report")).toHaveCount(0);
  expect((await request.get(reportUrl(w.minor))).status()).toBe(404);
});

test("When the event is complete: nothing until the event is marked complete", async ({ page, request }) => {
  test.setTimeout(180_000);
  await w.setting("after_event", "live");
  expect((await request.get(reportUrl(w.entry("Ana")))).status()).toBe(404);
  await w.setting("after_event", "complete");
  await page.goto(reportUrl(w.entry("Ana")));
  await expect(page.getByTestId("rider-report")).toBeVisible({ timeout: 60_000 });
  // complete: the report no longer says "so far"
  await expect(page.getByTestId("report-so-far")).toHaveCount(0);
  await w.setting("after_heat", "live");
});
