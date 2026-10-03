import { expect, test } from "./base";
import { createOrganiser } from "./organiser";

// Organiser and admin screens use the available width: the content area up to 1400 px (centred beyond that), tables and cards at the full content width, only reading text
// (help sentences, explanations) at about 70 characters a line; nothing changes on the phone. A throwaway organisation (platform owner login for /admin).
type Organiser = Awaited<ReturnType<typeof createOrganiser>>;
let org: Organiser;
let eventId = "";
test.beforeAll(async () => {
  org = await createOrganiser({ platformAdmin: "owner" });
  const { data: ev } = await org.db
    .from("events")
    .insert({ organisation_id: org.orgId, name: `E2E Wide ${org.run}`, slug: `e2e-wide-${org.run}`, status: "published", timezone: "Africa/Cairo", start_date: "2026-10-10", end_date: "2026-10-11", settings: {} })
    .select("id")
    .single();
  eventId = ev!.id;
});
test.afterAll(async () => {
  await org?.cleanup();
});

const widthOf = (page: import("@playwright/test").Page, testId: string) => page.getByTestId(testId).evaluate((el) => Math.round(el.getBoundingClientRect().width));

test("laptop 1440: the content area is as wide as the window allows; the Officials step and the Arrow-style organisation table use the full width", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await org.signIn(page, `/org/events/${eventId}/officials`);
  await expect(page.getByTestId("org-main")).toBeVisible({ timeout: 60_000 });
  // the rail is 240 px: the content area is the rest of the window (under 1400), with its padding
  expect(await widthOf(page, "org-main")).toBeGreaterThanOrEqual(1190);
  // the page's own column is the full content width (it was capped at 1024 px)
  const inner = await page.getByTestId("org-main").evaluate((el) => Math.round((el.querySelector(":scope > main, :scope > div")?.getBoundingClientRect().width ?? 0)));
  expect(inner).toBeGreaterThanOrEqual(1100);
  // reading text keeps to about 70 characters a line
  const intro = page.locator("p.max-w-\\[70ch\\]").first();
  await expect(intro).toBeVisible();
  expect(Math.round((await intro.boundingBox())!.width)).toBeLessThanOrEqual(720);

  // /admin → Organisations → the organisation: the events table and its Actions cell
  await page.goto(`/admin/organisations/${org.orgId}`);
  const table = page.locator("table").filter({ hasText: "Actions" }).last();
  await expect(table).toBeVisible({ timeout: 60_000 });
  expect(Math.round((await table.boundingBox())!.width)).toBeGreaterThanOrEqual(1100);
  const actionsCell = table.locator("tbody tr").first().locator("td").last();
  expect(Math.round((await actionsCell.boundingBox())!.width), "the Actions cell is wide enough not to wrap every sentence").toBeGreaterThanOrEqual(520);
});

test("a very wide window: the content area stops at 1400 px and is centred; the phone is unchanged", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 2200, height: 900 });
  await org.signIn(page, `/org/events/${eventId}/officials`);
  await expect(page.getByTestId("org-main")).toBeVisible({ timeout: 60_000 });
  const box = (await page.getByTestId("org-main").boundingBox())!;
  expect(Math.round(box.width)).toBe(1400);
  const rail = await page.locator("aside").first().evaluate((el) => el.getBoundingClientRect().right);
  const left = box.x - rail;
  const right = 2200 - (box.x + box.width);
  expect(Math.abs(left - right), "centred in the space beside the rail").toBeLessThan(3);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByTestId("org-main")).toBeVisible({ timeout: 30_000 });
  // the layout follows the window once the page is live: the same width as the phone itself
  await expect.poll(async () => Math.round((await page.getByTestId("org-main").boundingBox())!.width), { timeout: 15_000 }).toBe(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
