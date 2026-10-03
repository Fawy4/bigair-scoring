import type { BrowserContext, Page } from "@playwright/test";
import { closePhones, expect, installSupabaseProxy, test } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";

/**
 * Audit 1b, part 7 — UI invariants, quick (docs/AUDIT.md). One throwaway organisation: the live world plus a division with 0 riders, one with 1 rider, one with
 * 41 riders whose names use Arabic script and emoji, and a running heat with a 60-character trick name. Arrow, EKL and Demo are never touched.
 */
let w: LiveWorld;
let slug: string;
const contexts: BrowserContext[] = [];
const ARABIC = ["محمد", "فاطمة", "يوسف", "ليلى", "عمر", "نور"];
const EMOJI = ["🪁", "🌊", "🔥", "⚡️", "🏄‍♀️", "🇪🇬"];
const LONG_TRICK = "Double Handle Pass Kiteloop Board-Off Late Backroll To Blind"; // 60 characters

test.beforeAll(async () => {
  test.setTimeout(300_000);
  w = await createLiveWorld({ flags: true });
  slug = (await w.db.from("events").select("slug").eq("id", w.eventId).single()).data!.slug as string;
  const div = async (name: string, n: number, sort: number, names: (i: number) => [string, string]) => {
    const d = (await w.db.from("divisions").insert({ event_id: w.eventId, name, sort_order: sort, scoring_model_id: w.modelId, panel_id: w.panelId }).select("id").single()).data!;
    if (n) {
      const riders = (await w.db.from("riders").insert(Array.from({ length: n }, (_, i) => ({ organisation_id: w.orgId, first_name: names(i)[0], last_name: names(i)[1] }))).select("id")).data!;
      await w.db.from("entries").insert(riders.map((r, i) => ({ division_id: d.id, rider_id: r.id, seed: i + 1, status: "confirmed", source: "manual" })));
    }
    return d.id as string;
  };
  await div("Empty", 0, 2, () => ["", ""]);
  await div("Solo", 1, 3, () => ["Only", "One"]);
  await div("Forty-one", 41, 4, (i) => [`${ARABIC[i % 6]} ${EMOJI[i % 6]}`, `${EMOJI[(i + 3) % 6]} ${ARABIC[(i + 2) % 6]}`]);
  // a running heat with a 60-character trick name logged
  await w.db.from("heats").update({ status: "running", started_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", w.heats[0]);
  await w.db.from("trick_attempts").insert({ heat_id: w.heats[0], entry_id: w.entries[0], seq: 1, status: "landed", trick_name: LONG_TRICK, client_key: crypto.randomUUID() });
});
test.afterAll(async () => {
  await closePhones(contexts);
  await w?.cleanup();
});

async function phone(browser: import("@playwright/test").Browser, size = { width: 390, height: 844 }): Promise<Page> {
  const context = await browser.newContext({ viewport: size });
  contexts.push(context);
  await installSupabaseProxy(context);
  return context.newPage();
}

/** Opens each address and fails on an uncaught page error or the error screen. */
async function visitAll(page: Page, paths: string[]) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
  for (const path of paths) {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), path).toBeLessThan(500);
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
    await expect(page.getByTestId("route-error"), path).toHaveCount(0);
  }
  expect(errors).toEqual([]);
}

test("no public page throws on an empty division, a division of one, 41 riders with Arabic script and emoji, and a 60-character trick name", async ({ page }) => {
  test.setTimeout(300_000);
  const entry = w.entries[0];
  await visitAll(page, [`/e/${slug}`, `/e/${slug}/live`, `/e/${slug}/results`, `/e/${slug}/ladder`, `/e/${slug}/riders`, `/e/${slug}/riders/${entry}`, `/e/${slug}/rules`, `/e/${slug}/placings`, `/e/${slug}/flag`, `/screen/${slug}`]);
  await page.goto(`/e/${slug}/live`);
  await expect(page.locator("body")).toContainText(LONG_TRICK.slice(0, 20), { timeout: 30_000 });
});

test("no organiser screen throws on the same event", async ({ page }) => {
  test.setTimeout(300_000);
  await w.org.signIn(page, `/org/events/${w.eventId}`);
  const base = `/org/events/${w.eventId}`;
  await visitAll(page, [base, `${base}/event`, `${base}/divisions`, `${base}/riders`, `${base}/riders/links`, `${base}/draw`, `${base}/officials`, `${base}/schedule`, `${base}/simulate`]);
});

test("judge and spotter phones at 390 × 844, Normal text, flags on and a heat running: nothing needs scrolling", async ({ browser }) => {
  test.setTimeout(300_000);
  for (const [key, path] of [["j1", "/seat"], ["spotter", "/seat"]] as const) {
    const p = await phone(browser);
    await w.signInAs(p, key, path);
    await expect(p.getByTestId("heat-timer").first()).toBeVisible({ timeout: 60_000 });
    await p.waitForTimeout(2000);
    const m = await p.evaluate(() => ({ sh: document.scrollingElement!.scrollHeight, ih: window.innerHeight, sw: document.scrollingElement!.scrollWidth, iw: window.innerWidth }));
    expect(m.sw, `${key}: sideways`).toBeLessThanOrEqual(m.iw + 1);
    expect(m.sh, `${key}: page height ${m.sh} > ${m.ih}`).toBeLessThanOrEqual(m.ih + 1);
  }
});

test("every grey button on the head console and the organiser's event screens says why (a reason under it or linked to it)", async ({ browser, page }) => {
  test.setTimeout(300_000);
  const silent: string[] = [];
  const check = async (p: Page, where: string) => {
    await p.waitForTimeout(2500);
    const found = await p.evaluate(() =>
      [...document.querySelectorAll("button:disabled, [aria-disabled='true']")]
        .filter((b) => (b as HTMLElement).offsetParent !== null)
        .filter((b) => {
          const id = b.getAttribute("aria-describedby");
          const linked = id ? id.split(" ").map((x) => document.getElementById(x)?.textContent?.trim() ?? "").join("") : "";
          return !linked && !b.getAttribute("title") && !b.closest("[data-reason]");
        })
        .map((b) => (b.getAttribute("data-testid") ?? b.textContent ?? "").trim().slice(0, 40)),
    );
    for (const f of found) silent.push(`${where}: ${f}`);
  };
  const head = await phone(browser, { width: 1500, height: 1000 });
  await w.signInAs(head, "head", `/head/${w.eventId}`);
  await expect(head.locator(`[data-testid="order-row"]`).first()).toBeVisible({ timeout: 60_000 });
  await check(head, "head console");
  await w.org.signIn(page, `/org/events/${w.eventId}`);
  for (const sub of ["", "/draw", "/schedule", "/officials"]) {
    await page.goto(`/org/events/${w.eventId}${sub}`);
    await check(page, `organiser${sub || " dashboard"}`);
  }
  console.info("A1b 7 grey buttons without a reason:", silent);
  expect(silent).toEqual([]);
});
