import { expect, test, type Page } from "@playwright/test";
import { publishLadderHeat, breakdownOf } from "../tests/rls/public-helpers";
import { createPublicWorld, type PublicWorld } from "./public-world";

/**
 * "Big screen — Follow the heat" (/screen/<event>/follow) on a 1920 × 1080 browser, as a visitor (no login). One throwaway event with a Knockout ladder: heat 1 is
 * released, heat 2 and the Final go through their whole life on the screen — armed (the yellow), running, ended, "Judges reviewing", published — and each publish is
 * a page of the walk. Three published heats are on the screen at the end: Results (3) → Ladder → Results (2) → Ladder → Results (1) → Ladder → Results (3) again.
 * Pro Men's first heat has result rows but is NOT published, and the Reseed ladder's first heat is published but HELD: neither may ever appear. Arrow, EKL and Demo are never touched.
 */
test.use({ viewport: { width: 1920, height: 1080 } });
test.describe.configure({ mode: "serial" });

let w: PublicWorld;
const SECONDS = 5;
const ago = (sec: number) => new Date(Date.now() - sec * 1000).toISOString();
const followUrl = () => `/screen/${w.slug}/follow`;
const ctx = () => ({ s: w.db, ids: { orgA: w.orgId, evA1: w.eventId, modelA1: w.modelId } });
const heatId = (uid: string) => w.ladder.heats[uid];
let draw: never;

/** What publishing a ladder heat leaves behind, plus the attempts every rider rode (the same boxes the public results page draws). */
async function publishHeat(uid: string, hold = false) {
  const out = await publishLadderHeat(ctx(), w.ladder, uid, { draw, hold });
  draw = out.draw as never;
}

const screen = (page: Page) => page.getByTestId("follow-screen");
const phaseIs = (page: Page, phase: string, timeout = 15_000) => expect(screen(page)).toHaveAttribute("data-phase", phase, { timeout });

/** Records every change of page (phase, page kind, heat) with its time, in the browser, so a test can look at the whole walk afterwards. */
async function record(page: Page) {
  await page.addInitScript(() => {
    const seen: Array<{ k: string; t: number }> = [];
    (window as unknown as { __seen: typeof seen }).__seen = seen;
    setInterval(() => {
      const s = document.querySelector('[data-testid="follow-screen"]');
      if (!s) return;
      const p = document.querySelector('[data-testid="follow-results-page"],[data-testid="follow-ladder-page"],[data-testid="follow-live-page"],[data-testid="follow-reviewing-page"]');
      const k = `${s.getAttribute("data-phase")}|${p?.getAttribute("data-testid")?.replace("follow-", "").replace("-page", "") ?? "none"}|${p?.getAttribute("data-heat") ?? p?.getAttribute("data-division") ?? ""}`;
      if (!seen.length || seen[seen.length - 1].k !== k) seen.push({ k, t: Date.now() });
    }, 50);
  });
}
const seenOf = (page: Page) => page.evaluate(() => (window as unknown as { __seen: Array<{ k: string; t: number }> }).__seen);

test.beforeAll(async () => {
  test.setTimeout(300_000);
  w = await createPublicWorld({ settings: { followRotateSec: SECONDS, flags: { enabled: true } } });
  const [h1, h2] = w.heats;
  // Pro Men: not published, not running (result rows left behind on purpose: an unpublished heat must never show them)
  await w.db.from("heats").update({ status: "scheduled", started_at: null, ended_at: null, published_at: null }).in("id", [h1, h2]);
  // the Reseed ladder's first heat is published but HELD back
  await w.db.from("heats").update({ publish_hold: true }).eq("id", w.reseedLadder.heats["R1-H1"]);
  draw = (await w.db.from("divisions").select("draw").eq("id", w.ladder.div).single()).data!.draw as never;
});
test.afterAll(async () => {
  await w?.cleanup();
});

test("the data answer: only released heats, panel scores only, never a single judge's mark; held and unpublished are absent; it is read as a visitor", async ({ request }) => {
  const res = await request.get(`${followUrl()}/data`);
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("no-store");
  const text = await res.text();
  const body = JSON.parse(text) as { payload: { phase: { kind: string }; pages: Array<{ kind: string; heatId?: string; riders?: unknown[] }> } };
  expect(body.payload.phase.kind).toBe("rotation");
  const results = body.payload.pages.filter((p) => p.kind === "results");
  expect(results.map((p) => p.heatId)).toEqual([heatId("R1-H1")]); // heat 1 of the Knockout only
  expect(text).not.toContain("judgeScores");
  expect(text).not.toContain("9.9"); // a single judge's mark
  const pagesText = JSON.stringify(body.payload.pages);
  expect(pagesText).not.toContain(w.heats[0]); // Pro Men's unpublished heat
  expect(pagesText).not.toContain(w.reseedLadder.heats["R1-H1"]); // the held one
  expect(pagesText).not.toContain("Reseed");
  for (const name of ["Sam Rivera", "Noor Haddad", "Lena Vogt", "Mia Costa"]) expect(text).not.toContain(name);
});

test("a visitor opening the address finds a clean screen: no Note or feedback button, no navigation bar, no cookie or install prompt; the old big screen has no Note button either", async ({ page }) => {
  await page.goto(followUrl());
  await expect(page.getByTestId("big-screen")).toBeVisible();
  await expect(screen(page)).toBeVisible();
  await expect(page.getByRole("button", { name: /note|feedback/i })).toHaveCount(0);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("qr")).toBeVisible();
  await expect(page.getByTestId("now-clock")).toBeVisible();
  await page.goto(`/screen/${w.slug}`);
  await expect(page.getByTestId("big-screen")).toBeVisible();
  await expect(page.getByRole("button", { name: /note|feedback/i })).toHaveCount(0);
});

test("signed in as the organiser the Note button is still not on either big screen", async ({ page }) => {
  await w.org.signIn(page, `/org/events/${w.eventId}`);
  await expect(page.getByRole("button", { name: /note/i }).first()).toBeVisible(); // it is there on the organiser's own pages
  await page.goto(followUrl());
  await expect(screen(page)).toBeVisible();
  await expect(page.getByRole("button", { name: /note|feedback/i })).toHaveCount(0);
  await page.goto(`/screen/${w.slug}`);
  await expect(page.getByTestId("big-screen")).toBeVisible();
  await expect(page.getByRole("button", { name: /note|feedback/i })).toHaveCount(0);
});

test("the walk with one heat out: Results (heat 1) then the Ladder, a line at the bottom 'Next: …', never an unpublished or held heat", async ({ page }) => {
  await record(page);
  await page.goto(followUrl());
  await phaseIs(page, "rotation");
  await expect(page.getByTestId("follow-results-page")).toHaveAttribute("data-heat", heatId("R1-H1"));
  await expect(page.getByTestId("follow-title")).toContainText("published");
  await expect(page.getByTestId("follow-next")).toContainText(/^Next: .+/);
  await expect(page.getByTestId("follow-ladder-page")).toBeVisible({ timeout: (SECONDS + 3) * 1000 });
  await expect(page.getByTestId("follow-title")).toContainText("Ladder · Knockout");
  expect(await page.getByTestId("ladder-heat").count()).toBeGreaterThan(0);
  await expect(page.getByTestId("follow-results-page")).toBeVisible({ timeout: (SECONDS + 3) * 1000 });
  const seen = await seenOf(page);
  const kinds = seen.map((s) => s.k.split("|").slice(0, 2).join("|"));
  expect(kinds.slice(0, 3)).toEqual(["rotation|results", "rotation|ladder", "rotation|results"]);
  const text = await page.locator("body").innerText();
  for (const name of ["Sam Rivera", "Noor Haddad", "Lena Vogt", "Mia Costa"]) expect(text).not.toContain(name);
});

test("heat 2: arming brings the live heat back within two seconds, mid-rotation; the yellow, the green, then End heat and 'Judges reviewing' until Publish", async ({ page }) => {
  await record(page);
  await page.goto(followUrl());
  await phaseIs(page, "rotation");
  await expect(screen(page)).toHaveAttribute("data-index", /.*/);
  const h = heatId("R1-H2");
  // the head judge arms the heat (the yellow, a one-minute pre-start)
  await w.db.from("heats").update({ status: "scheduled", armed_at: new Date().toISOString(), prestart_sec: 60, duration_sec: 600, ended_at: null }).eq("id", h);
  const armedAt = Date.now(); // the arming is committed
  await phaseIs(page, "live", 2_000);
  expect(Date.now() - armedAt).toBeLessThan(2_600);
  await expect(page.getByTestId("follow-live-page")).toHaveAttribute("data-heat", h);
  await expect(page.getByTestId("screen-flag-frame")).toHaveAttribute("data-flag", "before_start");
  await expect(page.getByTestId("follow-live-riders").getByTestId("follow-rider")).toHaveCount(3);
  await expect(page.getByTestId("heat-clock")).toBeVisible();
  await expect(page.getByTestId("follow-next")).toHaveText(""); // no Next line while a heat is live
  // no rotation while live: stay on the same page for longer than the page time
  await page.waitForTimeout((SECONDS + 2) * 1000);
  await phaseIs(page, "live", 1_000);
  // the green
  await w.db.from("heats").update({ status: "running", started_at: new Date().toISOString() }).eq("id", h);
  await expect(page.getByTestId("screen-flag-frame")).toHaveAttribute("data-flag", /running|last_minute/, { timeout: 5_000 });
  await phaseIs(page, "live", 1_000);
  // End heat
  const endedAt = Date.now();
  await w.db.from("heats").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", h);
  await phaseIs(page, "reviewing", 2_500);
  expect(Date.now() - endedAt).toBeLessThan(3_000);
  await expect(page.getByTestId("follow-reviewing")).toHaveText("Judges reviewing");
  await expect(page.getByTestId("follow-reviewing-page")).toHaveAttribute("data-heat", h);
  // it stays on that heat while everyone waits: older results never jump in
  await page.waitForTimeout((SECONDS + 2) * 1000);
  await phaseIs(page, "reviewing", 1_000);
  await expect(page.getByTestId("follow-reviewing")).toBeVisible();
  // Publish: the walk starts from this heat
  await publishHeat("R1-H2");
  await phaseIs(page, "rotation", 3_000);
  await expect(page.getByTestId("follow-results-page")).toHaveAttribute("data-heat", h);
  await expect(page.getByTestId("follow-title")).toContainText("published");
  await expect(page.getByTestId("follow-reviewing")).toHaveCount(0);
  const kinds = (await seenOf(page)).map((s) => s.k.split("|").slice(0, 2).join("|"));
  expect(kinds).toContain("live|live");
  expect(kinds).toContain("reviewing|reviewing");
  expect(kinds.indexOf("live|live")).toBeLessThan(kinds.indexOf("reviewing|reviewing"));
  expect(kinds.slice(-1)[0]).toMatch(/^rotation\|(results|ladder)$/);
  // the old heats are never walked while the screen waited
  expect(kinds.slice(kinds.indexOf("live|live"), kinds.indexOf("reviewing|reviewing") + 1).every((k) => /^(live|reviewing)\|/.test(k))).toBe(true);
});

test("the Final goes live from the middle of the rotation and is published: three heats walk Results (3) → Ladder → Results (2) → Ladder → Results (1) → Ladder → Results (3), at the set seconds, each Results page matching the public results page", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await record(page);
  await page.goto(followUrl());
  await phaseIs(page, "rotation");
  const f = heatId("F-H1");
  await expect(page.getByTestId("follow-ladder-page")).toBeVisible({ timeout: (SECONDS + 3) * 1000 }); // mid-rotation
  await w.db.from("heats").update({ status: "scheduled", armed_at: new Date().toISOString(), prestart_sec: 60, duration_sec: 600 }).eq("id", f);
  await phaseIs(page, "live", 2_000);
  await w.db.from("heats").update({ status: "running", started_at: new Date().toISOString() }).eq("id", f);
  await w.db.from("heats").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", f);
  await phaseIs(page, "reviewing", 3_000);
  await publishHeat("F-H1");
  await phaseIs(page, "rotation", 3_000);
  // the walk starts at the first page after "Judges reviewing": 7 pages, then round again
  const startOf = async () => (await seenOf(page)).map((s) => s.k.startsWith("reviewing|")).lastIndexOf(true) + 1;
  const start = await startOf();
  await expect.poll(async () => (await seenOf(page)).length - start, { timeout: (SECONDS + 2) * 9 * 1000, intervals: [500] }).toBeGreaterThanOrEqual(8);
  const walk = (await seenOf(page)).slice(start, start + 8);
  const div = w.ladder.div;
  expect(walk.map((s) => s.k)).toEqual([
    `rotation|results|${f}`,
    `rotation|ladder|${div}`,
    `rotation|results|${heatId("R1-H2")}`,
    `rotation|ladder|${div}`,
    `rotation|results|${heatId("R1-H1")}`,
    `rotation|ladder|${div}`,
    `rotation|results|${f}`,
    `rotation|ladder|${div}`,
  ]);
  // each page stays up for the set seconds
  for (let i = 1; i < walk.length; i++) expect((walk[i].t - walk[i - 1].t) / 1000, `page ${i}`).toBeGreaterThan(SECONDS - 1);
  for (let i = 1; i < walk.length; i++) expect((walk[i].t - walk[i - 1].t) / 1000, `page ${i}`).toBeLessThan(SECONDS + 3);

  // the Results page of the Final is the public results page's heat, attempt by attempt
  const pub = await (await browser.newContext({ viewport: { width: 1000, height: 1400 } })).newPage();
  await pub.goto(`/e/${w.slug}/results?heat=${f}`);
  const publicRows = await pub.getByTestId("public-rider").evaluateAll((els) =>
    els.map((e) => ({ place: e.getAttribute("data-place"), total: e.querySelector('[data-testid="public-total"]')?.textContent?.trim(), formula: e.querySelector('[data-testid="public-formula"]')?.textContent?.trim(), boxes: [...e.querySelectorAll('[data-testid="score-box"]')].map((b) => ({ text: b.textContent?.trim(), tone: b.getAttribute("data-tone"), grade: b.getAttribute("data-grade") })) })),
  );
  await pub.context().close();
  expect(publicRows.length).toBeGreaterThan(0);
  await expect(page.getByTestId("follow-results-page")).toHaveAttribute("data-heat", f, { timeout: (SECONDS + 3) * 14 * 1000 });
  const screenRows = await page.getByTestId("follow-rider").evaluateAll((els) =>
    els.map((e) => ({ place: e.getAttribute("data-place"), total: e.querySelector('[data-testid="follow-total"]')?.textContent?.trim(), formula: e.querySelector('[data-testid="follow-formula"]')?.textContent?.trim(), boxes: [...e.querySelectorAll('[data-testid="score-box"]')].map((b) => ({ text: b.textContent?.trim(), tone: b.getAttribute("data-tone"), grade: b.getAttribute("data-grade") })) })),
  );
  expect(screenRows).toEqual(publicRows);
  // every attempt of every rider is there (a landed counted trick and a crash each), as on the public page
  expect(screenRows.map((r) => r.boxes.length)).toEqual([2, 2]);
  const tones = screenRows.flatMap((r) => r.boxes.map((b) => b.tone));
  expect(tones.filter((t) => t === "crash").length).toBe(2);
  expect(tones.filter((t) => t === "counted").length).toBe(2);
});

test("the live-scores switch: totals on the live heat only when the event allows live scores", async ({ page }) => {
  const [, h2] = w.heats;
  const settings = async (publicLiveScores: string) => {
    const { data } = await w.db.from("events").select("settings").eq("id", w.eventId).single();
    await w.db.from("events").update({ settings: { ...(data!.settings as object), publicLiveScores } as never }).eq("id", w.eventId);
  };
  await w.db.from("heats").update({ status: "running", started_at: ago(60), ended_at: null }).eq("id", h2);
  try {
    await settings("live");
    await page.goto(followUrl());
    await phaseIs(page, "live");
    await expect(page.getByTestId("follow-live-riders").getByTestId("follow-total").first()).toBeVisible();
    await expect(page.getByText("Scores published after the heat.")).toHaveCount(0);
    await settings("after_publish");
    await expect(page.getByText("Scores published after the heat.")).toBeVisible({ timeout: 6_000 });
    await expect(page.getByTestId("follow-live-riders").getByTestId("follow-total")).toHaveCount(0);
    await expect(page.getByTestId("follow-live-riders").getByTestId("follow-rider")).toHaveCount(4);
    // colours are always written out as text too
    await expect(page.getByTestId("follow-live-riders").getByTestId("rider-label-text").first()).toHaveText(/RED|BLUE|YELLOW|GREEN/i);
  } finally {
    await settings("live");
    await w.db.from("heats").update({ status: "scheduled", started_at: null }).eq("id", h2);
  }
});

test("a heat that does not fit at the TV size is split across two pages, not shrunk", async ({ page, request }) => {
  const [h1] = w.heats;
  await w.db.from("heats").update({ status: "published", started_at: ago(4300), ended_at: ago(3700), published_at: ago(3600) }).eq("id", h1);
  const body = (await (await request.get(`${followUrl()}/data`)).json()) as { payload: { pages: Array<{ kind: string; heatId?: string; part?: number; parts?: number; riders?: unknown[] }> } };
  const mine = body.payload.pages.filter((p) => p.kind === "results" && p.heatId === h1);
  expect(mine.map((p) => [p.part, p.parts])).toEqual([[1, 2], [2, 2]]);
  expect(mine.flatMap((p) => p.riders ?? []).length).toBe(4);
  await page.goto(followUrl());
  await expect(page.locator(`[data-testid="follow-results-page"][data-heat="${h1}"]`)).toBeVisible({ timeout: (SECONDS + 1) * 12 * 1000 });
  await expect(page.getByTestId("follow-part")).toHaveText("page 1 of 2");
  await expect(page.getByTestId("follow-title")).toContainText("Pro Men");
  await expect(page.getByTestId("follow-title")).toContainText("published");
});

/** Everything the owner asked for on the page that is on the screen now: no overflow, nothing cut, nothing smaller than the 10 m size. */
async function assertReadable(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('[data-testid="follow-body"]') as HTMLElement;
    const footer = document.querySelector("footer") as HTMLElement;
    const inBody = [...main.querySelectorAll("*")] as HTMLElement[];
    const withText = inBody.filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim()));
    const key = document.querySelector('[data-testid="follow-results-page"],[data-testid="follow-ladder-page"],[data-testid="follow-live-page"],[data-testid="follow-reviewing-page"]')?.getAttribute("data-testid") ?? "none";
    return {
      key,
      overflowY: main.scrollHeight - main.clientHeight,
      mainBottom: main.getBoundingClientRect().bottom,
      footerTop: footer.getBoundingClientRect().top,
      pageScroll: document.documentElement.scrollHeight - window.innerHeight,
      small: withText.map((e) => ({ t: (e.textContent ?? "").trim().slice(0, 30), px: parseFloat(getComputedStyle(e).fontSize) })).filter((x) => x.px < 34),
      sideways: inBody.filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).map((e) => e.tagName),
      ellipsis: ([...document.querySelectorAll("*")] as HTMLElement[]).filter((e) => getComputedStyle(e).textOverflow === "ellipsis").length,
      dots: /…|\.\.\./.test(document.body.innerText),
    };
  });
}

test("readable from 10 m on 1920 × 1080: every page of the walk fits without shrinking, nothing is cut with '…', nothing is smaller than 34 px", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto(followUrl());
  await phaseIs(page, "rotation");
  const checked = new Map<string, Awaited<ReturnType<typeof assertReadable>>>();
  const until = Date.now() + (SECONDS + 1) * 11 * 1000;
  while (Date.now() < until) {
    const r = await assertReadable(page);
    const id = `${r.key}:${await page.getByTestId("follow-title").innerText().catch(() => "")}:${await page.getByTestId("follow-part").innerText().catch(() => "")}`;
    if (!checked.has(id)) checked.set(id, r);
    await page.waitForTimeout(700);
  }
  expect(checked.size).toBeGreaterThanOrEqual(8); // 4 results pages (one split in two) and the ladder
  for (const [id, r] of checked) {
    expect(r.overflowY, `${id} overflows its room`).toBeLessThanOrEqual(1);
    expect(r.mainBottom, `${id} runs into the bottom line`).toBeLessThanOrEqual(r.footerTop + 1);
    expect(r.pageScroll, `${id} scrolls`).toBeLessThanOrEqual(0);
    expect(r.small, `${id} has text under 34 px`).toEqual([]);
    expect(r.sideways, `${id} runs off the right edge`).toEqual([]);
    expect(r.ellipsis, `${id} cuts text with an ellipsis`).toBe(0);
    expect(r.dots, `${id} shows '…'`).toBe(false);
  }
});

test("Day / Dark (key D, remembered, the quiet control never on text), Space pauses the walk, F toggles full screen", async ({ page }) => {
  await page.goto(followUrl());
  await phaseIs(page, "rotation");
  const mode = () => page.getByTestId("big-screen").getAttribute("data-mode");
  expect(await mode()).toBe("dark");
  await page.keyboard.press("d");
  await expect(page.getByTestId("big-screen")).toHaveAttribute("data-mode", "day");
  await page.reload();
  await expect(page.getByTestId("big-screen")).toHaveAttribute("data-mode", "day"); // remembered
  await page.mouse.move(300, 300);
  const toggle = page.getByTestId("screen-mode-toggle");
  await expect(toggle).toBeVisible();
  const box = (await toggle.boundingBox())!;
  const clash = await page.evaluate((b) => {
    const hit = (e: Element) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.left < b.x + b.width && r.right > b.x && r.top < b.y + b.height && r.bottom > b.y;
    };
    return ([...document.querySelectorAll('[data-testid="follow-screen"] *')] as HTMLElement[]).filter((e) => !e.closest('[data-testid="screen-mode-toggle"]') && [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim()) && hit(e)).map((e) => (e.textContent ?? "").slice(0, 30));
  }, box);
  expect(clash).toEqual([]);
  await page.keyboard.press("d");
  await expect(page.getByTestId("big-screen")).toHaveAttribute("data-mode", "dark");

  // Space pauses the walk
  const index = () => screen(page).getAttribute("data-index");
  await page.keyboard.press("Space");
  await expect(screen(page)).toHaveAttribute("data-paused", "true");
  await expect(page.getByTestId("screen-paused")).toBeVisible();
  const held = await index();
  await page.waitForTimeout((SECONDS + 2) * 1000);
  expect(await index()).toBe(held);
  await page.keyboard.press("Space");
  await expect(screen(page)).toHaveAttribute("data-paused", "false");
  await expect.poll(index, { timeout: (SECONDS + 3) * 1000 }).not.toBe(held);

  // F: full screen on and off
  await page.keyboard.press("f");
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement)), { timeout: 5_000 }).toBe(true);
  await page.keyboard.press("f");
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement)), { timeout: 5_000 }).toBe(false);
});

test("when the connection drops the screen keeps the last good page and shows a small 'Reconnecting' mark; never blank, never an error page", async ({ page }) => {
  await page.goto(followUrl());
  await phaseIs(page, "rotation");
  const title = await page.getByTestId("follow-title").innerText();
  await expect(page.getByTestId("follow-reconnecting")).toHaveCount(0);
  await page.route("**/follow/data", (route) => route.abort());
  await expect(page.getByTestId("follow-reconnecting")).toHaveText("Reconnecting", { timeout: 5_000 });
  await expect(screen(page)).toHaveAttribute("data-offline", "true");
  await page.waitForTimeout(3_000);
  await expect(page.getByTestId("follow-title")).toBeVisible(); // a page is still there
  expect((await page.getByTestId("follow-body").innerText()).length).toBeGreaterThan(20);
  await expect(page.getByText(/error|something went wrong|not found/i)).toHaveCount(0);
  expect(typeof title).toBe("string");
  // a server that answers with an error is the same
  await page.unroute("**/follow/data");
  await page.route("**/follow/data", (route) => route.fulfill({ status: 500, body: "boom" }));
  await expect(page.getByTestId("follow-reconnecting")).toBeVisible();
  await page.unroute("**/follow/data");
  await expect(page.getByTestId("follow-reconnecting")).toHaveCount(0, { timeout: 5_000 });
});

test("Event step: 'Follow the heat — seconds per page' (default 15, 5 to 120, refused outside) with a '?'; set to 7 the rotation follows", async ({ page }) => {
  test.setTimeout(180_000);
  await w.org.signIn(page, `/org/events/${w.eventId}/event`);
  await page.getByTestId("advanced-toggle").click();
  const field = page.getByLabel("Follow the heat — seconds per page", { exact: true });
  await expect(page.getByLabel("Big screen: seconds per page", { exact: true })).toBeVisible(); // beside the existing one
  await page.getByRole("button", { name: /Help: Follow the heat/ }).click();
  await expect(page.getByRole("note").filter({ hasText: "Big screen — Follow the heat" })).toBeVisible();
  for (const bad of ["4", "121"]) {
    await field.fill(bad);
    await page.getByRole("button", { name: /Save event/ }).click();
    await expect(page.getByText("Use a whole number of seconds from 5 to 120 for the pages of the Follow the heat screen")).toBeVisible();
  }
  await field.fill("7");
  await page.getByRole("button", { name: /Save event/ }).click();
  await expect.poll(async () => (await w.db.from("events").select("settings").eq("id", w.eventId).single()).data!.settings, { timeout: 20_000 }).toMatchObject({ followRotateSec: 7 });
  // the existing big screen's setting is untouched by it
  expect(((await w.db.from("events").select("settings").eq("id", w.eventId).single()).data!.settings as { screenRotateSec?: number }).screenRotateSec).not.toBe(7);

  const visitor = await page.context().browser()!.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await visitor.newPage();
  await record(tv);
  await tv.goto(followUrl());
  await phaseIs(tv, "rotation");
  await expect.poll(async () => (await seenOf(tv)).length, { timeout: 40_000, intervals: [500] }).toBeGreaterThanOrEqual(4);
  const seen = await seenOf(tv);
  for (let i = 2; i < 4; i++) {
    const dt = (seen[i].t - seen[i - 1].t) / 1000;
    expect(dt, `page ${i}`).toBeGreaterThan(6);
    expect(dt, `page ${i}`).toBeLessThan(10);
  }
  await visitor.close();
});
