import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, test } from "./base";
import { createPublicWorld, type PublicWorld } from "./public-world";

/**
 * Public scores – short trick names, on a phone (390 × 844) as a visitor: in a division on "trick name + score" the Live tab, Results and a rider's page show
 * "L ×2 BR" between the number and the score; the longest trick keeps its score fully inside the card; a division on "attempt number + score" looks as it always did,
 * and its pages are not even sent a trick. One throwaway event (Pro Men: a published heat and a heat on the water). Arrow, EKL and Demo are never touched.
 */
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
test.describe.configure({ mode: "serial" });

const LONG = "Left ×2 Backroll Board-off Handle pass Late rotations Tic-tac Toeside Stalefish";
const LONG_SHORT = "L ×2 BR BO HP Late rotations Tic-tac Toeside Stalefish";

let w: PublicWorld;
const url = (path = "") => `/e/${w.slug}${path}`;
const rider = (page: Page, colour: string) => page.getByTestId("public-rider").filter({ hasText: colour }).first();
const setMode = (mode: string) => w.db.from("divisions").update({ live_settings: { spectatorAttemptDisplay: mode } as never }).eq("id", w.divisionId);
const rawHtml = async (page: Page, path: string): Promise<string> => (await page.request.get(url(path))).text();

async function scoreAttempt(heat: string, attempt: string, score: number) {
  for (const seat of [w.seats.j1.id, w.seats.j2.id, w.seats.j3.id]) {
    const { error } = await w.db.from("trick_scores").insert({ attempt_id: attempt, heat_id: heat, event_id: w.eventId, judge_seat_id: seat, score, client_key: randomUUID() });
    if (error) throw new Error(`score: ${error.message}`);
  }
}

test.beforeAll(async () => {
  test.setTimeout(300_000);
  w = await createPublicWorld({ attemptDisplay: "trick_score" });
  const db = w.db;
  // the heat on the water: Red's first landing is a left ×2 Backroll, then a crash, then a very long trick; Blue lands a right Frontroll; Yellow a Kiteloop with no side
  const attempts = (await db.from("trick_attempts").select("id, entry_id, seq").eq("heat_id", w.running).order("seq")).data ?? [];
  const find = (entry: string, seq: number) => attempts.find((a) => a.entry_id === entry && a.seq === seq)!.id;
  await db.from("trick_attempts").update({ trick_name: "×2 Backroll", direction: "left" }).eq("id", find(w.entries[0], 1));
  await db.from("trick_attempts").update({ trick_name: "Frontroll", direction: "right" }).eq("id", find(w.entries[1], 1));
  const long = (await db.from("trick_attempts").insert({ heat_id: w.running, entry_id: w.entries[0], seq: 3, status: "landed", trick_name: LONG, direction: "left", client_key: randomUUID() }).select("id").single()).data!.id;
  await scoreAttempt(w.running, long, 5.5);
  // Green has one landing whose trick the spotter has not logged yet
  const bare = (await db.from("trick_attempts").insert({ heat_id: w.running, entry_id: w.entries[3], seq: 1, status: "landed", client_key: randomUUID() }).select("id").single()).data!.id;
  await scoreAttempt(w.running, bare, 2.5);
  // the published heat: Red's result carries the same kinds of attempt
  const result = (await db.from("heat_results").select("id, breakdown").eq("heat_id", w.published).eq("entry_id", w.entries[0]).single()).data!;
  const bd = result.breakdown as { allAttempts: Array<Record<string, unknown>> };
  bd.allAttempts[0].trickName = "Left ×2 Backroll";
  bd.allAttempts.push({ seq: 5, status: "landed", trickName: LONG, categoryKey: null, score: 3.5, counted: false, repeatIndex: 0, priorCrashesSameTrick: 0, panel: { score: 3.5, judgeScores: [{ judgeId: "J1", score: 3.5 }] } });
  await db.from("heat_results").update({ breakdown: bd as never }).eq("id", result.id);
});
test.afterAll(async () => {
  await w?.cleanup();
});

test("Live tab: number, side and short trick, then the score; a crash is only CRASH; no trick logged yet is number and score", async ({ page }) => {
  await page.goto(url("/live"));
  const red = rider(page, "RED").getByTestId("score-box");
  await expect(red.nth(0)).toHaveText("1 · L ×2 BR · 6.0");
  await expect(red.nth(1)).toHaveText("2 · CRASH");
  await expect(red.nth(1)).not.toHaveAttribute("data-trick", /.+/);
  await expect(red.nth(2)).toHaveText(`3 · ${LONG_SHORT} · 5.5`);
  await expect(rider(page, "BLUE").getByTestId("score-box").first()).toHaveText("1 · R FR · 4.5");
  await expect(rider(page, "YELLOW").getByTestId("score-box").first()).toHaveText("1 · KL · 3.0"); // no side set: nothing before the trick
  await expect(rider(page, "GREEN").getByTestId("score-box").first()).toHaveText("1 · 2.5");
});

test("Live tab: a trick logged later fills in by itself, and a corrected trick updates the same way (no reload)", async ({ page }) => {
  await page.goto(url("/live"));
  const green = rider(page, "GREEN").getByTestId("score-box");
  await expect(green.first()).toHaveText("1 · 2.5");
  await w.db.from("trick_attempts").update({ trick_name: "Backroll", direction: "right" }).eq("heat_id", w.running).eq("entry_id", w.entries[3]).eq("seq", 1);
  await expect(green.first()).toHaveText("1 · R BR · 2.5", { timeout: 45_000 });
  await w.db.from("trick_attempts").update({ trick_name: "Frontroll", direction: "left" }).eq("heat_id", w.running).eq("entry_id", w.entries[3]).eq("seq", 1);
  await expect(green.first()).toHaveText("1 · L FR · 2.5", { timeout: 45_000 });
});

test("phone: the longest box keeps its number and score fully inside the card; only its trick part shortens with …; the full short form is its label", async ({ page }) => {
  await page.goto(url("/live"));
  const box = rider(page, "RED").getByTestId("score-box").nth(2);
  await expect(box).toHaveAttribute("aria-label", `3 · ${LONG_SHORT} · 5.5`);
  const m = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="public-rider"]') as HTMLElement;
    const boxes = [...document.querySelectorAll('[data-testid="score-box"]')] as HTMLElement[];
    const out = boxes.map((b) => {
      const r = b.getBoundingClientRect();
      const c = b.closest('[data-testid="public-rider"]')!.getBoundingClientRect();
      const trick = b.querySelector('[data-testid="score-box-trick"]') as HTMLElement | null;
      const parts = trick ? ([...trick.parentElement!.children] as HTMLElement[]).map((p) => p.getBoundingClientRect()) : [];
      return { text: b.textContent, inside: r.left >= c.left - 0.5 && r.right <= c.right + 0.5, partsInside: parts.every((p) => p.left >= c.left - 0.5 && p.right <= c.right + 0.5), shortened: trick ? trick.scrollWidth > trick.clientWidth : false, lines: r.height };
    });
    return { out, pageWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, cardWidth: card.getBoundingClientRect().width };
  });
  expect(m.pageWidth).toBeLessThanOrEqual(m.innerWidth); // no sideways scrolling
  for (const b of m.out) {
    expect(b.inside, `"${b.text}" leaves the card`).toBe(true);
    expect(b.partsInside, `"${b.text}": a part leaves the card`).toBe(true);
  }
  const longest = m.out.find((b) => b.text?.includes("Stalefish"))!;
  expect(longest.shortened).toBe(true); // only the trick part gave way
  // the score is still read: the number and the score parts keep their own width
  const parts = await box.evaluate((b) => [...b.querySelector('[data-testid="score-box-trick"]')!.parentElement!.children].map((c) => ({ w: (c as HTMLElement).getBoundingClientRect().width, h: (c as HTMLElement).getBoundingClientRect().height })));
  expect(parts[0].w).toBeGreaterThan(8);
  expect(parts[2].w).toBeGreaterThan(8);
  expect(parts[0].h).toBeLessThan(30); // never wrapped onto a second line
  expect(parts[2].h).toBeLessThan(30);
});

test("Results: the same boxes after Publish, with the longest trick inside the card", async ({ page }) => {
  await page.goto(url(`/results?heat=${w.published}`));
  const red = rider(page, "RED").getByTestId("score-box");
  await expect(red.nth(0)).toHaveText("1 · L ×2 BR · 7.0");
  await expect(red.nth(1)).toHaveText("2 · FR · 5.5"); // no side was logged for this one
  await expect(red.nth(3)).toHaveText("4 · CRASH");
  await expect(red.nth(4)).toHaveText(`5 · ${LONG_SHORT} · 3.5`);
  const inside = await page.evaluate(() => [...document.querySelectorAll('[data-testid="score-box"]')].every((b) => b.getBoundingClientRect().right <= b.closest('[data-testid="public-rider"]')!.getBoundingClientRect().right + 0.5));
  expect(inside).toBe(true);
});

test("a rider's page shows the same boxes", async ({ page }) => {
  await page.goto(url(`/riders/${w.entries[0]}`));
  const boxes = page.getByTestId("score-box");
  await expect(boxes.first()).toHaveText("1 · L ×2 BR · 7.0");
  await expect(boxes.nth(3)).toHaveText("4 · CRASH");
  await expect(boxes.nth(4)).toHaveText(`5 · ${LONG_SHORT} · 3.5`);
});

test("the page is sent no trick that it does not show: not the crash's, and nothing at all in the other two settings", async ({ page }) => {
  for (const path of ["/live", `/results?heat=${w.published}`, `/riders/${w.entries[0]}`]) {
    const html = await rawHtml(page, path);
    expect(html, `${path}: a crash's trick was sent`).not.toContain("Megaloop");
  }
  for (const mode of ["number_score", "score_only"]) {
    await setMode(mode);
    for (const path of ["/live", `/results?heat=${w.published}`, `/riders/${w.entries[0]}`]) {
      const html = await rawHtml(page, path);
      for (const trick of ["Megaloop", "Kiteloop", "Frontroll", "Stalefish", "Handle pass"]) expect(html, `${mode} ${path}: "${trick}" was sent`).not.toContain(trick);
    }
  }
  await setMode("trick_score");
});

test("a division on attempt number + score looks as it always did", async ({ page }) => {
  await setMode("number_score");
  try {
    await page.goto(url("/live"));
    const red = rider(page, "RED").getByTestId("score-box");
    await expect(red.nth(0)).toHaveText("1 · 6.0");
    await expect(red.nth(1)).toHaveText("2 · CRASH");
    await expect(red.nth(2)).toHaveText("3 · 5.5");
    await expect(page.getByTestId("score-box-trick")).toHaveCount(0);
    await page.goto(url(`/results?heat=${w.published}`));
    await expect(rider(page, "RED").getByTestId("score-box").nth(0)).toHaveText("1 · 7.0");
    await expect(page.getByTestId("score-box-trick")).toHaveCount(0);
    await setMode("score_only");
    await page.goto(url(`/results?heat=${w.published}`));
    await expect(rider(page, "RED").getByTestId("score-box").nth(0)).toHaveText("7.0");
  } finally {
    await setMode("trick_score");
  }
});

test("with live scores off a trick shows only after Publish, together with the score", async ({ page }) => {
  const { data: ev } = await w.db.from("events").select("settings").eq("id", w.eventId).single();
  const settings = ev!.settings as Record<string, unknown>;
  await w.db.from("events").update({ settings: { ...settings, publicLiveScores: "after_publish" } as never }).eq("id", w.eventId);
  try {
    await page.goto(url("/live"));
    await expect(page.getByTestId("scores-after")).toBeVisible();
    await expect(page.getByTestId("score-box")).toHaveCount(0);
    expect(await rawHtml(page, "/live")).not.toContain("Stalefish");
    await page.goto(url(`/results?heat=${w.published}`));
    await expect(rider(page, "RED").getByTestId("score-box").nth(0)).toHaveText("1 · L ×2 BR · 7.0");
  } finally {
    await w.db.from("events").update({ settings: settings as never }).eq("id", w.eventId);
  }
});
