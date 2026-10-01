import { test, expect, installSupabaseProxy } from "./base";
import { createLiveWorld } from "./live-world";
test("debug screenshot", async ({ browser }) => {
  test.setTimeout(200_000);
  const w = await createLiveWorld();
  try {
    await w.startHeat(w.heats[0]);
    for (const seq of [1, 2]) {
      const att = (await w.db.from("trick_attempts").insert({ heat_id: w.heats[0], entry_id: w.entries[0], seq, status: "landed", trick_name: "Left Backroll", direction: "left", client_key: crypto.randomUUID(), possible_duplicate_of: seq === 2 ? undefined : undefined }).select("id").single()).data!;
      for (const [i, key] of (["j1", "j2"] as const).entries()) await w.db.from("trick_scores").insert({ attempt_id: att.id, judge_seat_id: w.seats[key].id, score: [7.5, 8][i], client_key: crypto.randomUUID(), client_rev: 1 });
    }
    const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    await installSupabaseProxy(context);
    const page = await context.newPage();
    await w.signInAs(page, "head", `/head/${w.eventId}`);
    await expect(page.getByTestId("matrix-row")).toHaveCount(2, { timeout: 40_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: process.env.SHOT ?? "/tmp/shot.png", fullPage: true });
    await context.close();
  } finally {
    await w.cleanup();
  }
});
