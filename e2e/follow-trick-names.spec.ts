import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, test } from "./base";
import { breakdownOf } from "../tests/rls/public-helpers";
import { createPublicWorld, type PublicWorld } from "./public-world";

/**
 * "Big screen — Follow the heat" (/screen/<event>/follow) at 1920 × 1080, as a visitor, in a division on "trick name + score": a heat of three riders with 7 attempts
 * each and again with 10 each, live and on its Results page. Every attempt must be on a screen (split across pages that rotate when they do not fit) and nothing
 * may be cut off at the bottom: no row, and no box, may reach past the page body. One throwaway event; Arrow, EKL and Demo are never touched.
 */
test.use({ viewport: { width: 1920, height: 1080 } });
test.describe.configure({ mode: "serial" });

const SECONDS = 5;
const TRICKS = ["Left ×2 Backroll", "Right Kiteloop", "Left Frontroll Board-off", "Right ×3 Backroll Handle pass", "Left Megaloop", "Right Double loop"];
const COLOURS = ["red", "blue", "yellow"];
const ago = (sec: number) => new Date(Date.now() - sec * 1000).toISOString();
const followUrl = () => `/screen/${w.slug}/follow`;

let w: PublicWorld;
let roundId = "";
let number = 10;

/** One landed or crashed attempt of a rider: every fourth attempt is a crash; the score depends on rider and number. */
const attemptOf = (rider: number, n: number) => ({ seq: n, crash: n % 4 === 0, trick: TRICKS[(rider + n) % TRICKS.length], score: 3 + ((rider * 3 + n * 2) % 11) * 0.5 });

async function mkHeat3(status: string): Promise<string> {
  const db = w.db;
  const { data, error } = await db.from("heats").insert({ round_id: roundId, division_id: w.divisionId, event_id: w.eventId, number: ++number, duration_sec: 600, warm_up_sec: 0, status, ...(status === "running" ? { started_at: ago(60) } : {}) }).select("id").single();
  if (error || !data) throw new Error(`heat: ${error?.message}`);
  for (let p = 0; p < 3; p++) await db.from("heat_slots").insert({ heat_id: data.id, position: p + 1, entry_id: w.entries[p], vest_colour: COLOURS[p] });
  return data.id;
}

/** A heat on the water: `n` attempts for each of three riders, every landing scored by all three judges. */
async function liveHeat(n: number): Promise<string> {
  const heat = await mkHeat3("running");
  for (let r = 0; r < 3; r++) {
    for (let s = 1; s <= n; s++) {
      const a = attemptOf(r, s);
      const { data, error } = await w.db.from("trick_attempts").insert({ heat_id: heat, entry_id: w.entries[r], seq: s, status: a.crash ? "crashed" : "landed", trick_name: a.trick, direction: a.trick.startsWith("Right") ? "right" : "left", client_key: randomUUID() }).select("id").single();
      if (error || !data) throw new Error(`attempt: ${error?.message}`);
      if (!a.crash) {
        for (const seat of [w.seats.j1.id, w.seats.j2.id, w.seats.j3.id]) {
          const { error: e } = await w.db.from("trick_scores").insert({ attempt_id: data.id, heat_id: heat, event_id: w.eventId, judge_seat_id: seat, score: a.score, client_key: randomUUID() });
          if (e) throw new Error(`score: ${e.message}`);
        }
      }
    }
  }
  return heat;
}

/** A published heat with a result for each of three riders and `n` attempts each. */
async function publishedHeat(n: number, publishedSecAgo: number): Promise<string> {
  const heat = await mkHeat3("published");
  const rows = [0, 1, 2].map((r) => {
    const attempts = Array.from({ length: n }, (_, i) => attemptOf(r, i + 1));
    const total = Math.round(attempts.filter((a) => !a.crash).reduce((t, a) => t + a.score, 0) * 100) / 100;
    const bd = breakdownOf(total) as Record<string, unknown>;
    bd.allAttempts = attempts.map((a) => ({
      seq: a.seq, status: a.crash ? "crashed" : "landed", trickName: a.trick, categoryKey: null, score: a.crash ? null : a.score, counted: !a.crash, repeatIndex: 0, priorCrashesSameTrick: 0,
      panel: a.crash ? null : { score: a.score, judgeScores: [{ judgeId: "J1", score: a.score }] },
    }));
    bd.attemptCount = n;
    bd.attemptCap = 10;
    return { r, total, bd };
  });
  rows.sort((a, b) => b.total - a.total);
  for (const [i, x] of rows.entries()) await w.db.from("heat_results").insert({ event_id: w.eventId, heat_id: heat, entry_id: w.entries[x.r], place: i + 1, total: x.total, percent: 50, breakdown: x.bd as never, version: 1 });
  await w.db.from("heats").update({ started_at: ago(publishedSecAgo + 900), ended_at: ago(publishedSecAgo + 300), published_at: ago(publishedSecAgo), publish_hold: false }).eq("id", heat);
  return heat;
}

/**
 * Watches the screen until every attempt of the heat has been on it (the pages rotate when the riders do not fit), checking each page as it goes: nothing reaches past
 * the page body, no box is shortened, no two pages show the same rider. Returns how many pages the heat took.
 */
async function watch(page: Page, kind: "follow-live-page" | "follow-results-page", heat: string, expected: number): Promise<number> {
  const riders = new Map<string, number>();
  const parts = new Set<string>();
  const t0 = Date.now();
  while (Date.now() - t0 < 100_000) {
    const snap = await page.evaluate(
      ({ kind, heat }) => {
        const root = document.querySelector(`[data-testid="${kind}"][data-heat="${heat}"]`);
        if (!root) return null;
        const body = document.querySelector('[data-testid="follow-body"]') as HTMLElement;
        const b = body.getBoundingClientRect();
        const rows = [...root.querySelectorAll('[data-testid="follow-rider"]')] as HTMLElement[];
        return {
          bodyBottom: b.bottom,
          overflow: body.scrollHeight - body.clientHeight,
          rows: rows.map((r) => {
            const rect = r.getBoundingClientRect();
            const boxes = [...r.querySelectorAll('[data-testid="score-box"]')] as HTMLElement[];
            const tricks = [...r.querySelectorAll('[data-testid="score-box-trick"]')] as HTMLElement[];
            return {
              key: r.getAttribute("data-place") ?? r.textContent!.slice(0, 12),
              bottom: rect.bottom,
              boxes: boxes.length,
              lowestBox: Math.max(0, ...boxes.map((x) => x.getBoundingClientRect().bottom)),
              shortened: tricks.filter((t) => t.scrollWidth > t.clientWidth).length,
              texts: boxes.map((x) => x.textContent),
            };
          }),
        };
      },
      { kind, heat },
    );
    if (snap) {
      expect(snap.overflow, "the page body has content past its bottom").toBeLessThanOrEqual(1);
      for (const r of snap.rows) {
        expect(r.bottom, `rider ${r.key}: the row reaches past the page`).toBeLessThanOrEqual(snap.bodyBottom + 1);
        expect(r.lowestBox, `rider ${r.key}: a row of attempts is cut off`).toBeLessThanOrEqual(snap.bodyBottom + 1);
        expect(r.shortened, `rider ${r.key}: a box is shortened on the TV`).toBe(0);
        for (const t of r.texts) expect(t, "a box without its score").toMatch(/^\d+ · (CRASH|(.+ · )?\d+\.\d|…)$/);
        if (!riders.has(r.key)) riders.set(r.key, r.boxes);
        else expect(riders.get(r.key), `rider ${r.key} is on two pages`).toBe(r.boxes);
      }
      parts.add(snap.rows.map((r) => r.key).join("|"));
      if ([...riders.values()].reduce((a, b) => a + b, 0) >= expected) break;
    }
    await page.waitForTimeout(400);
  }
  expect(riders.size).toBe(3);
  expect([...riders.values()].reduce((a, b) => a + b, 0)).toBe(expected);
  return parts.size;
}

test.beforeAll(async () => {
  test.setTimeout(300_000);
  w = await createPublicWorld({ attemptDisplay: "trick_score", settings: { followRotateSec: SECONDS } });
  const [h1, h2] = w.heats;
  await w.db.from("heats").update({ status: "scheduled", started_at: null, ended_at: null, published_at: null }).in("id", [h1, h2]);
  roundId = (await w.db.from("rounds").select("id").eq("division_id", w.divisionId).single()).data!.id;
  // up to 10 attempts a rider in this division
  await w.db.from("divisions").update({ scoring_overrides: { heat: { maxAttemptsPerRider: 10 } } as never }).eq("id", w.divisionId);
});
test.afterAll(async () => {
  await w?.cleanup();
});

for (const n of [7, 10]) {
  test(`the live heat: three riders with ${n} attempts each, every attempt with its trick on screen and nothing cut off`, async ({ page }) => {
    test.setTimeout(240_000);
    const heat = await liveHeat(n);
    await page.goto(followUrl());
    await expect(page.getByTestId("follow-screen")).toHaveAttribute("data-phase", "live", { timeout: 30_000 });
    await expect(page.getByTestId("follow-live-page")).toHaveAttribute("data-heat", heat, { timeout: 30_000 });
    await expect(page.getByTestId("score-box").first()).toContainText(/^\d+ · .+ · \d+\.\d$|CRASH/);
    const pages = await watch(page, "follow-live-page", heat, 3 * n);
    expect(pages).toBeGreaterThanOrEqual(1);
    // this heat is over for the screen: the next test needs the rotation or another heat
    await w.db.from("heats").update({ status: "scheduled", started_at: null }).eq("id", heat);
  });
}

for (const n of [7, 10]) {
  test(`a Results page: three riders with ${n} attempts each, every attempt with its trick on screen and nothing cut off`, async ({ page }) => {
    test.setTimeout(240_000);
    const heat = await publishedHeat(n, n === 7 ? 200 : 100);
    await page.goto(followUrl());
    await expect(page.getByTestId("follow-screen")).toHaveAttribute("data-phase", "rotation", { timeout: 30_000 });
    await watch(page, "follow-results-page", heat, 3 * n);
  });
}
