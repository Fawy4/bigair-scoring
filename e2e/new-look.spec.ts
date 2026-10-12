import { test, expect, installSupabaseProxy, closePhones } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";
import type { Browser, BrowserContext, Page } from "@playwright/test";

// The New look (0.21.0) on a throwaway organisation (Arrow, EKL and Demo are never touched), phone size 390 × 844, ONE worker, on a production build:
//   (a) all 7 lines of the judges' and the spotter's Rider sheet are visible without scrolling in Normal, with the header and the rider cards;
//   (b) no sideways scrolling on any officials' screen at 390 px;
//   (c) every tap target is at least 44 px and every typed-in box has text of at least 16 px, on every officials' screen;
//   (d) Day is what a fresh phone and the organiser pages open in; a chosen Dark is kept after a reload.
let w: LiveWorld;
const contexts: BrowserContext[] = [];
test.beforeEach(async () => {
  w = await createLiveWorld({ headScores: true });
});
test.afterEach(async () => {
  await closePhones(contexts);
  await w?.cleanup();
});

async function phone(browser: Browser, key: Parameters<LiveWorld["signInAs"]>[1], path: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  contexts.push(context);
  await installSupabaseProxy(context, { newViews: true }); // a phone that never chose a view
  const page = await context.newPage();
  await w.signInAs(page, key, path);
  return page;
}

/** What is wrong with the screen as it is now: sideways scrolling, tap targets under 44 px, typed-in boxes under 16 px. */
async function audit(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad = { sideways: document.documentElement.scrollWidth - vw, bodySideways: 0, small: [] as string[], tiny: [] as string[] };
    for (const b of document.querySelectorAll<HTMLElement>('[data-testid="screen-body"]')) bad.bodySideways = Math.max(bad.bodySideways, b.scrollWidth - b.clientWidth);
    const name = (el: Element) => `${el.tagName.toLowerCase()}[${el.getAttribute("data-testid") ?? el.getAttribute("aria-label") ?? (el.textContent ?? "").trim().slice(0, 24)}]`;
    for (const el of document.querySelectorAll<HTMLElement>('button, [role="button"], [role="tab"], a[href], input, select, textarea, summary')) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || cs.display === "none") continue;
      if (el instanceof HTMLInputElement && ["hidden", "checkbox", "radio"].includes(el.type)) continue;
      const box = el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
      if (r.height < 43.5 || r.width < 43.5) bad.small.push(`${name(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
      if (box && parseFloat(cs.fontSize) < 15.99) bad.tiny.push(`${name(el)} ${cs.fontSize}`);
    }
    return bad;
  });
}
const clean = { sideways: 0, bodySideways: 0, small: [] as string[], tiny: [] as string[] };

/** Every line is inside the display, nothing scrolls, and the header and the rider cards are in view. */
async function expectSevenLinesWithoutScrolling(page: Page, lineId: "spotter-line" | "sheet-line") {
  await expect(page.getByTestId(lineId)).toHaveCount(7, { timeout: 40_000 });
  await expect(page.getByTestId("screen-header")).toBeVisible();
  await expect(page.getByTestId("rider-tile").first()).toBeVisible();
  const m = await page.evaluate((id) => {
    const lines = [...document.querySelectorAll(`[data-testid="${id}"]`)].map((l) => l.getBoundingClientRect());
    const body = document.querySelector('[data-testid="screen-body"]') as HTMLElement;
    return { lastBottom: Math.max(...lines.map((r) => r.bottom)), innerHeight: window.innerHeight, scrollable: body.scrollHeight - body.clientHeight, headerTop: document.querySelector('[data-testid="screen-header"]')!.getBoundingClientRect().top };
  }, lineId);
  expect(m.lastBottom, "the 7th line ends inside the display").toBeLessThanOrEqual(m.innerHeight);
  expect(m.scrollable, "the body does not scroll").toBeLessThanOrEqual(1);
  expect(m.headerTop).toBeGreaterThanOrEqual(0);
}

test("(a) (b) (c) the officials' screens at 390 × 844 in Normal: 7 lines without scrolling, no sideways scrolling, 44 px taps and 16 px boxes", async ({ browser }) => {
  test.setTimeout(900_000);
  const H = w.heats[0];
  await w.startHeat(H);

  // ---- the spotter
  const spotter = await phone(browser, "spotter", `/spot/${w.eventId}`);
  await expect(spotter.getByTestId("spotter-sheet")).toBeVisible({ timeout: 40_000 });
  await expect(spotter.getByTestId("live-root")).toHaveAttribute("data-text", "normal");
  await expectSevenLinesWithoutScrolling(spotter, "spotter-line");
  expect(await audit(spotter), "spotter Rider sheet").toEqual(clean);
  await spotter.getByTestId("settings-button").click();
  await expect(spotter.getByTestId("screen-settings")).toBeVisible();
  expect(await audit(spotter), "spotter settings open").toEqual(clean);
  await spotter.getByTestId("settings-button").click();
  await spotter.getByTestId("spot-view-list").click();
  await expect(spotter.getByTestId("view-switch")).toBeVisible();
  expect(await audit(spotter), "spotter Trick list").toEqual(clean);

  // ---- a judge
  const j1 = await phone(browser, "j1", `/judge/${w.eventId}`);
  await expect(j1.getByTestId("rider-sheet")).toBeVisible({ timeout: 40_000 });
  await expect(j1.getByTestId("live-root")).toHaveAttribute("data-text", "normal");
  await expectSevenLinesWithoutScrolling(j1, "sheet-line");
  expect(await audit(j1), "judge Rider sheet").toEqual(clean);
  await j1.getByTestId("settings-button").click();
  await expect(j1.getByTestId("screen-settings")).toBeVisible();
  expect(await audit(j1), "judge settings open").toEqual(clean);
  await j1.getByRole("button", { name: "Large", exact: true }).click(); // Large: the same rules hold
  await expect(j1.getByTestId("live-root")).toHaveAttribute("data-text", "large");
  expect(await audit(j1), "judge settings in Large").toEqual(clean);
  await j1.getByRole("button", { name: "Normal", exact: true }).click();
  await j1.getByTestId("settings-button").click();
  await j1.getByTestId("view-queue").click();
  await expect(j1.getByTestId("queue-card").or(j1.getByTestId("all-scored"))).toBeVisible({ timeout: 40_000 });
  expect(await audit(j1), "judge Queue").toEqual(clean);

  // ---- the head judge's phone (Score and Control tabs)
  const head = await phone(browser, "head", `/head/${w.eventId}`);
  await expect(head.getByRole("tablist")).toBeVisible({ timeout: 40_000 });
  for (const tab of ["control", "score"]) {
    await head.locator(`[data-tab="${tab}"]`).click();
    await expect(head.locator(`[data-tab="${tab}"]`)).toHaveAttribute("aria-selected", "true");
    expect(await audit(head), `head judge ${tab} tab`).toEqual(clean);
  }

  // ---- the heat has ended: the judge's Impression step
  await w.db.from("heats").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", H);
  await expect(j1.getByTestId("screen-header")).toBeVisible();
  await expect(async () => {
    expect(await j1.locator('[data-testid="impression-progress"], [data-testid="submit-plain"], [data-testid="rider-sheet"]').count()).toBeGreaterThan(0);
  }).toPass({ timeout: 40_000 });
  expect(await audit(j1), "judge after the heat").toEqual(clean);

  // ---- the observer
  const { data: obs } = await w.db.auth.admin.createUser({ email: `e2e-${w.org.run}-obs@example.com`, password: `Pw-${w.org.run}-live`, email_confirm: true });
  w.org.trackUser(obs.user!.id);
  await w.db.from("judge_seats").insert({ event_id: w.eventId, name: "Observer 1", role: "observer", scores: false, auth_user_id: obs.user!.id, status: "active", active: true } as never);
  const link = await w.db.auth.admin.generateLink({ type: "magiclink", email: `e2e-${w.org.run}-obs@example.com` });
  const observer = await (async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    contexts.push(context);
    await installSupabaseProxy(context, { newViews: true });
    const page = await context.newPage();
    await page.goto(`/auth/confirm?token_hash=${link.data!.properties.hashed_token}&type=magiclink&next=${encodeURIComponent(`/observe/${w.eventId}`)}`);
    return page;
  })();
  await expect(observer.getByTestId("observer-page")).toBeVisible({ timeout: 40_000 });
  expect(await audit(observer), "observer").toEqual(clean);
});

test("(d) Day is what a fresh phone and the organiser pages open in; a chosen Dark is kept", async ({ browser, page }) => {
  test.setTimeout(600_000);
  await w.startHeat(w.heats[0]);
  const rgb = (p: Page) => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  for (const [key, path, root] of [
    ["spotter", `/spot/${w.eventId}`, "live-root"],
    ["j1", `/judge/${w.eventId}`, "live-root"],
    ["head", `/head/${w.eventId}`, "live-root"],
  ] as const) {
    const p = await phone(browser, key, path);
    await expect(p.getByTestId(root)).toBeVisible({ timeout: 40_000 });
    await expect(p.getByTestId(root)).toHaveAttribute("data-theme", "day");
    await expect(p.getByTestId(root)).toHaveClass(/beach-day/);
    expect(await p.getByTestId(root).evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(255, 255, 255)");
  }
  // a fresh browser opens the organiser pages in Day
  await w.org.signIn(page, `/org/events/${w.eventId}`);
  await expect(page.locator(".org-ui, .org-console").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".beach-dark")).toHaveCount(0);
  expect(await rgb(page)).toBe("rgb(255, 255, 255)");
  // Dark is a choice: the round button, then it is kept after a reload
  const j = await phone(browser, "j1", `/judge/${w.eventId}`);
  await j.getByTestId("settings-button").click();
  await j.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(j.getByTestId("live-root")).toHaveAttribute("data-theme", "dark");
  expect(await j.getByTestId("live-root").evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(0, 0, 0)");
  await j.reload();
  await expect(j.getByTestId("live-root")).toHaveAttribute("data-theme", "dark", { timeout: 40_000 });
});
