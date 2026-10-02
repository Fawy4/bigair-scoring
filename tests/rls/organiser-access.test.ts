import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, ENV_OK, run, service, signedIn } from "./helpers";

// Polish 1, item 2: organiser access. Who sees which organisation, who may add or remove an organiser, and what removal does (access ends at once, sessions are
// signed out, the login stays so the person can be invited again).
describe.skipIf(!ENV_OK)("Organiser access (hosted development project)", () => {
  const s = service();
  const password = `Pw-${randomBytes(12).toString("hex")}`;
  const users: string[] = [];
  const orgs: string[] = [];
  const id: Record<string, string> = {};
  const email: Record<string, string> = {};
  let owner: SupabaseClient;
  let staff: SupabaseClient;
  let orgA: SupabaseClient;
  let orgB: SupabaseClient;
  let invitee: SupabaseClient;

  const makeUser = async (key: string) => {
    email[key] = `acc-${run}-${key}@example.com`;
    const { data, error } = await s.auth.admin.createUser({ email: email[key], password, email_confirm: true });
    if (error) throw new Error(`createUser ${key}: ${error.message}`);
    users.push(data.user.id);
    id[key] = data.user.id;
  };
  const ins = async (table: string, row: object) => {
    const { data, error } = await s.from(table).insert(row).select("id").single();
    if (error) throw new Error(`insert ${table}: ${error.message}`);
    return (data as { id: string }).id;
  };
  const isMember = async (org: string, user: string) => ((await s.from("memberships").select("id").eq("organisation_id", org).eq("user_id", user)).data ?? []).length === 1;

  beforeAll(async () => {
    for (const k of ["owner", "staff", "orgA", "orgB", "invitee"]) await makeUser(k);
    await s.from("platform_admins").insert([{ user_id: id.owner, role: "owner" }, { user_id: id.staff, role: "staff" }]);
    id.A = await ins("organisations", { name: `Acc A ${run}`, slug: `plat-acc-a-${run}` });
    id.B = await ins("organisations", { name: `Acc B ${run}`, slug: `plat-acc-b-${run}` });
    orgs.push(id.A, id.B);
    await s.from("memberships").insert([
      { organisation_id: id.A, user_id: id.orgA, role: "owner" },
      { organisation_id: id.B, user_id: id.orgB, role: "owner" },
      { organisation_id: id.A, user_id: id.invitee, role: "owner" },
    ]);
    const base = { timezone: "Africa/Cairo", start_date: "2026-10-10", end_date: "2026-10-11", status: "draft" };
    id.evA = await ins("events", { ...base, organisation_id: id.A, name: "A draft", slug: `plat-acc-ea-${run}` });
    id.evB = await ins("events", { ...base, organisation_id: id.B, name: "B draft", slug: `plat-acc-eb-${run}` });
    owner = await signedIn(email.owner, password);
    staff = await signedIn(email.staff, password);
    orgA = await signedIn(email.orgA, password);
    orgB = await signedIn(email.orgB, password);
    invitee = await signedIn(email.invitee, password);
  });

  afterAll(async () => {
    for (const o of orgs) await s.rpc("purge_organisation", { p_org: o });
    for (const u of users) await s.auth.admin.deleteUser(u);
  });

  describe("an organiser sees only their own organisation", () => {
    it("the organisation, its events and its members: never another organisation's", async () => {
      const mine = await orgA.from("organisations").select("id");
      expect((mine.data ?? []).map((o) => o.id)).toEqual([id.A]);
      expect(((await orgA.from("events").select("id").in("id", [id.evA, id.evB])).data ?? []).map((e) => e.id)).toEqual([id.evA]);
      const members = (await orgA.from("memberships").select("organisation_id")).data ?? [];
      expect(members.length).toBeGreaterThan(0);
      expect(members.every((m) => m.organisation_id === id.A)).toBe(true);
      expect(((await orgB.from("events").select("id").in("id", [id.evA, id.evB])).data ?? []).map((e) => e.id)).toEqual([id.evB]);
    });
    it("cannot add or remove a member by writing to the table, nor through the owner's functions", async () => {
      const add = await orgA.from("memberships").insert({ organisation_id: id.A, user_id: id.orgB, role: "owner" });
      expect(add.error).not.toBeNull();
      await orgA.from("memberships").delete().eq("organisation_id", id.A).eq("user_id", id.invitee);
      expect(await isMember(id.A, id.invitee)).toBe(true);
      expect((await orgA.rpc("admin_remove_organiser", { p_org: id.A, p_user: id.invitee })).error).not.toBeNull();
      expect((await orgA.rpc("admin_add_organiser", { p_org: id.A, p_user: id.orgB })).error).not.toBeNull();
      expect((await anonClient().rpc("admin_remove_organiser", { p_org: id.A, p_user: id.invitee })).error).not.toBeNull();
      expect(await isMember(id.A, id.invitee)).toBe(true);
    });
  });

  describe("removing an organiser", () => {
    it("is for the platform owner only: staff are refused", async () => {
      const r = await staff.rpc("admin_remove_organiser", { p_org: id.A, p_user: id.invitee });
      expect(r.error?.message).toContain("NOT_ALLOWED");
      expect(await isMember(id.A, id.invitee)).toBe(true);
    });
    it("refuses your own login and a person who is not a member", async () => {
      expect((await owner.rpc("admin_remove_organiser", { p_org: id.A, p_user: id.owner })).error?.message).toContain("CANNOT_REMOVE_SELF");
      expect((await owner.rpc("admin_remove_organiser", { p_org: id.A, p_user: id.orgB })).error?.message).toContain("NOT_A_MEMBER");
    });
    it("ends access at once, signs the person out everywhere, keeps the login, and is audited", async () => {
      // the invitee can read the organisation, and is also an organiser of B: only A is taken away
      await s.from("memberships").insert({ organisation_id: id.B, user_id: id.invitee, role: "owner" });
      expect(((await invitee.from("events").select("id").eq("id", id.evA)).data ?? []).length).toBe(1);
      expect((await invitee.auth.getUser()).error).toBeNull();

      const removed = await owner.rpc("admin_remove_organiser", { p_org: id.A, p_user: id.invitee });
      expect(removed.error).toBeNull();

      expect(await isMember(id.A, id.invitee)).toBe(false);
      expect(await isMember(id.B, id.invitee)).toBe(true);
      // the old token is still a valid signature for a while, but it opens nothing of A's any more
      expect(((await invitee.from("events").select("id").eq("id", id.evA)).data ?? []).length).toBe(0);
      expect(((await invitee.from("organisations").select("id").eq("id", id.A)).data ?? []).length).toBe(0);
      // and the auth service no longer knows the session: signed out
      expect((await invitee.auth.getUser()).error).not.toBeNull();
      expect((await invitee.auth.refreshSession()).error).not.toBeNull();
      // the login itself stays
      expect((await s.auth.admin.getUserById(id.invitee)).data.user?.email).toBe(email.invitee);
      const audit = await s.from("audit_log").select("action, organisation_id, before").eq("action", "organiser_removed").eq("organisation_id", id.A);
      expect(audit.data?.length).toBe(1);
      expect(audit.data?.[0].before).toMatchObject({ user_id: id.invitee });
    });
    it("can be undone by inviting the same login again: it signs in and sees the organisation", async () => {
      expect((await owner.rpc("admin_add_organiser", { p_org: id.A, p_user: id.invitee, p_role: "owner" })).error).toBeNull();
      const again = await signedIn(email.invitee, password);
      expect(((await again.from("events").select("id").eq("id", id.evA)).data ?? []).length).toBe(1);
    });
  });
});
