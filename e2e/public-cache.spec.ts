import { expect, test } from "@playwright/test";
import { publishLadderHeat } from "../tests/rls/public-helpers";
import { createPublicWorld, type PublicWorld } from "./public-world";

// Fix 2, item 1(a): the public pages answer from a shared cache of about 3 seconds. What a visitor may see must show within that time of Publish, and what is
// held must never show, however many times the page is fetched. Works against the running server (production build in CI: `next start`; dev has no cache headers).
let w: PublicWorld;
test.beforeAll(async () => {
  test.setTimeout(240_000);
  w = await createPublicWorld();
});
test.afterAll(async () => {
  await w?.cleanup();
});

const ctx = () => ({ s: w.db, ids: { orgA: w.orgId, evA1: w.eventId, modelA1: w.modelId } });
const text = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
/** The live page of one heat: published totals read "20.00 = tricks …"; before publish "Not started"; held "Result to be announced". */
const heatPage = async (request: import("@playwright/test").APIRequestContext, heat: string) => text(await (await request.get(`/e/${w.slug}/live?heat=${heat}`)).text());

test("Publish shows on the public page within 3 seconds (plus one fetch); the cache header is there", async ({ request }) => {
  const heat = w.ladder.heats["R1-H2"];
  const res = await request.get(`/e/${w.slug}/live?heat=${heat}`);
  expect(res.headers()["cache-control"] ?? "").toContain("s-maxage=3");
  expect(text(await res.text())).not.toContain("= tricks");
  const t0 = Date.now();
  await publishLadderHeat(ctx(), w.ladder, "R1-H2");
  let seen = 0;
  while (Date.now() - t0 < 9000) {
    if ((await heatPage(request, heat)).includes("= tricks")) {
      seen = Date.now() - t0;
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`PUBLISH visible after ${seen} ms`);
  expect(seen, "the published result never showed").toBeGreaterThan(0);
  expect(seen).toBeLessThanOrEqual(4500); // 3 s cache + the next fetch (+ the database's own time)
});

test("a held heat never shows its result, however often the page is fetched, until it is released", async ({ request }) => {
  const heat = w.reseedLadder.heats["R1-H2"];
  await publishLadderHeat(ctx(), w.reseedLadder, "R1-H2", { hold: true });
  const t0 = Date.now();
  let fetches = 0;
  while (Date.now() - t0 < 9000) {
    const t = await heatPage(request, heat);
    fetches++;
    expect(t).not.toContain("= tricks");
    // the answer may be up to one cache period old, so the wording is only required after that; the result itself is never allowed
    if (Date.now() - t0 > 3600) expect(t).toContain("Result to be announced");
    await new Promise((r) => setTimeout(r, 300));
  }
  expect(fetches).toBeGreaterThan(10);
  await w.db.from("heats").update({ publish_hold: false }).eq("id", heat);
  const t1 = Date.now();
  let seen = 0;
  while (Date.now() - t1 < 9000) {
    if ((await heatPage(request, heat)).includes("= tricks")) {
      seen = Date.now() - t1;
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  expect(seen, "the released result never showed").toBeGreaterThan(0);
  expect(seen).toBeLessThanOrEqual(4500);
});
