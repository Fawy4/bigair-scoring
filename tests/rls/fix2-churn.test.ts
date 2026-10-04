import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, type Fixture } from "./helpers";

// Fix 2, item 1(d): nothing writes on every poll. "Last seen" is written at most once a minute; the public functions are read-only (STABLE).
describe.skipIf(!ENV_OK)("Fix 2 — less churn on the database", () => {
  let f: Fixture;
  beforeAll(async () => {
    f = await buildFixture();
  }, 300_000);
  afterAll(async () => {
    await f?.cleanup();
  });
  const seen = async () => (await f.s.from("judge_seats").select("last_seen_at").eq("id", f.ids.seat_j1).single()).data!.last_seen_at as string | null;

  it("touch_seat called ten times in a row writes once; a stored time older than a minute is refreshed", async () => {
    await f.s.from("judge_seats").update({ last_seen_at: null }).eq("id", f.ids.seat_j1);
    expect((await f.clients.j1.rpc("touch_seat")).error).toBeNull();
    const first = await seen();
    expect(first).not.toBeNull();
    for (let i = 0; i < 10; i++) expect((await f.clients.j1.rpc("touch_seat")).error).toBeNull();
    expect(await seen()).toBe(first);
    const old = new Date(Date.now() - 61_000).toISOString();
    await f.s.from("judge_seats").update({ last_seen_at: old }).eq("id", f.ids.seat_j1);
    await f.clients.j1.rpc("touch_seat");
    expect(Date.parse((await seen())!)).toBeGreaterThan(Date.parse(old) + 30_000);
    // and 40 seconds old is left alone
    const recent = new Date(Date.now() - 40_000).toISOString();
    await f.s.from("judge_seats").update({ last_seen_at: recent }).eq("id", f.ids.seat_j1);
    await f.clients.j1.rpc("touch_seat");
    expect(Date.parse((await seen())!)).toBe(Date.parse(recent));
  });

  it("every public read function, the server clock and the server-only live view are STABLE: a refresh writes nothing", async () => {
    const ref = process.env.SUPABASE_PROJECT_REF;
    const token = process.env.SUPABASE_ACCESS_TOKEN;
    if (!ref || !token) return; // no management access here: the catalogue cannot be read
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "select p.proname, p.provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.proname like 'get\\_public\\_%' or p.proname in ('server_now', 'get_live_heat_for_server', 'public_platform_settings'))" }),
    });
    const rows = (await res.json()) as Array<{ proname: string; provolatile: string }>;
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(rows.filter((r) => r.provolatile !== "s").map((r) => r.proname)).toEqual([]);
  });
});
