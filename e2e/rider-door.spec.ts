import { devices, expect, test } from "@playwright/test";
import { createPublicWorld, type PublicWorld } from "./public-world";

// The rider page gets a door: the public Riders list opens each rider's page, the page has Share (a QR and the address) and the "Add to home screen" hint, and the
// organiser's Riders step has Rider links (a printable sheet and the "Name — address" lines). Visibility is the public rule: only riders of divisions whose draw is
// locked are on the public list. One throwaway organisation (Arrow, EKL and Demo are never touched).
test.use({ ...devices["Pixel 5"] });
test.describe.configure({ mode: "serial" });

let w: PublicWorld;
let hiddenName = "";
const url = (path = "") => `/e/${w.slug}${path}`;

test.beforeAll(async () => {
  test.setTimeout(240_000);
  w = await createPublicWorld();
  // a division whose draw is not locked: its rider is not public yet
  const { data: div } = await w.db.from("divisions").insert({ event_id: w.eventId, name: "Not drawn yet", sort_order: 9, scoring_model_id: w.modelId }).select("id").single();
  const { data: rider } = await w.db.from("riders").insert({ organisation_id: w.orgId, first_name: "Hidden", last_name: "Rider" }).select("id").single();
  await w.db.from("entries").insert({ event_id: w.eventId, division_id: div!.id, rider_id: rider!.id, seed: 1, status: "confirmed", source: "manual" });
  hiddenName = "Hidden Rider";
});
test.afterAll(async () => {
  await w?.cleanup();
});

const publicRiders = async () => {
  const { data: divs } = await w.db.from("divisions").select("id, draw_locked_at").eq("event_id", w.eventId);
  const locked = new Set((divs ?? []).filter((d) => d.draw_locked_at).map((d) => d.id));
  const { data } = await w.db.from("entries").select("id, division_id").eq("event_id", w.eventId).eq("status", "confirmed");
  return (data ?? []).filter((e) => locked.has(e.division_id));
};

test("public Riders tab lists every public rider; a name opens that rider's page; Share has a QR, the address and the Add to home screen hint; the address opens the same page", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(url());
  await expect(page.getByRole("navigation").getByRole("link", { name: "Riders", exact: true }).first()).toBeVisible();
  await page.goto(url("/riders"));
  const expected = await publicRiders();
  expect(expected.length).toBeGreaterThan(4);
  await expect(page.getByTestId("rider-link")).toHaveCount(expected.length);
  await expect(page.getByTestId("riders-list").first()).toBeVisible();
  // nothing unpublished: the rider of the division without a locked draw is not on the list
  await expect(page.getByText(hiddenName)).toHaveCount(0);

  const first = page.getByTestId("rider-link").first();
  const id = (await first.getAttribute("data-entry"))!;
  const name = (await first.innerText()).trim();
  await first.click();
  await expect(page).toHaveURL(new RegExp(`/riders/${id}$`));
  await expect(page.getByTestId("rider-card")).toContainText(name.split(" ")[0]);
  const share = page.getByTestId("rider-share");
  await expect(share.getByTestId("qr")).toBeVisible();
  await expect(share.getByTestId("copy-link")).toBeVisible();
  await expect(page.getByTestId("rider-add-home")).toContainText("Add this page to your home screen");
  // the address in the Share card opens the same page
  const href = (await page.getByTestId("rider-share-url").getAttribute("href"))!;
  expect(href).toMatch(new RegExp(`/e/${w.slug}/riders/${id}$`));
  await page.goto(new URL(href).pathname);
  await expect(page).toHaveURL(new RegExp(`/riders/${id}$`));
  await expect(page.getByTestId("rider-card")).toContainText(name.split(" ")[0]);
  // no login anywhere
  await expect(page.getByLabel(/password|PIN|sign in/i)).toHaveCount(0);
});

test("a rider whose division is not drawn has no public page", async ({ page }) => {
  const { data } = await w.db.from("entries").select("id, riders(first_name)").eq("event_id", w.eventId);
  const hidden = (data ?? []).find((e) => (e.riders as { first_name?: string } | null)?.first_name === "Hidden")!;
  const res = await page.goto(url(`/riders/${hidden.id}`));
  expect(res?.status()).toBe(404);
});

test("organiser Riders step: Rider links opens a printable sheet with a QR and address per rider and the Name — address lines", async ({ browser, page }) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const org = await context.newPage();
  await w.org.signIn(org, `/org/events/${w.eventId}/riders`);
  await expect(org.getByTestId("rider-links-button")).toBeVisible({ timeout: 60_000 });
  const [sheet] = await Promise.all([context.waitForEvent("page"), org.getByTestId("rider-links-button").click()]);
  await sheet.waitForLoadState("domcontentloaded");
  const { data: all } = await w.db.from("entries").select("id").eq("event_id", w.eventId).eq("status", "confirmed");
  await expect(sheet.getByTestId("rider-link-card")).toHaveCount(all!.length, { timeout: 60_000 });
  await expect(sheet.getByTestId("rider-link-card").first().getByTestId("qr")).toBeVisible();
  await expect(sheet.getByTestId("rider-link-url").first()).toContainText(`/e/${w.slug}/riders/`);
  const text = await sheet.getByTestId("rider-links-text").inputValue();
  const lines = text.split("\n").filter(Boolean);
  expect(lines).toHaveLength(all!.length);
  for (const l of lines) expect(l).toMatch(/^.+ — https?:\/\/.+\/e\/.+\/riders\/[0-9a-f-]{36}$/);
  await expect(sheet.getByTestId("rider-links-notlocked")).toContainText("1 rider is in a division whose draw is not locked yet");
  // a link from the sheet opens that rider's page
  const path = new URL(lines[0].split(" — ")[1]).pathname;
  await page.goto(path);
  await expect(page.getByTestId("rider-card")).toBeVisible();
  await context.close();
});
