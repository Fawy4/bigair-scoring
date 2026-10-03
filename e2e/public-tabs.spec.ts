import { expect, test } from "@playwright/test";
import { createPublicWorld, type PublicWorld } from "./public-world";

/**
 * Polish 2b, item 5 — the organiser chooses the tabs of the public event page ("Public page" card on the Event step). Switch two tabs off: the public page shows the rest, the old
 * address of a hidden tab lands on the first visible tab (never a 404), Join also hides itself while registration is closed, and one tab always stays on.
 */
test.describe.configure({ mode: "serial" });

let w: PublicWorld;
test.beforeAll(async () => {
  test.setTimeout(240_000);
  w = await createPublicWorld();
});
test.afterAll(async () => {
  await w?.cleanup();
});

const tabsOf = async (page: import("@playwright/test").Page) => (await page.getByRole("navigation", { name: "Pages of this event" }).getByRole("link").allTextContents()).map((t) => t.trim());
const openAdvanced = async (page: import("@playwright/test").Page) => {
  // the page remembers whether More settings was open, and the first tap may come before the page has finished loading
  await expect(async () => {
    if (!(await page.getByTestId("public-page-settings").isVisible())) await page.getByTestId("advanced-toggle").click({ timeout: 3000 });
    await expect(page.getByTestId("public-page-settings")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
};
const setSettings = async (patch: object) => {
  const { data } = await w.db.from("events").select("settings").eq("id", w.eventId).single();
  await w.db.from("events").update({ settings: { ...(data!.settings as object), ...patch } as never }).eq("id", w.eventId);
};

test("the Event step lists every public tab, all on; switching Rules and Join off is saved", async ({ page }) => {
  test.setTimeout(180_000);
  await w.org.signIn(page, `/org/events/${w.eventId}/event`);
  await openAdvanced(page);
  const card = page.getByTestId("public-page-settings");
  for (const key of ["home", "live", "results", "ladder", "placings", "rules", "join"]) await expect(card.getByTestId(`public-tab-${key}`)).toBeChecked(); // all on by default
  await expect(card.getByText("Join also hides itself while registration is closed.")).toBeVisible();
  await expect(card.getByRole("button", { name: /^What is/ }).or(card.getByRole("button", { name: /Public page/ })).first()).toBeVisible();
  await card.getByTestId("public-tab-rules").uncheck();
  await card.getByTestId("public-tab-join").uncheck();
  await page.getByRole("button", { name: "Save event" }).click();
  await expect.poll(async () => (await w.db.from("events").select("settings").eq("id", w.eventId).single()).data?.settings, { timeout: 30_000 }).toMatchObject({ publicTabsOff: ["rules", "join"] });
  await page.reload();
  await openAdvanced(page);
  await expect(page.getByTestId("public-tab-rules")).not.toBeChecked();
  await expect(page.getByTestId("public-tab-join")).not.toBeChecked();
  await expect(page.getByTestId("public-tab-results")).toBeChecked();
});

test.describe("the public page", () => {
  test.use({ viewport: { width: 393, height: 851 }, hasTouch: true, isMobile: true });

  test("shows the tabs that are left; the old address of a hidden tab lands on the first visible tab; the others still open", async ({ page }) => {
    await setSettings({ publicTabsOff: ["rules", "join"], registrationOpen: true });
    await page.goto(`/e/${w.slug}`);
    expect(await tabsOf(page)).toEqual(["Home", "Live", "Results", "Ladder", "Placings"]);
    const res = await page.goto(`/e/${w.slug}/rules`);
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`/e/${w.slug}$`));
    await expect(page.getByTestId("public-site")).toBeVisible();
    expect(await tabsOf(page)).not.toContain("Rules");
    await page.goto(`/e/${w.slug}/ladder`);
    await expect(page).toHaveURL(/\/ladder$/);

    // the first visible tab is the landing place: with Home and Live off, an old Rules link lands on Results
    await setSettings({ publicTabsOff: ["home", "live", "rules"] });
    await page.goto(`/e/${w.slug}/rules`);
    await expect(page).toHaveURL(/\/results$/);
    await page.goto(`/e/${w.slug}/live`);
    await expect(page).toHaveURL(/\/results$/);
    await page.goto(`/e/${w.slug}`);
    await expect(page).toHaveURL(/\/results$/);
    expect(await tabsOf(page)).toEqual(["Results", "Ladder", "Placings", "Join"]);
  });

  test("Join hides itself while registration is closed and comes back when it opens; the join page itself still opens for officials", async ({ page }) => {
    await setSettings({ publicTabsOff: [], registrationOpen: false });
    await page.goto(`/e/${w.slug}`);
    expect(await tabsOf(page)).toEqual(["Home", "Live", "Results", "Ladder", "Placings", "Rules"]);
    await setSettings({ registrationOpen: true });
    await page.goto(`/e/${w.slug}`);
    expect(await tabsOf(page)).toEqual(["Home", "Live", "Results", "Ladder", "Placings", "Rules", "Join"]);
    await setSettings({ registrationOpen: false });
    const join = await page.goto(`/e/${w.slug}/join`);
    expect(join?.status()).toBe(200); // the officials' PIN doors live on this address
    await expect(page.getByTestId("role-judge")).toBeVisible();
  });
});

test("at least one tab stays on: the last switch cannot be turned off (Join does not count)", async ({ page }) => {
  test.setTimeout(180_000);
  await setSettings({ publicTabsOff: [] });
  await w.org.signIn(page, `/org/events/${w.eventId}/event`);
  await openAdvanced(page);
  for (const key of ["home", "live", "ladder", "placings", "rules"]) await page.getByTestId(`public-tab-${key}`).uncheck();
  await expect(page.getByTestId("public-tab-results")).toBeChecked();
  await expect(page.getByTestId("public-tab-results")).toBeDisabled(); // the last one (Join does not count while it can hide itself)
  await expect(page.getByTestId("public-tab-join")).toBeEnabled();
});
