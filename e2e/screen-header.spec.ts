import { expect, test, type Page } from "@playwright/test";
import { createPublicWorld, type PublicWorld } from "./public-world";

// Fix 2, item 6 — the big screen (and the Flag view) never cut a word with "…": a 40-character event name and a 30-character heat name at 1920 × 1080 and at
// 1280 × 720. The heat pill shows the whole heat name and takes its room first; the event name wraps (never below 2vw); the quiet Day / Dark control gets its own
// corner and never covers text; no text is clipped on any page of the rotation (live heat, timetable, latest result, sponsors).
const EVENT_NAME = "Arrow Big Air El Gouna Launch Event 2026"; // 40 characters
const HEAT_NAME = "Advanced Men Semi Final Heat 7"; // 30 characters
let w: PublicWorld;
test.beforeAll(async () => {
  test.setTimeout(240_000);
  w = await createPublicWorld({ settings: { screenRotateSec: 60, flags: { enabled: true, prestartSec: 60, lastMinuteSec: 60 } } });
  expect(EVENT_NAME).toHaveLength(40);
  expect(HEAT_NAME).toHaveLength(30);
  await w.db.from("events").update({ name: EVENT_NAME, branding: { sponsors: [{ name: "WOO Events and a sponsor with a rather long name" }] } }).eq("id", w.eventId);
  // between heats: the running heat is over, the next one is the long-named heat of the ladder
  await w.db.from("heats").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", w.running);
  await w.db.from("heats").update({ name: HEAT_NAME }).eq("id", w.ladder.heats["R1-H2"]);
  await w.db.from("divisions").update({ name: "Advanced Women Freestyle" }).eq("id", w.ladder.div);
});
test.afterAll(async () => {
  await w?.cleanup();
});

/** Every element with text: cut off by an ellipsis or a clip, or sticking out of the window. */
async function cutText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const root = document.querySelector('[data-testid="big-screen"], [data-testid="flag-view"]')!;
    for (const el of Array.from(root.querySelectorAll("*"))) {
      if (!(el instanceof HTMLElement) || !el.offsetParent && getComputedStyle(el).position !== "fixed") continue;
      const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim());
      if (!own || el.closest(".sr-only")) continue;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const text = (el.textContent ?? "").trim().slice(0, 40);
      if (cs.textOverflow === "ellipsis") out.push(`ellipsis: ${text}`);
      if ((cs.overflowX === "hidden" || cs.overflowX === "clip") && el.scrollWidth > el.clientWidth + 1) out.push(`clipped sideways: ${text}`);
      if ((cs.overflowY === "hidden" || cs.overflowY === "clip") && el.scrollHeight > el.clientHeight + 1 && r.height > 0) out.push(`clipped vertically: ${text}`);
      if (r.right > window.innerWidth + 1 || r.left < -1 || r.bottom > window.innerHeight + 1) out.push(`outside the window: ${text}`);
    }
    return out;
  });
}
const box = async (page: Page, testId: string) => (await page.getByTestId(testId).first().boundingBox())!;
const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;

for (const [width, height] of [[1920, 1080], [1280, 720]] as const) {
  test(`big screen at ${width} × ${height}: a 40-character event name and a 30-character heat name — nothing cut, nothing overlapping`, async ({ browser }) => {
    test.setTimeout(180_000);
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    await page.goto(`/screen/${w.slug}`);
    await expect(page.getByTestId("screen-header")).toBeVisible();
    await expect(page.getByTestId("screen-flag")).toBeVisible();

    // the event name: whole, readable from 10 metres (at least 2vw), wrapping if it must
    const name = page.getByTestId("screen-event-name");
    await expect(name).toHaveText(EVENT_NAME);
    expect(await name.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(width * 0.02 - 0.5);
    // the heat pill shows the whole heat name
    const pill = await page.getByTestId("screen-flag").innerText();
    console.log(`PILL ${width}: ${pill.replace(/\n/g, " ")}`);
    expect(pill).toContain("Semi Final Heat 7");
    // header items never overlap each other
    const items = ["screen-event-name", "screen-flag"];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) expect(overlap(await box(page, items[i]), await box(page, items[j])), `${items[i]} overlaps ${items[j]}`).toBe(false);

    // every page of the rotation: nothing cut
    const slides = await page.getByTestId("screen-slide").count();
    expect(slides).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < Math.min(slides, 9); i++) {
      await page.keyboard.press(String(i + 1));
      await expect(page.getByTestId("screen-rotator")).toHaveAttribute("data-index", String(i));
      expect(await cutText(page), `page ${i + 1}`).toEqual([]);
    }

    // the quiet Day / Dark control: its own corner, never on text
    let x = 300;
    await expect(async () => {
      await page.mouse.move((x += 7), 300);
      await expect(page.getByTestId("screen-mode-toggle")).toBeVisible({ timeout: 700 });
    }).toPass({ timeout: 20_000 });
    const toggle = await box(page, "screen-mode-toggle");
    const texts = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="big-screen"] *'))
        .filter((el) => el instanceof HTMLElement && el.offsetParent && el.getAttribute("data-testid") !== "screen-mode-toggle" && !el.closest('[data-testid="screen-mode-toggle"]') && Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim()))
        .map((el) => { const r = el.getBoundingClientRect(); return { text: (el.textContent ?? "").trim().slice(0, 30), x: r.x, y: r.y, width: r.width, height: r.height }; }),
    );
    for (const t of texts) expect(overlap(toggle, t), `the Day / Dark control covers "${t.text}"`).toBe(false);
    // and the QR note is whole and visible
    await expect(page.getByTestId("screen-qr-note")).toBeVisible();
    expect(await cutText(page)).toEqual([]);
    await context.close();
  });
}

test("the Flag view: a long event name and a long heat name wrap, nothing is cut with an ellipsis", async ({ browser }) => {
  test.setTimeout(120_000);
  for (const [width, height] of [[1920, 1080], [1280, 720], [390, 844]] as const) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    await page.goto(`/e/${w.slug}/flag`);
    await expect(page.getByTestId("flag-event")).toHaveText(EVENT_NAME);
    expect(await cutText(page), `${width}px`).toEqual([]);
    await context.close();
  }
});
