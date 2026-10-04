import { expect, test } from "@playwright/test";
import { createPublicWorld, type PublicWorld } from "./public-world";

// Fix 2, item 1(b): the safety valve. Needs a production server started with a tiny limit, e.g.
//   PUBLIC_MAX_IN_FLIGHT=2 npx next start -p 3201      then      E2E_VALVE_URL=http://localhost:3201 npx playwright test e2e/public-valve.spec.ts
// Past the limit a public request gets the calm "Updating…" page (and starts no database work); the Flag view's data, the join page and every officials' and
// organiser path never go through the valve.
const base = process.env.E2E_VALVE_URL;
test.skip(!base, "needs a server started with PUBLIC_MAX_IN_FLIGHT (see the header of this file)");
let w: PublicWorld;
test.beforeAll(async () => {
  test.setTimeout(240_000);
  w = await createPublicWorld();
});
test.afterAll(async () => {
  await w?.cleanup();
});

test("40 spectators at once: some get the calm Updating page, none an error; the Flag view and officials' paths are never refused", async ({ request }) => {
  const url = `${base}/e/${w.slug}/live`;
  const spectators = await Promise.all(Array.from({ length: 40 }, () => request.get(url).then(async (r) => ({ status: r.status(), body: await r.text() }))));
  const updating = spectators.filter((s) => s.body.includes('data-testid="public-updating"'));
  const served = spectators.filter((s) => s.body.includes('data-testid="public-site"'));
  console.log(`VALVE served ${served.length}, updating ${updating.length}`);
  expect(spectators.every((s) => s.status === 200)).toBe(true);
  expect(updating.length).toBeGreaterThan(0);
  expect(served.length).toBeGreaterThan(0);
  expect(updating.length + served.length).toBe(40);
  expect(updating[0].body).toContain("Updating…");

  // while the crowd is on it: the Flag view's data, the judge, spotter and head pages answer as always
  const crowd = Promise.all(Array.from({ length: 40 }, () => request.get(url)));
  const [flag, judge, head] = await Promise.all([request.get(`${base}/e/${w.slug}/flag/data`), request.get(`${base}/judge/${w.eventId}`), request.get(`${base}/head/${w.eventId}`)]);
  await crowd;
  expect(flag.status()).toBe(200);
  expect((await flag.text()).includes('"found":true')).toBe(true);
  for (const r of [judge, head]) expect((await r.text()).includes('data-testid="public-updating"')).toBe(false);
});
