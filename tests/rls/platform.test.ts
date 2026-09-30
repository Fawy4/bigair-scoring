import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, ENV_OK, failed, run, service, signedIn } from "./helpers";

// Phase 4a-1c: the platform-owner layer. Each `it` is one plain sentence about who may (or may not) do what.
// Three kinds of signed-in people: platform admins (owner / staff), organisers of ONE organisation, and officials (PIN, tested elsewhere).
const codeOf = (r: { error: { message: string } | null }): string => r.error?.message ?? "";

interface World {
  s: SupabaseClient;
  owner: SupabaseClient;
  staff: SupabaseClient;
  orgA: SupabaseClient; // organiser of orgA (has published results: cannot be deleted)
  orgB: SupabaseClient; // organiser of orgB (nothing published: can be deleted)
  ids: Record<string, string>;
  userIds: Record<string, string>;
}

describe.skipIf(!ENV_OK)("Platform owner layer (hosted development project)", () => {
  const w = {} as World;
  const users: string[] = [];
  const orgs: string[] = [];
  const password = `Pw-${randomBytes(12).toString("hex")}`;
  const original: Record<string, unknown> = {};

  const ins = async <T>(table: string, row: object): Promise<T & { id: string }> => {
    const { data, error } = await w.s.from(table).insert(row).select().single();
    if (error) throw new Error(`insert ${table}: ${error.message}`);
    return data as T & { id: string };
  };
  const makeUser = async (key: string) => {
    const email = `plat-${run}-${key}@example.com`;
    const { data, error } = await w.s.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser ${key}: ${error.message}`);
    users.push(data.user.id);
    w.userIds[key] = data.user.id;
    return { email, id: data.user.id };
  };

  beforeAll(async () => {
    w.s = service();
    w.ids = {};
    w.userIds = {};
    const owner = await makeUser("owner");
    const staff = await makeUser("staff");
    const oa = await makeUser("orgA");
    const ob = await makeUser("orgB");
    await ins("platform_admins", { user_id: owner.id, role: "owner" });
    await ins("platform_admins", { user_id: staff.id, role: "staff" });

    w.ids.orgA = (await ins("organisations", { name: `Plat A ${run}`, slug: `plat-a-${run}` })).id;
    w.ids.orgB = (await ins("organisations", { name: `Plat B ${run}`, slug: `plat-b-${run}` })).id;
    w.ids.orgC = (await ins("organisations", { name: `Plat C ${run}`, slug: `plat-c-${run}` })).id;
    orgs.push(w.ids.orgA, w.ids.orgB, w.ids.orgC);
    await ins("memberships", { organisation_id: w.ids.orgA, user_id: oa.id, role: "owner" });
    await ins("memberships", { organisation_id: w.ids.orgB, user_id: ob.id, role: "owner" });

    // orgA: a published event with a division, a heat and a PUBLISHED RESULT; a draft event too
    const base = { timezone: "Africa/Cairo", start_date: "2026-10-10", end_date: "2026-10-11" };
    w.ids.evA1 = (await ins("events", { ...base, organisation_id: w.ids.orgA, name: "A1 published", slug: `plat-a1-${run}`, status: "published" })).id;
    w.ids.evA2 = (await ins("events", { ...base, organisation_id: w.ids.orgA, name: "A2 draft", slug: `plat-a2-${run}`, status: "draft" })).id;
    w.ids.divA1 = (await ins("divisions", { event_id: w.ids.evA1, name: "Pro", sort_order: 1 })).id;
    w.ids.riderA = (await ins("riders", { organisation_id: w.ids.orgA, first_name: "Ana", last_name: "Test", email: `ana-${run}@private.example.com` })).id;
    w.ids.entryA = (await ins("entries", { division_id: w.ids.divA1, rider_id: w.ids.riderA, seed: 1, status: "confirmed", source: "manual" })).id;
    w.ids.round = (await ins("rounds", { division_id: w.ids.divA1, sort_order: 1, name: "Round 1", short_name: "R1", spec: {} })).id;
    w.ids.heat = (await ins("heats", { round_id: w.ids.round, division_id: w.ids.divA1, event_id: w.ids.evA1, number: 1, duration_sec: 600, status: "ended" })).id;
    await ins("heat_results", { heat_id: w.ids.heat, entry_id: w.ids.entryA, place: 1, total: 10 });
    // orgB: only a draft event. orgC: one published event (for the archive test)
    w.ids.evB1 = (await ins("events", { ...base, organisation_id: w.ids.orgB, name: "B1 draft", slug: `plat-b1-${run}`, status: "draft" })).id;
    w.ids.evC1 = (await ins("events", { ...base, organisation_id: w.ids.orgC, name: "C1 published", slug: `plat-c1-${run}`, status: "published" })).id;

    w.owner = await signedIn(owner.email, password);
    w.staff = await signedIn(staff.email, password);
    w.orgA = await signedIn(oa.email, password);
    w.orgB = await signedIn(ob.email, password);

    // remember the real settings so the tests can put them back
    const { data } = await w.s.from("platform_settings").select("key, value");
    for (const r of data ?? []) original[r.key] = r.value;
  });

  afterAll(async () => {
    if (!w.s) return;
    for (const [k, v] of Object.entries(original)) await w.s.from("platform_settings").upsert({ key: k, value: v as never });
    await w.s.from("platform_settings").delete().not("key", "in", `(${Object.keys(original).map((k) => `"${k}"`).join(",")})`);
    for (const o of orgs) await w.s.rpc("purge_organisation", { p_org: o }); // first: a division of these organisations points at the test preset
    await w.s.from("scoring_models").delete().eq("key", `plat-${run}`);
    for (const id of users) await w.s.auth.admin.deleteUser(id);
  });

  // ------------------------------------------------------------------ who is a platform admin
  describe("the platform tables", () => {
    it("are private: an organiser and a visitor cannot read the admin list, the settings or the impersonation log", async () => {
      for (const t of ["platform_admins", "platform_settings", "platform_impersonations"]) {
        for (const c of [w.orgA, anonClient()]) {
          const r = await c.from(t).select("*").limit(5);
          expect(r.error ? "denied" : (r.data ?? []).length, t).toSatisfy((v: unknown) => v === "denied" || v === 0);
        }
      }
    });
    it("cannot be written by an organiser: they cannot make themselves an admin or change a setting", async () => {
      const uid = w.userIds.orgA;
      const a = await w.orgA.from("platform_admins").insert({ user_id: uid, role: "owner" });
      expect(a.error).not.toBeNull();
      const b = await w.orgA.from("platform_settings").upsert({ key: "product_name", value: "Hacked" });
      expect(b.error).not.toBeNull();
      const { data } = await w.s.from("platform_admins").select("user_id").eq("user_id", uid);
      expect(data).toEqual([]);
    });
    it("can be read by both admin roles", async () => {
      for (const c of [w.owner, w.staff]) {
        const { data, error } = await c.from("platform_admins").select("user_id, role");
        expect(error).toBeNull();
        expect((data ?? []).map((r) => r.user_id)).toContain(w.userIds.owner);
      }
    });
    it("only an owner can add, remove or change admins", async () => {
      const uid = w.userIds.orgB;
      expect((await w.staff.from("platform_admins").insert({ user_id: uid, role: "staff" })).error).not.toBeNull();
      const added = await w.owner.from("platform_admins").insert({ user_id: uid, role: "staff" });
      expect(added.error).toBeNull();
      expect((await w.staff.from("platform_admins").delete().eq("user_id", uid)).error?.message ?? "").toBe(""); // RLS: matches no row
      expect(((await w.s.from("platform_admins").select("user_id").eq("user_id", uid)).data ?? []).length).toBe(1);
      expect((await w.owner.from("platform_admins").delete().eq("user_id", uid)).error).toBeNull();
      expect(((await w.s.from("platform_admins").select("user_id").eq("user_id", uid)).data ?? []).length).toBe(0);
    });
  });

  // ------------------------------------------------------------------ settings
  describe("platform settings", () => {
    it("start with the default tagline, and a visitor can read the public ones through the public function only", async () => {
      const { data, error } = await anonClient().rpc("public_platform_settings");
      expect(error).toBeNull();
      const s = data as Record<string, unknown>;
      expect(typeof s.tagline).toBe("string");
      expect(Object.keys(s).sort()).toEqual(["default_timezone", "legal_texts", "logo_url", "product_name", "tagline"]);
    });
    it("the owner can change a setting and everybody sees the new value", async () => {
      const tag = `Tagline ${run}`;
      expect((await w.owner.from("platform_settings").upsert({ key: "tagline", value: tag })).error).toBeNull();
      const pub = await anonClient().rpc("public_platform_settings");
      expect((pub.data as { tagline: string }).tagline).toBe(tag);
    });
    it("staff can read the settings but not change them", async () => {
      expect((await w.staff.from("platform_settings").select("key, value")).data?.length).toBeGreaterThan(0);
      const r = await w.staff.from("platform_settings").upsert({ key: "tagline", value: "staff wrote this" });
      expect(r.error).not.toBeNull();
    });
    it("saving through the settings function is owner-only, all-or-nothing and audited", async () => {
      const values = { product_name: `Prod ${run}`, tagline: `Saved ${run}`, logo_url: null, default_timezone: "Europe/Berlin", legal_texts: { terms: "T", privacy: "P" } };
      expect(codeOf(await w.staff.rpc("admin_save_platform_settings", { p_values: values }))).toMatch(/NOT_ALLOWED/);
      expect(codeOf(await w.orgA.rpc("admin_save_platform_settings", { p_values: values }))).toMatch(/NOT_ALLOWED/);
      expect(codeOf(await w.owner.rpc("admin_save_platform_settings", { p_values: { ...values, made_up: "x" } }))).toMatch(/INVALID_KEY/);
      expect((await anonClient().rpc("public_platform_settings")).data).not.toMatchObject({ product_name: `Prod ${run}` }); // the failed call changed nothing
      expect((await w.owner.rpc("admin_save_platform_settings", { p_values: values })).error).toBeNull();
      expect((await anonClient().rpc("public_platform_settings")).data).toMatchObject({ product_name: `Prod ${run}`, tagline: `Saved ${run}`, default_timezone: "Europe/Berlin", legal_texts: { terms: "T", privacy: "P" } });
      const { data } = await w.s.from("audit_log").select("actor_user_id, after").eq("action", "settings_changed").eq("actor_user_id", w.userIds.owner);
      expect(data?.length).toBe(1);
      expect(data![0].after).toMatchObject({ product_name: `Prod ${run}` });
    });
    it("only the five known keys can exist", async () => {
      expect((await w.owner.from("platform_settings").upsert({ key: "made_up", value: "x" })).error).not.toBeNull();
    });
  });

  // ------------------------------------------------------------------ organisations
  describe("organisations", () => {
    it("an organiser sees only their own organisation; an admin sees every one", async () => {
      const ids = [w.ids.orgA, w.ids.orgB, w.ids.orgC];
      expect(((await w.orgA.from("organisations").select("id").in("id", ids)).data ?? []).map((r) => r.id)).toEqual([w.ids.orgA]);
      expect(((await w.orgB.from("organisations").select("id").in("id", ids)).data ?? []).map((r) => r.id)).toEqual([w.ids.orgB]);
      for (const c of [w.owner, w.staff]) expect(((await c.from("organisations").select("id").in("id", ids)).data ?? []).map((r) => r.id).sort()).toEqual([...ids].sort());
    });
    it("an organiser cannot use any admin function", async () => {
      const calls: Array<[string, object]> = [
        ["admin_organisation_overview", {}],
        ["admin_create_organisation", { p_name: "Nope", p_slug: `nope-${run}`, p_timezone: "Africa/Cairo" }],
        ["admin_rename_organisation", { p_org: w.ids.orgB, p_name: "Renamed by organiser" }],
        ["admin_set_organisation_archived", { p_org: w.ids.orgB, p_archived: true }],
        ["admin_delete_organisation", { p_org: w.ids.orgB, p_slug_confirm: `plat-b-${run}` }],
        ["admin_start_impersonation", { p_org: w.ids.orgB }],
        ["admin_health", {}],
        ["admin_audit_log", {}],
        ["admin_organisation_members", { p_org: w.ids.orgA }],
        ["admin_set_organisation_logo", { p_org: w.ids.orgA, p_logo_url: "https://example.com/x.png" }],
        ["admin_create_preset_version", { p_kind: "scoring_model", p_key: `plat-${run}`, p_name: "x", p_json: {}, p_hash: "h" }],
      ];
      for (const [fn, args] of calls) expect(codeOf(await w.orgA.rpc(fn, args)), fn).toMatch(/NOT_ALLOWED/);
      expect(((await w.s.from("organisations").select("name").eq("id", w.ids.orgB).single()).data as { name: string }).name).toBe(`Plat B ${run}`);
    });
    it("a visitor cannot call admin functions either", async () => {
      expect(codeOf(await anonClient().rpc("admin_organisation_overview"))).not.toBe("");
    });
    it("the overview lists every organisation with events count, status, plan and last activity", async () => {
      const { data, error } = await w.staff.rpc("admin_organisation_overview");
      expect(error).toBeNull();
      const rows = data as Array<Record<string, unknown>>;
      const a = rows.find((r) => r.id === w.ids.orgA)!;
      expect(a).toMatchObject({ name: `Plat A ${run}`, slug: `plat-a-${run}`, plan: "free", events_count: 2, published_events_count: 1, published_results_count: 1 });
      expect(a.archived_at).toBeNull();
      expect(a.last_activity).toBeTruthy();
      expect(rows.find((r) => r.id === w.ids.orgB)).toMatchObject({ events_count: 1, published_results_count: 0 });
    });
    it("creating an organisation gives it a name, slug, time zone and a first audit line; bad input is refused", async () => {
      const slug = `plat-new-${run}`;
      const r = await w.owner.rpc("admin_create_organisation", { p_name: `Plat New ${run}`, p_slug: slug, p_timezone: "Europe/Berlin" });
      expect(r.error).toBeNull();
      const id = r.data as string;
      orgs.push(id);
      const { data: o } = await w.s.from("organisations").select("name, slug, settings").eq("id", id).single();
      expect(o).toMatchObject({ name: `Plat New ${run}`, slug, settings: { defaultTimezone: "Europe/Berlin" } });
      const { data: log } = await w.s.from("audit_log").select("action, actor_user_id").eq("organisation_id", id);
      expect(log).toEqual([{ action: "organisation_created", actor_user_id: w.userIds.owner }]);
      expect(codeOf(await w.owner.rpc("admin_create_organisation", { p_name: "Again", p_slug: slug, p_timezone: "Africa/Cairo" }))).toMatch(/SLUG_TAKEN/);
      expect(codeOf(await w.owner.rpc("admin_create_organisation", { p_name: "Bad slug", p_slug: "Not A Slug!", p_timezone: "Africa/Cairo" }))).toMatch(/INVALID_SLUG/);
      expect(codeOf(await w.owner.rpc("admin_create_organisation", { p_name: "Bad tz", p_slug: `plat-tz-${run}`, p_timezone: "Mars/Olympus" }))).toMatch(/INVALID_TIMEZONE/);
      expect(codeOf(await w.owner.rpc("admin_create_organisation", { p_name: "X", p_slug: `plat-nm-${run}`, p_timezone: "Africa/Cairo" }))).toMatch(/INVALID_NAME/);
    });
    it("renaming changes the name and is audited with the old and new name", async () => {
      expect((await w.staff.rpc("admin_rename_organisation", { p_org: w.ids.orgC, p_name: `Plat C renamed ${run}` })).error).toBeNull();
      expect(((await w.s.from("organisations").select("name").eq("id", w.ids.orgC).single()).data as { name: string }).name).toBe(`Plat C renamed ${run}`);
      const { data } = await w.s.from("audit_log").select("before, after").eq("organisation_id", w.ids.orgC).eq("action", "organisation_renamed");
      expect(data).toEqual([{ before: { name: `Plat C ${run}` }, after: { name: `Plat C renamed ${run}` } }]);
    });
    it("archiving hides the organisation and its events from the public, keeps the data, and can be undone", async () => {
      const anon = anonClient();
      const visible = async () => ({
        events: ((await anon.from("events").select("id").eq("id", w.ids.evC1)).data ?? []).length,
        org: (await anon.rpc("get_public_organisation", { p_slug: `plat-c-${run}` })).data ? 1 : 0,
      });
      expect(await visible()).toEqual({ events: 1, org: 1 });
      expect((await w.staff.rpc("admin_set_organisation_archived", { p_org: w.ids.orgC, p_archived: true })).error).toBeNull();
      expect(await visible()).toEqual({ events: 0, org: 0 });
      expect(((await anon.rpc("get_public_events", { p_limit: 100 })).data as Array<{ slug: string }>).some((r) => r.slug === `plat-c1-${run}`)).toBe(false);
      expect(((await w.s.from("events").select("id").eq("id", w.ids.evC1)).data ?? []).length).toBe(1); // data is kept
      expect(((await anon.from("divisions").select("id").eq("event_id", w.ids.evC1)).data ?? []).length).toBe(0);
      expect((await w.staff.rpc("admin_set_organisation_archived", { p_org: w.ids.orgC, p_archived: false })).error).toBeNull();
      expect(await visible()).toEqual({ events: 1, org: 1 });
      const { data } = await w.s.from("audit_log").select("action").eq("organisation_id", w.ids.orgC).in("action", ["organisation_archived", "organisation_unarchived"]).order("at");
      expect((data ?? []).map((r) => r.action)).toEqual(["organisation_archived", "organisation_unarchived"]);
    });
    it("a visitor gets an organisation's public page data only while it is active and has a published event, and never its private columns", async () => {
      const anon = anonClient();
      expect((await anon.rpc("get_public_organisation", { p_slug: `plat-b-${run}` })).data).toBeNull(); // only a draft event
      const a = (await anon.rpc("get_public_organisation", { p_slug: `plat-a-${run}` })).data as { name: string; events: Array<{ slug: string }> };
      expect(a.name).toBe(`Plat A ${run}`);
      expect(a.events.map((e) => e.slug)).toEqual([`plat-a1-${run}`]); // the draft event is not listed
      expect(Object.keys(a).sort()).toEqual(["events", "logo_url", "name", "slug", "timezone"]);
      // the table itself stays closed to visitors, and organisers still see only their own organisation
      expect(failed(await anon.from("organisations").select("id"))).toMatch(/permission denied/i);
    });
    it("the public event list names each event's organisation, lists published events only and skips archived organisations", async () => {
      const { data, error } = await anonClient().rpc("get_public_events", { p_limit: 100 });
      expect(error).toBeNull();
      const rows = data as Array<{ slug: string; organisation_name: string; organisation_slug: string }>;
      const a1 = rows.find((r) => r.slug === `plat-a1-${run}`);
      expect(a1).toMatchObject({ organisation_name: `Plat A ${run}`, organisation_slug: `plat-a-${run}` });
      expect(rows.some((r) => r.slug === `plat-a2-${run}`)).toBe(false); // draft
    });
    it("one event's public page data names its organisation; drafts and archived organisations return nothing", async () => {
      const anon = anonClient();
      const ok = await anon.rpc("get_public_event", { p_slug: `plat-a1-${run}` });
      expect(ok.error).toBeNull();
      expect(ok.data).toEqual([expect.objectContaining({ name: "A1 published", organisation_name: `Plat A ${run}`, organisation_slug: `plat-a-${run}` })]);
      expect((await anon.rpc("get_public_event", { p_slug: `plat-a2-${run}` })).data).toEqual([]);
      expect((await anon.rpc("get_public_event", { p_slug: "no-such-event" })).data).toEqual([]);
    });
    it("deleting is refused when the wrong slug is typed, when results were published, and for staff", async () => {
      expect(codeOf(await w.owner.rpc("admin_delete_organisation", { p_org: w.ids.orgB, p_slug_confirm: "wrong" }))).toMatch(/SLUG_MISMATCH/);
      expect(codeOf(await w.owner.rpc("admin_delete_organisation", { p_org: w.ids.orgA, p_slug_confirm: `plat-a-${run}` }))).toMatch(/PUBLISHED_RESULTS/);
      expect(codeOf(await w.staff.rpc("admin_delete_organisation", { p_org: w.ids.orgB, p_slug_confirm: `plat-b-${run}` }))).toMatch(/NOT_ALLOWED/);
      for (const id of [w.ids.orgA, w.ids.orgB]) expect(((await w.s.from("organisations").select("id").eq("id", id)).data ?? []).length).toBe(1);
      expect(((await w.s.from("heat_results").select("id").eq("heat_id", w.ids.heat)).data ?? []).length).toBe(1);
    });
    it("deleting an organisation without published results removes it with its events and members, and leaves a line in the audit log", async () => {
      const r = await w.owner.rpc("admin_delete_organisation", { p_org: w.ids.orgB, p_slug_confirm: `plat-b-${run}` });
      expect(r.error).toBeNull();
      for (const [t, col, id] of [["organisations", "id", w.ids.orgB], ["events", "organisation_id", w.ids.orgB], ["memberships", "organisation_id", w.ids.orgB]] as const)
        expect(((await w.s.from(t).select("*").eq(col, id)).data ?? []).length, t).toBe(0);
      const { data } = await w.s.from("audit_log").select("action, actor_user_id, before").eq("organisation_id", w.ids.orgB).eq("action", "organisation_deleted");
      expect(data).toHaveLength(1);
      expect(data![0]).toMatchObject({ actor_user_id: w.userIds.owner, before: { slug: `plat-b-${run}`, name: `Plat B ${run}` } });
    });
    it("adding an organiser to an organisation is audited and refused for organisers", async () => {
      const extra = await makeUser("extra");
      expect(codeOf(await w.orgA.rpc("admin_add_organiser", { p_org: w.ids.orgA, p_user: extra.id, p_role: "owner" }))).toMatch(/NOT_ALLOWED/);
      expect((await w.staff.rpc("admin_add_organiser", { p_org: w.ids.orgC, p_user: extra.id, p_role: "owner" })).error).toBeNull();
      expect((await w.s.from("memberships").select("role").eq("organisation_id", w.ids.orgC).eq("user_id", extra.id).single()).data).toEqual({ role: "owner" });
      expect(((await w.s.from("audit_log").select("action").eq("organisation_id", w.ids.orgC).eq("action", "organiser_added")).data ?? []).length).toBe(1);
    });
  });

  // ------------------------------------------------------------------ impersonation
  describe("Open as this organiser (impersonation)", () => {
    const seesDraftEvent = async (c: SupabaseClient) => ((await c.from("events").select("id").eq("id", w.ids.evA2)).data ?? []).length;
    const seesRider = async (c: SupabaseClient) => ((await c.from("riders").select("id").eq("id", w.ids.riderA)).data ?? []).length;

    it("an admin who is not a member of an organisation cannot read its private data", async () => {
      expect(await seesDraftEvent(w.owner)).toBe(0);
      expect(await seesRider(w.owner)).toBe(0);
    });
    it("an organiser cannot start it, and nothing is recorded", async () => {
      expect(codeOf(await w.orgB.rpc("admin_start_impersonation", { p_org: w.ids.orgA }))).toMatch(/NOT_ALLOWED/);
      expect(((await w.s.from("platform_impersonations").select("id").eq("admin_user_id", w.userIds.orgB)).data ?? []).length).toBe(0);
    });
    it("starting it gives that organisation's data, is audited with who and which organisation, and shows as the current session", async () => {
      const r = await w.staff.rpc("admin_start_impersonation", { p_org: w.ids.orgA, p_reason: "support call" });
      expect(r.error).toBeNull();
      expect(await seesDraftEvent(w.staff)).toBe(1);
      expect(await seesRider(w.staff)).toBe(1);
      expect(await seesDraftEvent(w.owner)).toBe(0); // the other admin is not affected
      const { data: log } = await w.s.from("audit_log").select("actor_user_id, reason, after").eq("organisation_id", w.ids.orgA).eq("action", "impersonation_started");
      expect(log).toHaveLength(1);
      expect(log![0]).toMatchObject({ actor_user_id: w.userIds.staff, reason: "support call" });
      const cur = await w.staff.rpc("platform_session");
      expect(cur.error).toBeNull();
      expect(cur.data).toMatchObject({ role: "staff", impersonating: { organisation_id: w.ids.orgA, slug: `plat-a-${run}` } });
      expect(await w.orgA.rpc("platform_session")).toMatchObject({ data: { role: null, impersonating: null } });
    });
    it("while it lasts the admin can change that organisation's data as the organiser would", async () => {
      expect((await w.staff.from("events").update({ location: "Support edit" }).eq("id", w.ids.evA2).select("id")).data).toHaveLength(1);
    });
    it("stopping it closes the door again and is audited", async () => {
      expect((await w.staff.rpc("admin_stop_impersonation")).error).toBeNull();
      expect(await seesDraftEvent(w.staff)).toBe(0);
      expect(await seesRider(w.staff)).toBe(0);
      expect(((await w.s.from("audit_log").select("id").eq("organisation_id", w.ids.orgA).eq("action", "impersonation_ended")).data ?? []).length).toBe(1);
      expect((await w.staff.rpc("platform_session")).data).toMatchObject({ role: "staff", impersonating: null });
    });
    it("it expires by itself", async () => {
      expect((await w.staff.rpc("admin_start_impersonation", { p_org: w.ids.orgA })).error).toBeNull();
      expect(await seesDraftEvent(w.staff)).toBe(1);
      await w.s.from("platform_impersonations").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("admin_user_id", w.userIds.staff).is("ended_at", null);
      expect(await seesDraftEvent(w.staff)).toBe(0);
      await w.s.from("platform_impersonations").update({ ended_at: new Date().toISOString() }).eq("admin_user_id", w.userIds.staff).is("ended_at", null);
    });
    it("starting a second one ends the first, so an admin is only ever inside one organisation", async () => {
      await w.staff.rpc("admin_start_impersonation", { p_org: w.ids.orgA });
      await w.staff.rpc("admin_start_impersonation", { p_org: w.ids.orgC });
      const { data } = await w.s.from("platform_impersonations").select("organisation_id").eq("admin_user_id", w.userIds.staff).is("ended_at", null);
      expect(data).toEqual([{ organisation_id: w.ids.orgC }]);
      expect(await seesDraftEvent(w.staff)).toBe(0);
      await w.staff.rpc("admin_stop_impersonation");
    });
    it("an admin who stops being an admin loses the access at once, even mid-session", async () => {
      await w.staff.rpc("admin_start_impersonation", { p_org: w.ids.orgA });
      await w.s.from("platform_admins").delete().eq("user_id", w.userIds.staff);
      expect(await seesDraftEvent(w.staff)).toBe(0);
      await w.s.from("platform_admins").insert({ user_id: w.userIds.staff, role: "staff" });
      await w.staff.rpc("admin_stop_impersonation");
    });
  });

  // ------------------------------------------------------------------ audit log and health
  describe("platform audit log and health", () => {
    it("an admin sees the audit lines of every organisation with organisation names; an organiser never sees platform lines", async () => {
      const { data, error } = await w.staff.rpc("admin_audit_log", { p_limit: 500 });
      expect(error).toBeNull();
      const rows = data as Array<{ action: string; organisation_name: string | null; organisation_id: string | null }>;
      expect(rows.some((r) => r.action === "impersonation_started" && r.organisation_name === `Plat A ${run}`)).toBe(true);
      expect(rows.some((r) => r.action === "organisation_deleted")).toBe(true);
      const mine = await w.orgA.from("audit_log").select("action").eq("organisation_id", w.ids.orgA);
      expect((mine.data ?? []).length).toBe(0);
    });
    it("the audit log stays append-only, also for admins", async () => {
      const r = await w.owner.from("audit_log").delete().eq("organisation_id", w.ids.orgA);
      expect(r.error === null ? ((r.data as unknown[] | null) ?? []).length : 0).toBe(0);
      expect(((await w.s.from("audit_log").select("id").eq("organisation_id", w.ids.orgA)).data ?? []).length).toBeGreaterThan(0);
    });
    it("the health function reports the database, the last publish and the counts", async () => {
      const { data, error } = await w.staff.rpc("admin_health");
      expect(error).toBeNull();
      const h = data as { database: boolean; last_publish: string | null; organisations: number; events: number; checked_at: string };
      expect(h.database).toBe(true);
      expect(h.last_publish).toBeTruthy(); // orgA has a published result
      expect(h.organisations).toBeGreaterThanOrEqual(2);
      expect(h.checked_at).toBeTruthy();
    });
  });

  // ------------------------------------------------------------------ master presets
  describe("master presets", () => {
    const key = `plat-${run}`;
    const json = (v: number) => ({ id: key, name: `Test model ${v}`, version: v, heat: { duplicateWindowSec: 20 } });
    let v1 = "";
    let v2 = "";
    let divisionId = "";

    it("an admin creates a new version as a draft that customers cannot see", async () => {
      const a = await w.staff.rpc("admin_create_preset_version", { p_kind: "scoring_model", p_key: key, p_name: "Test model", p_json: json(1), p_hash: "h1" });
      expect(a.error).toBeNull();
      v1 = a.data as string;
      const { data } = await w.s.from("scoring_models").select("version, published_at, organisation_id").eq("id", v1).single();
      expect(data).toMatchObject({ version: 1, published_at: null, organisation_id: null });
      expect(((await w.orgA.from("scoring_models").select("id").eq("id", v1)).data ?? []).length).toBe(0);
      expect(((await anonClient().from("scoring_models").select("id").eq("id", v1)).data ?? []).length).toBe(0);
      expect(((await w.staff.from("scoring_models").select("id").eq("id", v1)).data ?? []).length).toBe(1); // admins can preview drafts
    });
    it("publishing is for owners only; then every customer sees it", async () => {
      expect(codeOf(await w.staff.rpc("admin_publish_preset", { p_kind: "scoring_model", p_id: v1 }))).toMatch(/NOT_ALLOWED/);
      expect(codeOf(await w.orgA.rpc("admin_publish_preset", { p_kind: "scoring_model", p_id: v1 }))).toMatch(/NOT_ALLOWED/);
      expect((await w.owner.rpc("admin_publish_preset", { p_kind: "scoring_model", p_id: v1 })).error).toBeNull();
      expect(((await w.orgA.from("scoring_models").select("id").eq("id", v1)).data ?? []).length).toBe(1);
      expect(((await w.s.from("audit_log").select("id").eq("action", "preset_published").eq("row_id", v1)).data ?? []).length).toBe(1);
    });
    it("an existing division keeps its version when a newer one is created and published", async () => {
      divisionId = (await ins("divisions", { event_id: w.ids.evA1, name: "Uses v1", sort_order: 2, scoring_model_id: v1 })).id;
      const b = await w.owner.rpc("admin_create_preset_version", { p_kind: "scoring_model", p_key: key, p_name: "Test model", p_json: json(2), p_hash: "h2" });
      expect(b.error).toBeNull();
      v2 = b.data as string;
      expect(((await w.s.from("scoring_models").select("version").eq("id", v2).single()).data as { version: number }).version).toBe(2);
      expect((await w.owner.rpc("admin_publish_preset", { p_kind: "scoring_model", p_id: v2 })).error).toBeNull();
      const d = await w.s.from("divisions").select("scoring_model_id").eq("id", divisionId).single();
      expect((d.data as { scoring_model_id: string }).scoring_model_id).toBe(v1);
      // both versions stay readable by the organiser whose division uses v1, and the latest published one is what a menu offers
      const seen = await w.orgA.from("scoring_models").select("id, version").eq("key", key).order("version");
      expect((seen.data ?? []).map((r) => r.version)).toEqual([1, 2]);
    });
    it("an older version cannot be published after a newer one is the default", async () => {
      const c = await w.owner.rpc("admin_create_preset_version", { p_kind: "scoring_model", p_key: key, p_name: "Test model", p_json: json(3), p_hash: "h3" });
      const v3 = c.data as string;
      expect(codeOf(await w.owner.rpc("admin_publish_preset", { p_kind: "scoring_model", p_id: v1 }))).toMatch(/NOT_NEWER/);
      expect((await w.owner.rpc("admin_publish_preset", { p_kind: "scoring_model", p_id: v3 })).error).toBeNull();
    });
    it("unknown kinds are refused, and an organiser's own preset cannot be published as a master one", async () => {
      expect(codeOf(await w.owner.rpc("admin_create_preset_version", { p_kind: "nonsense", p_key: key, p_name: "x", p_json: {}, p_hash: "h" }))).toMatch(/INVALID_KIND/);
      const own = await ins<{ id: string }>("scoring_models", { organisation_id: w.ids.orgA, key: `plat-own-${run}`, name: "Own", version: 1, json: {}, content_hash: "z" });
      expect(codeOf(await w.owner.rpc("admin_publish_preset", { p_kind: "scoring_model", p_id: own.id }))).toMatch(/NOT_FOUND/);
    });
    it("all four kinds can get a new version", async () => {
      for (const [kind, k] of [["format_template", `plat-f-${run}`], ["trick_vocabulary", `plat-t-${run}`], ["identification", `plat-i-${run}`]] as const) {
        const r = await w.owner.rpc("admin_create_preset_version", { p_kind: kind, p_key: k, p_name: k, p_json: { id: k }, p_hash: "h" });
        expect(r.error, kind).toBeNull();
        expect((await w.owner.rpc("admin_publish_preset", { p_kind: kind, p_id: r.data as string })).error, kind).toBeNull();
      }
      await w.s.from("format_templates").delete().eq("key", `plat-f-${run}`);
      await w.s.from("trick_vocabularies").delete().eq("key", `plat-t-${run}`);
      await w.s.from("presets").delete().eq("key", `plat-i-${run}`);
    });
    it("the system presets that existed before are all published, so nothing disappears for customers", async () => {
      const { data } = await w.s.from("scoring_models").select("id").is("organisation_id", null).is("published_at", null).neq("key", key);
      expect(data ?? []).toEqual([]);
    });
  });

  // ------------------------------------------------------------------ demo organisation
  describe("Create demo organisation", () => {
    it("is refused for organisers and staff; only an owner may run it", async () => {
      expect(codeOf(await w.orgA.rpc("admin_create_demo_organisation"))).toMatch(/NOT_ALLOWED/);
      expect(codeOf(await w.staff.rpc("admin_create_demo_organisation"))).toMatch(/NOT_ALLOWED/);
      expect(codeOf(await anonClient().rpc("admin_create_demo_organisation"))).not.toBe("");
    });
    it("refuses to run while a demo organisation exists, and otherwise builds the whole demo once (fixed ids, so it never duplicates)", async () => {
      const { data: existing } = await w.s.from("organisations").select("id").in("slug", ["demo", "demo-org"]);
      if ((existing ?? []).length > 0) {
        // the real demo data is present on this project: prove the guard and leave it alone
        expect(codeOf(await w.owner.rpc("admin_create_demo_organisation"))).toMatch(/DEMO_EXISTS/);
        return;
      }
      const r = await w.owner.rpc("admin_create_demo_organisation");
      expect(r.error).toBeNull();
      const id = r.data as string;
      orgs.push(id);
      expect(((await w.s.from("organisations").select("slug").eq("id", id).single()).data as { slug: string }).slug).toBe("demo-org");
      const count = async (t: string, col: string, v: string) => ((await w.s.from(t).select("id").eq(col, v)).data ?? []).length;
      const { data: ev } = await w.s.from("events").select("id").eq("organisation_id", id);
      expect(ev).toHaveLength(1);
      expect(await count("riders", "organisation_id", id)).toBe(20);
      expect(await count("judge_seats", "event_id", ev![0].id)).toBe(5);
      expect(await count("divisions", "event_id", ev![0].id)).toBe(3);
      expect(codeOf(await w.owner.rpc("admin_create_demo_organisation"))).toMatch(/DEMO_EXISTS/);
      expect(((await w.s.from("audit_log").select("action").eq("organisation_id", id).eq("action", "demo_organisation_created")).data ?? []).length).toBe(1);
    });
  });

  // ------------------------------------------------------------------ move an event to another organisation
  describe("Move event to another organisation", () => {
    const mv: Record<string, string> = {};
    let orgCClient: SupabaseClient;
    const emailShared = `shared-${run}@private.example.com`;
    const count = async (t: string, col: string, v: string) => ((await w.s.from(t).select("id").eq(col, v)).data ?? []).length;

    beforeAll(async () => {
      const oc = await makeUser("orgC");
      await ins("memberships", { organisation_id: w.ids.orgC, user_id: oc.id, role: "owner" });
      orgCClient = await signedIn(oc.email, password);
      const base = { timezone: "Africa/Cairo", start_date: "2026-11-01", end_date: "2026-11-02" };
      // an organisation preset of the source organisation, used by the moving event's division
      mv.model = (await ins("scoring_models", { organisation_id: w.ids.orgA, key: `mv-${run}`, name: "Moving model", version: 1, json: { heat: { duplicateWindowSec: 20 } }, content_hash: "mv1" })).id;
      mv.ev = (await ins("events", { ...base, organisation_id: w.ids.orgA, name: "Moving event", slug: `plat-mv-${run}`, status: "published", settings: { publicLiveScores: "live", identification: { scheme: { id: "x" } } } })).id;
      mv.other = (await ins("events", { ...base, organisation_id: w.ids.orgA, name: "Staying event", slug: `plat-stay-${run}`, status: "draft" })).id;
      mv.div = (await ins("divisions", { event_id: mv.ev, name: "Moving division", sort_order: 1, scoring_model_id: mv.model })).id;
      mv.divOther = (await ins("divisions", { event_id: mv.other, name: "Staying division", sort_order: 1 })).id;
      mv.panel = (await ins("panels", { event_id: mv.ev, name: "Moving panel" })).id;
      mv.seat = (await ins("judge_seats", { event_id: mv.ev, name: "Moving judge", role: "judge", status: "active", active: true })).id;
      // riders: one only in the moving event, one also in the staying event, one whose email already exists in the target organisation
      mv.rOnly = (await ins("riders", { organisation_id: w.ids.orgA, first_name: "Only", last_name: "Moving", email: `only-${run}@private.example.com` })).id;
      mv.rBoth = (await ins("riders", { organisation_id: w.ids.orgA, first_name: "Both", last_name: "Events" })).id;
      mv.rShared = (await ins("riders", { organisation_id: w.ids.orgA, first_name: "Shared", last_name: "Person", email: emailShared })).id;
      mv.rTargetShared = (await ins("riders", { organisation_id: w.ids.orgC, first_name: "Shared", last_name: "Person", email: emailShared })).id;
      for (const [i, r] of [mv.rOnly, mv.rBoth, mv.rShared].entries()) await ins("entries", { division_id: mv.div, rider_id: r, seed: i + 1, status: "confirmed", source: "manual", identifiers: { bib: i + 1 } });
      await ins("entries", { division_id: mv.divOther, rider_id: mv.rBoth, seed: 1, status: "confirmed", source: "manual" });
      mv.round = (await ins("rounds", { division_id: mv.div, sort_order: 1, name: "Round 1", short_name: "R1", spec: {} })).id;
      mv.heat = (await ins("heats", { round_id: mv.round, division_id: mv.div, event_id: mv.ev, number: 1, duration_sec: 600, status: "running", started_at: new Date().toISOString() })).id;
    });

    it("is refused for organisers and staff; only an owner may move an event", async () => {
      const args = { p_event: mv.ev, p_target_org: w.ids.orgC };
      expect(codeOf(await w.orgA.rpc("admin_move_event", args))).toMatch(/NOT_ALLOWED/);
      expect(codeOf(await orgCClient.rpc("admin_move_event", args))).toMatch(/NOT_ALLOWED/);
      expect(codeOf(await w.staff.rpc("admin_move_event", args))).toMatch(/NOT_ALLOWED/);
      expect(codeOf(await anonClient().rpc("admin_move_event", args))).not.toBe("");
      expect(((await w.s.from("events").select("organisation_id").eq("id", mv.ev).single()).data as { organisation_id: string }).organisation_id).toBe(w.ids.orgA);
    });
    it("is refused while any heat of the event is running, and then nothing at all has moved", async () => {
      const ridersBefore = await count("riders", "organisation_id", w.ids.orgC);
      expect(codeOf(await w.owner.rpc("admin_move_event", { p_event: mv.ev, p_target_org: w.ids.orgC }))).toMatch(/HEAT_RUNNING/);
      expect(((await w.s.from("events").select("organisation_id").eq("id", mv.ev).single()).data as { organisation_id: string }).organisation_id).toBe(w.ids.orgA);
      expect(await count("riders", "organisation_id", w.ids.orgC)).toBe(ridersBefore); // no rider was copied
      expect(await count("scoring_models", "organisation_id", w.ids.orgC)).toBe(0);
      await w.s.from("heats").update({ status: "paused", paused_at: new Date().toISOString() }).eq("id", mv.heat);
      expect(codeOf(await w.owner.rpc("admin_move_event", { p_event: mv.ev, p_target_org: w.ids.orgC }))).toMatch(/HEAT_RUNNING/); // paused counts too
      await w.s.from("heats").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", mv.heat);
    });
    it("refuses the same organisation, an unknown organisation and an unknown event", async () => {
      expect(codeOf(await w.owner.rpc("admin_move_event", { p_event: mv.ev, p_target_org: w.ids.orgA }))).toMatch(/SAME_ORGANISATION/);
      expect(codeOf(await w.owner.rpc("admin_move_event", { p_event: mv.ev, p_target_org: "00000000-0000-4000-8000-0000000000ff" }))).toMatch(/TARGET_NOT_FOUND/);
      expect(codeOf(await w.owner.rpc("admin_move_event", { p_event: "00000000-0000-4000-8000-0000000000fe", p_target_org: w.ids.orgC }))).toMatch(/NOT_FOUND/);
    });
    it("lists an organisation's events for admins only", async () => {
      const ok = await w.staff.rpc("admin_organisation_events", { p_org: w.ids.orgA });
      expect(ok.error).toBeNull();
      const rows = ok.data as Array<{ id: string; name: string; running_heats: number }>;
      expect(rows.find((r) => r.id === mv.ev)).toMatchObject({ name: "Moving event", running_heats: 0 });
      expect(codeOf(await w.orgA.rpc("admin_organisation_events", { p_org: w.ids.orgA }))).toMatch(/NOT_ALLOWED/);
    });
    it("moves the event with everything that belongs to it, in one step, and leaves nothing of it behind", async () => {
      const seatsBefore = await count("judge_seats", "event_id", mv.ev);
      const r = await w.owner.rpc("admin_move_event", { p_event: mv.ev, p_target_org: w.ids.orgC });
      expect(r.error?.message ?? null).toBeNull();
      expect(r.data).toMatchObject({ riders_copied: 2, riders_reused: 1, riders_removed: 2, presets_copied: 1 });

      // the event, its division, panel, officials, heat and settings are the same rows, now in the new organisation
      const { data: ev } = await w.s.from("events").select("organisation_id, settings, name").eq("id", mv.ev).single();
      expect(ev).toMatchObject({ organisation_id: w.ids.orgC, name: "Moving event", settings: { publicLiveScores: "live" } });
      expect(await count("divisions", "event_id", mv.ev)).toBe(1);
      expect(await count("panels", "event_id", mv.ev)).toBe(1);
      expect(await count("judge_seats", "event_id", mv.ev)).toBe(seatsBefore);
      expect(await count("heats", "event_id", mv.ev)).toBe(1);

      // every entry now points at a rider of the NEW organisation (same people, same identifiers)
      const { data: entries } = await w.s.from("entries").select("identifiers, riders(organisation_id, first_name)").eq("division_id", mv.div).order("seed");
      expect((entries ?? []).map((e) => (e.riders as unknown as { organisation_id: string }).organisation_id)).toEqual([w.ids.orgC, w.ids.orgC, w.ids.orgC]);
      expect((entries ?? []).map((e) => (e.riders as unknown as { first_name: string }).first_name)).toEqual(["Only", "Both", "Shared"]);
      expect((entries ?? []).map((e) => (e.identifiers as { bib: number }).bib)).toEqual([1, 2, 3]);
      // the person who already existed in the new organisation (same email) was reused, not duplicated
      expect(await count("riders", "organisation_id", w.ids.orgC)).toBe(3); // Shared (reused), Only and Both (copied)
      expect((entries ?? [])[2] && ((await w.s.from("entries").select("rider_id").eq("division_id", mv.div).eq("seed", 3).single()).data as { rider_id: string }).rider_id).toBe(mv.rTargetShared);

      // the organisation preset the division used was copied, and the division points at the copy
      const { data: div } = await w.s.from("divisions").select("scoring_model_id").eq("id", mv.div).single();
      const { data: model } = await w.s.from("scoring_models").select("organisation_id, key, version, content_hash").eq("id", (div as { scoring_model_id: string }).scoring_model_id).single();
      expect(model).toMatchObject({ organisation_id: w.ids.orgC, key: `mv-${run}`, version: 1, content_hash: "mv1" });

      // nothing of the event is left in the old organisation: no event, no rider only this event used; the rider shared with the staying event stays
      expect(await count("events", "organisation_id", w.ids.orgA)).toBeGreaterThan(0); // its other events are untouched
      expect(((await w.s.from("events").select("id").eq("organisation_id", w.ids.orgA).eq("id", mv.ev)).data ?? []).length).toBe(0);
      expect(((await w.s.from("riders").select("id").eq("id", mv.rOnly)).data ?? []).length).toBe(0);
      expect(((await w.s.from("riders").select("id").eq("id", mv.rBoth)).data ?? []).length).toBe(1);
      expect(((await w.s.from("riders").select("id").eq("id", mv.rShared)).data ?? []).length).toBe(0);
      expect(((await w.s.from("entries").select("id").eq("division_id", mv.divOther)).data ?? []).length).toBe(1);
      const { data: oldRiders } = await w.s.from("entries").select("id, riders!inner(organisation_id)").eq("event_id", mv.ev).eq("riders.organisation_id", w.ids.orgA);
      expect(oldRiders ?? []).toEqual([]);
    });
    it("the old organisation's organiser loses sight of the event and the new organisation's organiser gains it; the move is audited", async () => {
      expect(((await w.orgA.from("events").select("id").eq("id", mv.ev)).data ?? []).length).toBe(1); // published: still public, but not theirs
      expect(((await w.orgA.from("divisions").select("id").eq("id", mv.div)).data ?? []).length).toBe(1); // public read of a published event
      expect((await w.orgA.from("events").update({ name: "Hijack" }).eq("id", mv.ev).select("id")).data ?? []).toEqual([]);
      expect((await orgCClient.from("events").update({ location: "New home" }).eq("id", mv.ev).select("id")).data).toHaveLength(1);
      const { data } = await w.s.from("audit_log").select("actor_user_id, before, after, row_id, organisation_id").eq("action", "event_moved").eq("row_id", mv.ev);
      expect(data).toHaveLength(1);
      expect(data![0]).toMatchObject({ actor_user_id: w.userIds.owner, organisation_id: w.ids.orgC, before: { organisation_slug: `plat-a-${run}` }, after: { organisation_slug: `plat-c-${run}`, event: "Moving event" } });
    });
  });

  // ------------------------------------------------------------------ coverage
  describe("coverage", () => {
    it("the three new tables have RLS on and policies, and no visitor can read or write them", async () => {
      const { data, error } = await w.s.rpc("rls_coverage");
      expect(error).toBeNull();
      const rows = data as Array<{ table_name: string; rls_enabled: boolean; policy_count: number; anon_can_select: boolean; anon_can_write: boolean }>;
      for (const t of ["platform_admins", "platform_settings", "platform_impersonations"]) {
        expect(rows.find((r) => r.table_name === t), t).toMatchObject({ rls_enabled: true, anon_can_select: false, anon_can_write: false });
        expect(rows.find((r) => r.table_name === t)!.policy_count, t).toBeGreaterThan(0);
      }
    });
  });
});
