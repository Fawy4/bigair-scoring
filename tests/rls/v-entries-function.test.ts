import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, buildFixture, ENV_OK, failed, type Fixture } from "./helpers";
import { mkLadder } from "./public-helpers";

// The rider list is the function public.visible_entries (it replaced the security-definer view v_entries). Same columns, same rows, same caller filter as the view:
// organisers and seats of the event see its riders; everybody else sees only the confirmed / withdrawn / no-show riders of a public event; anon sees nothing.
// Personal data (e-mail, phone, date of birth) never leaves the function, and nothing here prints a rider's contact details.
const COLUMNS = ["division_id", "event_id", "first_name", "id", "identifiers", "last_name", "nationality", "photo_url", "seed", "sponsor", "status"];

describe.skipIf(!ENV_OK)("Rider list function visible_entries (hosted development project)", () => {
  let f: Fixture;
  let stranger: SupabaseClient;
  let strangerId: string;
  let hidden: string; // a registered (not yet confirmed) rider of the public event A1
  let draftEntry: string; // a confirmed rider of the draft event A2
  const ids = async (c: SupabaseClient, p: { p_event?: string; p_entry?: string } = {}) => {
    const r = await c.rpc("visible_entries", p);
    if (r.error) throw new Error(r.error.message);
    return ((r.data ?? []) as Array<{ id: string }>).map((x) => x.id).sort();
  };
  const viewGone = async () => failed(await f.s.from("v_entries").select("id").limit(1)) !== "";

  beforeAll(async () => {
    f = await buildFixture();
    stranger = anonClient();
    const { data, error } = await stranger.auth.signInAnonymously();
    if (error || !data.user) throw new Error(`Anonymous sign-ins must be switched on: ${error?.message}`);
    strangerId = data.user.id;
    const mk = async (division: string, first: string, status: string) => {
      const r = await f.s.from("riders").insert({ organisation_id: f.ids.orgA, first_name: first, last_name: "Listed", email: `${first.toLowerCase()}-list@private.example.com`, phone: "+201000000001" }).select("id").single();
      if (r.error) throw new Error(r.error.message);
      const e = await f.s.from("entries").insert({ division_id: division, rider_id: r.data.id, status, source: "manual", seed: 9 }).select("id").single();
      if (e.error) throw new Error(e.error.message);
      return e.data.id as string;
    };
    hidden = await mk(f.ids.divA1, "Hidden", "registered");
    draftEntry = await mk(f.ids.divA2, "Draftee", "confirmed");
  }, 120_000);
  afterAll(async () => {
    if (strangerId) await f.s.auth.admin.deleteUser(strangerId);
    await f.cleanup();
  }, 120_000);

  it("returns exactly the columns the view had, and no contact details", async () => {
    const r = await f.clients.orgA.rpc("visible_entries", { p_event: f.ids.evA1 });
    expect(r.error).toBeNull();
    const rows = r.data as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThan(0);
    expect(Object.keys(rows[0]).sort()).toEqual(COLUMNS);
    const asked = await f.clients.orgA.rpc("visible_entries").select("email");
    expect(asked.error).not.toBeNull();
  });

  it("anon (no sign-in) reads no rider, through the function or the view", async () => {
    expect(failed(await f.clients.anon.rpc("visible_entries", { p_event: f.ids.evA1 }))).not.toBe("");
    expect(failed(await f.clients.anon.rpc("visible_entries"))).not.toBe("");
    expect(failed(await f.clients.anon.from("v_entries").select("id").eq("event_id", f.ids.evA1))).not.toBe("");
  });

  it("a stranger signed in anonymously sees only the riders of public events", async () => {
    const seen = await ids(stranger);
    expect(seen).toContain(f.ids.e1);
    expect(seen).toContain(f.ids.eB); // B1 is a public event too
    expect(seen).not.toContain(hidden); // registered: not public yet
    expect(seen).not.toContain(draftEntry); // draft event: not public
    expect(await ids(stranger, { p_event: f.ids.evA2 })).toEqual([]);
    expect(await ids(stranger, { p_entry: draftEntry })).toEqual([]);
    expect(await ids(stranger, { p_event: f.ids.evA1 })).toEqual([f.ids.e1, f.ids.e2, f.ids.e3, f.ids.e4].sort());
  });

  it("an organiser of another organisation sees nothing of this one's non-public events", async () => {
    expect(await ids(f.clients.orgB, { p_event: f.ids.evA2 })).toEqual([]);
    expect(await ids(f.clients.orgB, { p_entry: draftEntry })).toEqual([]);
    expect(await ids(f.clients.orgB, { p_entry: hidden })).toEqual([]);
    expect(await ids(f.clients.orgB, { p_event: f.ids.evA1 })).toEqual([f.ids.e1, f.ids.e2, f.ids.e3, f.ids.e4].sort()); // the public riders only
  });

  it("an organiser sees every rider of their own events; a seat sees its event's riders, not another event's", async () => {
    const own = await ids(f.clients.orgA);
    for (const e of [f.ids.e1, hidden, draftEntry]) expect(own).toContain(e);
    for (const seat of ["j1", "spotter", "head"] as const) {
      const seen = await ids(f.clients[seat], { p_event: f.ids.evA1 });
      expect(seen, seat).toContain(hidden); // a seat sees riders who are not public yet
      expect(seen, seat).toContain(f.ids.e1);
      expect(await ids(f.clients[seat], { p_event: f.ids.evA2 }), seat).toEqual([]);
    }
    expect(await ids(f.clients.bJudge, { p_event: f.ids.evA2 })).toEqual([]);
    expect(await ids(f.clients.bJudge, { p_entry: hidden })).toEqual([]);
  });

  it("gives every caller the same rows the old view gave (while the view still exists)", async () => {
    if (await viewGone()) return; // dropped by the second migration: the behaviour is pinned by the tests above
    const viewIds = async (c: SupabaseClient) => ((await c.from("v_entries").select("id")).data ?? []).map((x) => (x as { id: string }).id).sort();
    for (const [who, c] of Object.entries({ orgA: f.clients.orgA, orgB: f.clients.orgB, j1: f.clients.j1, spotter: f.clients.spotter, head: f.clients.head, bJudge: f.clients.bJudge, stranger })) {
      expect(await ids(c), who).toEqual(await viewIds(c));
    }
    const a = (await f.clients.orgA.from("v_entries").select("*").eq("id", f.ids.e1).single()).data;
    const b = (await f.clients.orgA.rpc("visible_entries", { p_entry: f.ids.e1 })).data?.[0];
    expect(b).toEqual(a);
  });

  it("get_public_results names the same riders as the rider list shows a visitor", async () => {
    const lad = await mkLadder(f, { name: "ListLadder" });
    const res = (await f.clients.anon.rpc("get_public_results", { p_event: f.ids.evA1 })).data as { allowed: boolean; entries: Array<{ id: string; first_name: string; last_name: string; identifiers: unknown; withdrawn: boolean }> };
    expect(res.allowed).toBe(true);
    const got = res.entries.map((e) => e.id).sort();
    for (const e of lad.entries) expect(got).toContain(e);
    expect(got).not.toContain(hidden);
    const listed = (await stranger.rpc("visible_entries", { p_event: f.ids.evA1 })).data as Array<{ id: string; first_name: string; last_name: string }>;
    const byId = new Map(listed.map((r) => [r.id, r]));
    for (const e of res.entries) {
      expect(Object.keys(e).sort()).toEqual(["division_id", "first_name", "id", "identifiers", "last_name", "nationality", "withdrawn"]); // no contact details
      expect(byId.get(e.id), "every rider of the public results is on the visitor's list").toMatchObject({ first_name: e.first_name, last_name: e.last_name });
    }
  });
});
