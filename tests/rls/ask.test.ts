import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authorizeAsk } from "@/lib/ask/access";
import { anonClient, ENV_OK, failed, run, service, signedIn } from "./helpers";

// Ask Sendbook: the log is the platform owner's alone; the budget is the owner's to set and the organisation's to see; the route answers signed-in
// organisers, owners and bound PIN seats of the event in question, and nobody else.
describe.skipIf(!ENV_OK)("Ask Sendbook (hosted development project)", () => {
  const s = service();
  const password = `Pw-${randomBytes(12).toString("hex")}`;
  const users: string[] = [];
  const orgs: string[] = [];
  const id: Record<string, string> = {};
  const c: Record<string, SupabaseClient> = {};
  let seatUser: { id: string; is_anonymous: boolean };
  let strangerUser: { id: string; is_anonymous: boolean };

  const ins = async (table: string, row: object) => {
    const { data, error } = await s.from(table).insert(row).select("id").single();
    if (error) throw new Error(`insert ${table}: ${error.message}`);
    return (data as { id: string }).id;
  };

  beforeAll(async () => {
    for (const k of ["owner", "staff", "orgA", "orgB"]) {
      const email = `ask-${run}-${k}@example.com`;
      const { data, error } = await s.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw new Error(error.message);
      users.push(data.user.id);
      id[k] = data.user.id;
      c[k] = await signedIn(email, password);
    }
    await s.from("platform_admins").insert([{ user_id: id.owner, role: "owner" }, { user_id: id.staff, role: "staff" }]);
    id.A = await ins("organisations", { name: `Ask A ${run}`, slug: `ask-a-${run}` });
    id.B = await ins("organisations", { name: `Ask B ${run}`, slug: `ask-b-${run}` });
    orgs.push(id.A, id.B);
    await s.from("memberships").insert([
      { organisation_id: id.A, user_id: id.orgA, role: "owner" },
      { organisation_id: id.B, user_id: id.orgB, role: "owner" },
    ]);
    const base = { timezone: "Africa/Cairo", start_date: "2026-10-10", end_date: "2026-10-11", status: "draft" };
    id.evA = await ins("events", { ...base, organisation_id: id.A, name: "Ask A event", slug: `ask-ea-${run}` });
    id.evA2 = await ins("events", { ...base, organisation_id: id.A, name: "Ask A other event", slug: `ask-ea2-${run}` });
    id.evB = await ins("events", { ...base, organisation_id: id.B, name: "Ask B event", slug: `ask-eb-${run}` });

    // a PIN seat: an anonymous session bound to a judge seat of event A
    c.seat = anonClient();
    const { data: anon, error } = await c.seat.auth.signInAnonymously();
    if (error || !anon.user) throw new Error(`anonymous sign-in: ${error?.message}`);
    seatUser = { id: anon.user.id, is_anonymous: true };
    users.push(anon.user.id);
    id.seat = await ins("judge_seats", { event_id: id.evA, name: "Judge 1", role: "judge", auth_user_id: anon.user.id, bound_at: new Date().toISOString(), status: "active", active: true });
    // an anonymous session that is bound to nothing
    c.stranger = anonClient();
    const { data: st } = await c.stranger.auth.signInAnonymously();
    strangerUser = { id: st.user!.id, is_anonymous: true };
    users.push(st.user!.id);

    const logged = await s.from("ask_log").insert([
      { organisation_id: id.A, event_id: id.evA, user_id: id.orgA, role: "organiser", route: "/head/x", question: `why is Hold grey ${run}`, answer: "Because…", budget_tokens: 1000, cost_usd: 0.01 },
      { organisation_id: id.A, event_id: id.evA, user_id: seatUser.id, seat_id: id.seat, role: "judge", route: "/judge/x", question: `seat question ${run}`, answer: "…", budget_tokens: 500 },
    ], { defaultToNull: false });
    if (logged.error) throw new Error(`insert ask_log: ${logged.error.message}`);
  });

  afterAll(async () => {
    for (const o of orgs) await s.rpc("purge_organisation", { p_org: o });
    for (const u of users) await s.auth.admin.deleteUser(u);
  });

  describe("the log", () => {
    const mine = (cl: SupabaseClient) => cl.from("ask_log").select("id, question").like("question", `%${run}`);

    it("the platform owner reads every exchange", async () => {
      const { data, error } = await mine(c.owner);
      expect(error).toBeNull();
      expect(data).toHaveLength(2);
    });

    it("staff, organisers, seats and visitors read nothing — not even their own questions", async () => {
      for (const who of ["staff", "orgA", "orgB", "seat", "stranger"]) {
        const { data } = await mine(c[who]);
        expect(data ?? [], who).toHaveLength(0);
      }
      expect((await mine(anonClient())).data ?? []).toHaveLength(0);
    });

    it("nobody but the server writes, changes or removes a row", async () => {
      for (const who of ["owner", "orgA", "seat"]) {
        expect(failed(await c[who].from("ask_log").insert({ role: "owner", route: "/", question: "forged" })), who).toMatch(/permission denied|row-level security/i);
        const upd = await c[who].from("ask_log").update({ answer: "changed" }).like("question", `%${run}`).select("id");
        expect(upd.data ?? [], who).toHaveLength(0);
        const del = await c[who].from("ask_log").delete().like("question", `%${run}`).select("id");
        expect(del.data ?? [], who).toHaveLength(0);
      }
      expect((await s.from("ask_log").select("id").like("question", `%${run}`)).data).toHaveLength(2);
    });
  });

  describe("the budget", () => {
    it("an organisation starts with 2 million and sees this month's use; another organisation's is refused", async () => {
      const { data, error } = await c.orgA.rpc("ask_usage", { p_org: id.A });
      expect(error).toBeNull();
      expect(data).toEqual({ used: 1500, limit: 2_000_000, questions: 2 });
      expect(failed(await c.orgB.rpc("ask_usage", { p_org: id.A }))).toMatch(/NOT_ALLOWED/);
      expect(failed(await c.seat.rpc("ask_usage", { p_org: id.A }))).toMatch(/NOT_ALLOWED/);
    });

    it("only the platform owner changes it, and the change is audited", async () => {
      expect(failed(await c.orgA.rpc("admin_set_ask_budget", { p_org: id.A, p_tokens: 9 }))).toMatch(/NOT_ALLOWED/);
      expect(failed(await c.staff.rpc("admin_set_ask_budget", { p_org: id.A, p_tokens: 9 }))).toMatch(/NOT_ALLOWED/);
      expect(failed(await c.owner.rpc("admin_set_ask_budget", { p_org: id.A, p_tokens: -1 }))).toMatch(/BUDGET_INVALID/);
      expect((await c.owner.rpc("admin_set_ask_budget", { p_org: id.A, p_tokens: 500_000 })).error).toBeNull();
      expect((await c.owner.rpc("ask_usage", { p_org: id.A })).data).toMatchObject({ limit: 500_000 });
      const { data: audit } = await s.from("audit_log").select("action").eq("row_id", id.A).eq("action", "ask_budget_changed");
      expect(audit?.length).toBe(1);
      // organisers cannot write the column directly either
      await c.orgA.from("organisations").update({ ask_monthly_budget: 99_000_000 }).eq("id", id.A);
      expect((await s.from("organisations").select("ask_monthly_budget").eq("id", id.A).single()).data?.ask_monthly_budget).toBe(500_000);
    });
  });

  describe("the thumbs", () => {
    it("an organiser's note can be tagged 'ask'", async () => {
      const r = await c.orgA.from("feedback_notes").insert({ organisation_id: id.A, author_user_id: id.orgA, author_role: "organiser", page: "/head/x", page_label: "Head console", body: `Ask: why is Hold grey ${run}`, tag: "ask" });
      expect(r.error).toBeNull();
    });
    it("nobody but the server writes a note as an official", async () => {
      expect(failed(await c.orgA.from("feedback_notes").insert({ organisation_id: id.A, author_user_id: id.orgA, author_role: "official", page: "/judge/x", page_label: "Judge", body: "x", tag: "ask" }))).toMatch(/row-level security|violates/i);
      expect((await s.from("feedback_notes").insert({ organisation_id: id.A, author_user_id: seatUser.id, author_role: "official", page: "/judge/x", page_label: "Judge", body: `seat ${run}`, tag: "ask" })).error).toBeNull();
    });
  });

  describe("who the route answers (authorizeAsk)", () => {
    const user = (k: string) => ({ id: id[k], is_anonymous: false });

    it("refuses a visitor with no session", async () => {
      expect(await authorizeAsk(s, null, { eventId: id.evA })).toMatchObject({ ok: false, reason: "signed_out" });
      expect(await authorizeAsk(s, null, { eventId: null })).toMatchObject({ ok: false, reason: "signed_out" });
    });

    it("lets a visitor in only when the public flag is on, and only on a public page", async () => {
      expect(await authorizeAsk(s, null, { eventId: null, publicAllowed: true })).toMatchObject({ ok: true, requester: { kind: "visitor" } });
    });

    it("refuses an anonymous session bound to no seat", async () => {
      expect(await authorizeAsk(s, strangerUser, { eventId: id.evA })).toMatchObject({ ok: false, reason: "no_seat" });
    });

    it("answers a bound seat on its own event", async () => {
      expect(await authorizeAsk(s, seatUser, { eventId: id.evA })).toMatchObject({ ok: true, requester: { kind: "seat", role: "judge", seatId: id.seat, organisationId: id.A, eventId: id.evA } });
    });

    it("refuses a seat asking about another event, of its own organisation or another", async () => {
      expect(await authorizeAsk(s, seatUser, { eventId: id.evA2 })).toMatchObject({ ok: false, reason: "no_seat" });
      expect(await authorizeAsk(s, seatUser, { eventId: id.evB })).toMatchObject({ ok: false, reason: "no_seat" });
      expect(await authorizeAsk(s, seatUser, { eventId: null })).toMatchObject({ ok: false, reason: "no_seat" });
    });

    it("refuses a seat that was switched off", async () => {
      await s.from("judge_seats").update({ active: false }).eq("id", id.seat);
      expect(await authorizeAsk(s, seatUser, { eventId: id.evA })).toMatchObject({ ok: false, reason: "no_seat" });
      await s.from("judge_seats").update({ active: true }).eq("id", id.seat);
    });

    it("answers an organiser on their own events and refuses them on another organisation's", async () => {
      expect(await authorizeAsk(s, user("orgA"), { eventId: id.evA })).toMatchObject({ ok: true, requester: { kind: "organiser", organisationId: id.A } });
      expect(await authorizeAsk(s, user("orgA"), { eventId: null, organisationId: id.A })).toMatchObject({ ok: true, requester: { kind: "organiser", organisationId: id.A } });
      expect(await authorizeAsk(s, user("orgA"), { eventId: id.evB })).toMatchObject({ ok: false, reason: "not_allowed" });
      // a cookie naming another organisation does not lend its budget
      expect(await authorizeAsk(s, user("orgA"), { eventId: null, organisationId: id.B })).toMatchObject({ ok: true, requester: { organisationId: id.A } });
    });

    it("answers a login that holds a seat of the event as that seat (officials may join with a login), and nowhere else", async () => {
      await s.from("judge_seats").insert({ event_id: id.evB, name: "Head", role: "head", auth_user_id: id.orgA, status: "active", active: true });
      expect(await authorizeAsk(s, user("orgA"), { eventId: id.evB })).toMatchObject({ ok: true, requester: { kind: "seat", role: "head", organisationId: id.B } });
      expect(await authorizeAsk(s, user("orgB"), { eventId: id.evA })).toMatchObject({ ok: false, reason: "not_allowed" });
      await s.from("judge_seats").delete().eq("event_id", id.evB).eq("auth_user_id", id.orgA);
    });

    it("answers the platform owner and staff anywhere", async () => {
      expect(await authorizeAsk(s, user("owner"), { eventId: id.evB })).toMatchObject({ ok: true, requester: { kind: "admin", role: "owner", organisationId: id.B } });
      expect(await authorizeAsk(s, user("staff"), { eventId: null })).toMatchObject({ ok: true, requester: { kind: "admin", role: "staff", organisationId: null } });
    });

    it("refuses an unknown event id", async () => {
      expect(await authorizeAsk(s, user("orgA"), { eventId: "00000000-0000-4000-8000-000000000000" })).toMatchObject({ ok: false, reason: "not_allowed" });
    });
  });
});
