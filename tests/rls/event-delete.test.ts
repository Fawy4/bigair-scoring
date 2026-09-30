import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, ENV_OK, run, service, signedIn } from "./helpers";

// Deleting and archiving an event. Organisers of the event's organisation and platform owners may; nobody else.
// Deleting is refused once any result is published (then only Archive is offered).
const codeOf = (r: { error: { message: string } | null }): string => r.error?.message ?? "";

describe.skipIf(!ENV_OK)("Delete and archive an event (hosted development project)", () => {
  const s = service();
  const password = `Pw-${randomBytes(12).toString("hex")}`;
  const users: string[] = [];
  const orgs: string[] = [];
  const ids: Record<string, string> = {};
  let x: SupabaseClient; // organiser of orgX
  let y: SupabaseClient; // organiser of orgY
  let owner: SupabaseClient; // platform owner
  let staff: SupabaseClient; // platform staff

  const ins = async <T>(table: string, row: object): Promise<T & { id: string }> => {
    const { data, error } = await s.from(table).insert(row).select().single();
    if (error) throw new Error(`insert ${table}: ${error.message}`);
    return data as T & { id: string };
  };
  const user = async (key: string) => {
    const email = `evdel-${run}-${key}@example.com`;
    const { data, error } = await s.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    ids["u_" + key] = data.user.id;
    return { email, id: data.user.id };
  };
  const count = async (table: string, col: string, v: string) => ((await s.from(table).select("id").eq(col, v)).data ?? []).length;
  const world = async (key: string, org: string, status: string, settings: object = {}) => {
    const ev = await ins<{ id: string }>("events", { organisation_id: org, name: `Event ${key}`, slug: `evdel-${key}-${run}`, status, timezone: "Africa/Cairo", start_date: "2026-11-01", end_date: "2026-11-02", settings });
    ids[key] = ev.id;
    const div = await ins<{ id: string }>("divisions", { event_id: ev.id, name: `Div ${key}`, sort_order: 1 });
    ids["div_" + key] = div.id;
    const rider = await ins<{ id: string }>("riders", { organisation_id: org, first_name: `Rider${key}`, last_name: "Test" });
    ids["rider_" + key] = rider.id;
    ids["entry_" + key] = (await ins("entries", { division_id: div.id, rider_id: rider.id, seed: 1, status: "confirmed", source: "manual" })).id;
    await ins("judge_seats", { event_id: ev.id, name: `Judge ${key}`, role: "judge", status: "active", active: true });
    await ins("panels", { event_id: ev.id, name: `Panel ${key}` });
    ids["round_" + key] = (await ins("rounds", { division_id: div.id, sort_order: 1, name: "Round 1", short_name: "R1", spec: {} })).id;
    ids["heat_" + key] = (await ins("heats", { round_id: ids["round_" + key], division_id: div.id, event_id: ev.id, number: 1, duration_sec: 600, status: "scheduled" })).id;
    await ins("schedule_plans", { event_id: ev.id, day: "2026-11-01", name: "Plan A", items: [], anchors: {}, actual_starts: {}, hold: null, defaults: {}, active: true });
    return ev.id;
  };

  beforeAll(async () => {
    ids.orgX = (await ins("organisations", { name: `EvDel X ${run}`, slug: `evdel-x-${run}` })).id;
    ids.orgY = (await ins("organisations", { name: `EvDel Y ${run}`, slug: `evdel-y-${run}` })).id;
    orgs.push(ids.orgX, ids.orgY);
    const ux = await user("x");
    const uy = await user("y");
    const uo = await user("owner");
    const us = await user("staff");
    await ins("memberships", { organisation_id: ids.orgX, user_id: ux.id, role: "owner" });
    await ins("memberships", { organisation_id: ids.orgY, user_id: uy.id, role: "owner" });
    await ins("platform_admins", { user_id: uo.id, role: "owner" });
    await ins("platform_admins", { user_id: us.id, role: "staff" });
    await world("del", ids.orgX, "draft");
    await world("pub", ids.orgX, "published", { publicLiveScores: "live" });
    await world("keep", ids.orgX, "draft");
    await world("owned", ids.orgY, "draft");
    // a published result makes "pub" permanent
    await s.from("heats").update({ status: "ended", ended_at: new Date().toISOString(), started_at: new Date(Date.now() - 3600_000).toISOString() }).eq("id", ids.heat_pub);
    await ins("heat_results", { heat_id: ids.heat_pub, entry_id: ids.entry_pub, place: 1, total: 9 });
    x = await signedIn(ux.email, password);
    y = await signedIn(uy.email, password);
    owner = await signedIn(uo.email, password);
    staff = await signedIn(us.email, password);
  });
  afterAll(async () => {
    for (const o of orgs) await s.rpc("purge_organisation", { p_org: o });
    for (const id of users) await s.auth.admin.deleteUser(id);
  });

  it("is refused for an organiser of another organisation, for platform staff who are not inside the organisation, and for visitors", async () => {
    for (const c of [y, staff]) {
      expect(codeOf(await c.rpc("delete_event", { p_event: ids.del, p_slug_confirm: `evdel-del-${run}` }))).toMatch(/NOT_ALLOWED/);
      expect(codeOf(await c.rpc("set_event_archived", { p_event: ids.del, p_archived: true }))).toMatch(/NOT_ALLOWED/);
    }
    expect(codeOf(await anonClient().rpc("delete_event", { p_event: ids.del, p_slug_confirm: `evdel-del-${run}` }))).not.toBe("");
    expect(codeOf(await y.rpc("delete_event", { p_event: "00000000-0000-4000-8000-0000000000aa", p_slug_confirm: "x" }))).toMatch(/NOT_ALLOWED/); // an unknown event looks the same
    expect(await count("events", "id", ids.del)).toBe(1);
    expect(await count("divisions", "event_id", ids.del)).toBe(1);
  });

  it("needs the exact web address typed", async () => {
    for (const typed of ["", "wrong", `evdel-keep-${run}`]) expect(codeOf(await x.rpc("delete_event", { p_event: ids.del, p_slug_confirm: typed }))).toMatch(/SLUG_MISMATCH/);
    expect(await count("events", "id", ids.del)).toBe(1);
  });

  it("is refused once any result is published, and nothing is touched", async () => {
    expect(codeOf(await x.rpc("delete_event", { p_event: ids.pub, p_slug_confirm: `evdel-pub-${run}` }))).toMatch(/PUBLISHED_RESULTS/);
    expect(codeOf(await owner.rpc("delete_event", { p_event: ids.pub, p_slug_confirm: `evdel-pub-${run}` }))).toMatch(/PUBLISHED_RESULTS/); // owners too
    expect(await count("events", "id", ids.pub)).toBe(1);
    expect(await count("heat_results", "heat_id", ids.heat_pub)).toBe(1);
  });

  it("archiving hides the event everywhere the public looks, keeps every row, and can be undone; other organisations cannot do it", async () => {
    const anon = anonClient();
    const visible = async () => ({
      table: ((await anon.from("events").select("id").eq("id", ids.pub)).data ?? []).length,
      list: ((await anon.rpc("get_public_events", { p_limit: 100 })).data as Array<{ slug: string }>).some((e) => e.slug === `evdel-pub-${run}`),
      page: ((await anon.rpc("get_public_event", { p_slug: `evdel-pub-${run}` })).data as unknown[]).length,
      orgPage: ((await anon.rpc("get_public_organisation", { p_slug: `evdel-x-${run}` })).data as { events: Array<{ slug: string }> } | null)?.events.some((e) => e.slug === `evdel-pub-${run}`) ?? false,
      live: ((await anon.rpc("get_public_live_heat", { p_heat: ids.heat_pub })).data as { allowed: boolean }).allowed,
      divisions: ((await anon.from("divisions").select("id").eq("event_id", ids.pub)).data ?? []).length,
    });
    expect(await visible()).toEqual({ table: 1, list: true, page: 1, orgPage: true, live: true, divisions: 1 });
    expect((await x.rpc("set_event_archived", { p_event: ids.pub, p_archived: true })).error).toBeNull();
    expect(await visible()).toEqual({ table: 0, list: false, page: 0, orgPage: false, live: false, divisions: 0 });
    expect(await count("heat_results", "heat_id", ids.heat_pub)).toBe(1); // data kept
    expect(((await x.from("events").select("id, archived_at").eq("id", ids.pub).single()).data as { archived_at: string | null }).archived_at).toBeTruthy(); // its organiser still sees it
    expect((await x.rpc("set_event_archived", { p_event: ids.pub, p_archived: false })).error).toBeNull();
    expect(await visible()).toEqual({ table: 1, list: true, page: 1, orgPage: true, live: true, divisions: 1 });
    const { data } = await s.from("audit_log").select("action").eq("row_id", ids.pub).in("action", ["event_archived", "event_unarchived"]).order("at");
    expect((data ?? []).map((r) => r.action)).toEqual(["event_archived", "event_unarchived"]);
  });

  it("deleting an event with no published results removes its divisions, entries, officials, panels, heats and schedule plans in one step, keeps the riders, and is audited", async () => {
    const before = { divisions: await count("divisions", "event_id", ids.del), entries: await count("entries", "event_id", ids.del), seats: await count("judge_seats", "event_id", ids.del), heats: await count("heats", "event_id", ids.del), plans: await count("schedule_plans", "event_id", ids.del) };
    expect(before).toEqual({ divisions: 1, entries: 1, seats: 1, heats: 1, plans: 1 });
    const r = await x.rpc("delete_event", { p_event: ids.del, p_slug_confirm: ` EVDEL-DEL-${run} ` }); // capitals and spaces do not matter
    expect(r.error?.message ?? null).toBeNull();
    expect(r.data).toMatchObject({ divisions: 1, entries: 1, seats: 1, heats: 1, plans: 1 });
    for (const [t, col] of [["events", "id"], ["divisions", "event_id"], ["entries", "event_id"], ["judge_seats", "event_id"], ["panels", "event_id"], ["rounds", "division_id"], ["heats", "event_id"], ["schedule_plans", "event_id"]] as const)
      expect(await count(t, col, col === "division_id" ? ids.div_del : ids.del), t).toBe(0);
    expect(await count("riders", "id", ids.rider_del)).toBe(1); // riders belong to the organisation, not the event
    expect(await count("events", "id", ids.keep)).toBe(1); // the organisation's other events are untouched
    expect(await count("divisions", "event_id", ids.keep)).toBe(1);
    const { data } = await s.from("audit_log").select("actor_user_id, organisation_id, before").eq("action", "event_deleted").eq("row_id", ids.del);
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ actor_user_id: ids.u_x, organisation_id: ids.orgX, before: { name: "Event del", slug: `evdel-del-${run}`, divisions: 1, entries: 1, seats: 1, heats: 1, plans: 1 } });
  });

  it("a platform owner may delete any event without published results; platform staff may not", async () => {
    expect(codeOf(await staff.rpc("delete_event", { p_event: ids.owned, p_slug_confirm: `evdel-owned-${run}` }))).toMatch(/NOT_ALLOWED/);
    expect((await owner.rpc("delete_event", { p_event: ids.owned, p_slug_confirm: `evdel-owned-${run}` })).error).toBeNull();
    expect(await count("events", "id", ids.owned)).toBe(0);
    expect(await count("divisions", "event_id", ids.owned)).toBe(0);
  });

  it("the admin events list shows published results and the archive state", async () => {
    await x.rpc("set_event_archived", { p_event: ids.pub, p_archived: true });
    const { data, error } = await staff.rpc("admin_organisation_events", { p_org: ids.orgX });
    expect(error).toBeNull();
    const rows = data as Array<{ id: string; published_results: number; archived_at: string | null }>;
    expect(rows.find((r) => r.id === ids.pub)).toMatchObject({ published_results: 1 });
    expect(rows.find((r) => r.id === ids.pub)!.archived_at).toBeTruthy();
    expect(rows.find((r) => r.id === ids.keep)).toMatchObject({ published_results: 0, archived_at: null });
  });
});
