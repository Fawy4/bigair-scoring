import { test, expect, installSupabaseProxy } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";

// Phase 5b step 2 on a throwaway event: the spotter's phone opens the running heat by itself, logs by tap, by typing and by speaking (a stand-in for the
// browser's speech recognition), CRASH asks once, the 7th attempt greys a rider out and a delete gives the place back, Undo works for 10 seconds,
// and a second spotter's attempt a few seconds later shows "Possible duplicate". Everything is removed by the ledger.
let w: LiveWorld;
test.beforeEach(async () => {
  w = await createLiveWorld();
});
test.afterEach(async () => {
  await w?.cleanup();
});

const attemptsOf = async (entry: string) => (await w.db.from("trick_attempts").select("id, seq, status, trick_name, trick_parts, input_method, raw_text, deleted_at, possible_duplicate_of, created_by_seat").eq("heat_id", w.heats[0]).eq("entry_id", entry).order("seq")).data ?? [];
const block = (page: import("@playwright/test").Page, id: string) => page.locator(`[data-block="${id}"]`);

test("the spotter phone opens the running heat by itself and logs by tap, by typing and by speaking; CRASH asks once", async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    // a stand-in for the browser's speech recognition: it "hears" the same words every time
    class Fake {
      lang = "";
      interimResults = false;
      maxAlternatives = 1;
      continuous = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(() => {
          this.onresult?.({ results: [[{ transcript: "left banana jump", confidence: 0.9 }]] });
          this.onend?.();
        }, 100);
      }
      stop() {}
    }
    // Chromium has its own; replace both names so the page hears what the test says
    for (const key of ["webkitSpeechRecognition", "SpeechRecognition"]) Object.defineProperty(window, key, { value: Fake, configurable: true, writable: true });
  });
  await w.signInAs(page, "spotter", "/seat");
  // joining sends the phone to its own screen; with no heat running it waits and says what is next
  await expect(page).toHaveURL(new RegExp(`/spot/${w.eventId}`));
  await expect(page.getByTestId("between-heats")).toBeVisible();
  await expect(page.getByTestId("next-heat")).toContainText("Pro Men · R1 · Heat 1");

  // the laptop starts the heat: the phone opens it by itself
  await w.startHeat(w.heats[0]);
  await expect(page.getByTestId("trick-builder")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("rider-tile")).toHaveCount(4);
  await expect(page.getByTestId("rider-tile").first()).toContainText("RED");
  await expect(page.getByTestId("rider-tile").first()).toContainText("Sam Rivera");

  // by tap: Left, Backroll, ×2 (a multiplier belongs to the block before it), Board-off
  const name = page.getByTestId("composed-name");
  for (const id of ["direction:left", "base:backroll", "multiplier:x2", "addon:board_off"]) await block(page, id).click();
  await expect(name.locator("p.sr-only")).toHaveText("Left ×2 Backroll Board-off");
  await page.getByTestId("log-button").click();
  await expect(name).toContainText("Logged — RED — attempt 1");
  await expect.poll(async () => (await attemptsOf(w.entries[0])).length).toBe(1);
  expect((await attemptsOf(w.entries[0]))[0]).toMatchObject({ seq: 1, status: "landed", trick_name: "Left ×2 Backroll Board-off", input_method: "builder" });

  // by typing: the words become blocks to confirm, then Log
  await page.locator("#trick-text").fill("right mega");
  await page.locator("#trick-text").press("Enter");
  await expect(name.locator("p.sr-only")).toHaveText("Right Megaloop");
  await page.getByTestId("log-button").click();
  await expect(name).toContainText("Logged — RED — attempt 2");
  await expect.poll(async () => (await attemptsOf(w.entries[0])).length).toBe(2);
  expect((await attemptsOf(w.entries[0]))[1]).toMatchObject({ trick_name: "Right Megaloop", input_method: "text", raw_text: "right mega" });

  // by speaking: "banana jump" is not guessed, it is shown as free text for the head judge
  await page.getByTestId("mic-button").click();
  await expect(page.getByTestId("free-text")).toContainText("banana jump");
  await expect(page.getByTestId("free-text-note")).toHaveText("Free text — head judge will check");
  await page.getByTestId("log-button").click();
  await expect(name).toContainText("Logged — RED — attempt 3");
  await expect.poll(async () => (await attemptsOf(w.entries[0])).length).toBe(3);
  const third = (await attemptsOf(w.entries[0]))[2];
  expect(third).toMatchObject({ input_method: "speech", trick_name: "Left banana jump" });
  expect((third.trick_parts as { needsReview?: boolean }).needsReview).toBe(true);

  // CRASH asks once, then logs a crash with the trick that was built
  await block(page, "direction:right").click();
  await block(page, "base:frontroll").click();
  await page.getByTestId("crash-button").click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByTestId("crash-yes").click();
  await expect(name).toContainText("Logged — RED — attempt 4");
  await expect.poll(async () => (await attemptsOf(w.entries[0])).length).toBe(4);
  expect((await attemptsOf(w.entries[0]))[3]).toMatchObject({ status: "crashed", trick_name: "Right Frontroll" });
});

test("the 7th attempt greys the rider out, Log is off, and a delete on the laptop gives the place back", async ({ page }) => {
  test.setTimeout(240_000);
  await w.startHeat(w.heats[0]);
  await w.signInAs(page, "spotter", `/spot/${w.eventId}`);
  await expect(page.getByTestId("trick-builder")).toBeVisible({ timeout: 20_000 });
  const red = page.getByTestId("rider-tile").first();
  const name = page.getByTestId("composed-name");
  for (let i = 1; i <= 7; i++) {
    await block(page, "direction:left").click();
    await block(page, "base:backroll").click();
    await page.getByTestId("log-button").click();
    await expect(name).toContainText(`Logged — RED — attempt ${i}`);
  }
  await expect(red).toHaveAttribute("data-out", "true");
  await expect(red.getByTestId("rider-tile-counter")).toContainText("7 / 7");
  await expect(page.getByTestId("builder-note")).toHaveText("RED is out of attempts · 7 / 7");
  await block(page, "base:backroll").click();
  await expect(page.getByTestId("log-button")).toBeDisabled();
  await expect.poll(async () => (await attemptsOf(w.entries[0])).length, { timeout: 30_000 }).toBe(7);
  // the head judge deletes one: the label comes back live, "6 / 7"
  const first = (await attemptsOf(w.entries[0]))[0];
  await w.db.from("trick_attempts").update({ deleted_at: new Date().toISOString() }).eq("id", first.id);
  await expect(red).toHaveAttribute("data-out", "false", { timeout: 15_000 });
  await expect(red.getByTestId("rider-tile-counter")).toHaveText("6 / 7");
});

test("Undo last works for ten seconds and takes the attempt back", async ({ page }) => {
  test.setTimeout(120_000);
  await w.startHeat(w.heats[0]);
  await w.signInAs(page, "spotter", `/spot/${w.eventId}`);
  await expect(page.getByTestId("trick-builder")).toBeVisible({ timeout: 20_000 });
  await block(page, "direction:left").click();
  await block(page, "base:backroll").click();
  await page.getByTestId("log-button").click();
  await expect.poll(async () => (await attemptsOf(w.entries[0])).length).toBe(1);
  await page.getByTestId("undo-button").click();
  await expect.poll(async () => (await attemptsOf(w.entries[0]))[0]?.deleted_at ?? null, { timeout: 20_000 }).not.toBeNull();
  await expect(page.getByTestId("undo-button")).toHaveCount(0);
  const line = (await w.db.from("audit_log").select("action").eq("event_id", w.eventId).eq("action", "attempt_undone")).data ?? [];
  expect(line).toHaveLength(1);
});

test("a second spotter logging the same rider a few seconds later shows Possible duplicate on both feeds", async ({ browser }) => {
  test.setTimeout(180_000);
  await w.startHeat(w.heats[0]);
  const phone = async () => {
    const context = await browser.newContext();
    await installSupabaseProxy(context);
    return context.newPage();
  };
  const a = await phone();
  const b = await phone();
  try {
    await w.signInAs(a, "spotter", `/spot/${w.eventId}`);
    await w.signInAs(b, "spotter2", `/spot/${w.eventId}`);
    for (const p of [a, b]) await expect(p.getByTestId("trick-builder")).toBeVisible({ timeout: 20_000 });
    for (const p of [a, b]) {
      await block(p, "direction:left").click();
      await block(p, "base:backroll").click();
      await p.getByTestId("log-button").click();
      await expect(p.getByTestId("composed-name")).toContainText("Logged — RED — attempt");
    }
    await expect.poll(async () => (await attemptsOf(w.entries[0])).length, { timeout: 30_000 }).toBe(2);
    for (const p of [a, b]) {
      await p.getByTestId("details-toggle").click();
      await expect(p.getByTestId("feed-line")).toHaveCount(2, { timeout: 15_000 });
      await expect(p.getByTestId("feed")).toContainText("Possible duplicate");
    }
  } finally {
    await a.context().close();
    await b.context().close();
  }
});
