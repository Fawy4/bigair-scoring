import { beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, run, serverAsVisitorClient, service, visitorClient, type Fixture } from "./helpers";

// CL1: a test organisation and everything in it is never shown on the public pages, even though its events are published. The visitor connections below send no header, exactly
// like the live site; the normal test connections send the "show test organisations" header and see the fixture as before. Nothing here deletes anything.
describe.skipIf(!ENV_OK)("Test organisations are hidden from visitors (hosted development project)", () => {
  let f: Fixture;
  const visitor = visitorClient();
  const server = serverAsVisitorClient();
  beforeAll(async () => {
    f = await buildFixture();
  }, 120_000);

  const slugA1 = () => `rls-a1-${run}`;

  it("the fixture's organisations are marked as test, and its published event is really published", async () => {
    const orgs = (await f.s.from("organisations").select("slug, is_test").in("id", [f.ids.orgA, f.ids.orgB])).data ?? [];
    expect(orgs).toHaveLength(2);
    expect(orgs.every((o) => o.is_test)).toBe(true);
    expect((await f.s.from("events").select("status").eq("id", f.ids.evA1).single()).data!.status).toBe("published");
  });

  it("the home page list leaves a published test event out, and lists no event of any test organisation", async () => {
    const hidden = (await visitor.rpc("get_public_events", { p_limit: 100 })).data as Array<{ slug: string; organisation_slug: string }>;
    expect(hidden.some((e) => e.slug === slugA1())).toBe(false);
    const testSlugs = new Set(((await f.s.from("organisations").select("slug").eq("is_test", true)).data ?? []).map((o) => o.slug));
    expect(hidden.filter((e) => testSlugs.has(e.organisation_slug))).toEqual([]);
    const shown = (await f.clients.anon.rpc("get_public_events", { p_limit: 100 })).data as Array<{ slug: string }>;
    expect(shown.some((e) => e.slug === slugA1())).toBe(true); // the test connection (with the header) still sees it
  });

  it("the event page, its event code, results and join page start from functions that answer 'not found' for a test event", async () => {
    expect(((await visitor.rpc("get_public_event", { p_slug: slugA1() })).data as unknown[]).length).toBe(0);
    expect(((await visitor.rpc("get_public_site", { p_slug: slugA1() })).data as { found: boolean }).found).toBe(false);
    expect(((await server.rpc("get_public_site", { p_slug: slugA1() })).data as { found: boolean }).found).toBe(false);
    expect(((await f.clients.anon.rpc("get_public_site", { p_slug: slugA1() })).data as { found: boolean }).found).toBe(true);
    expect(((await f.clients.anon.rpc("get_public_event", { p_slug: slugA1() })).data as unknown[]).length).toBe(1);
  });

  it("the organisation page and the registration page answer 'not found' too", async () => {
    expect((await visitor.rpc("get_public_organisation", { p_slug: `rls-a-${run}` })).data).toBeNull();
    expect((await f.clients.anon.rpc("get_public_organisation", { p_slug: `rls-a-${run}` })).data).not.toBeNull();
    expect(((await server.rpc("public_registration_info", { p_slug: slugA1() })).data as { found: boolean }).found).toBe(false);
    expect(((await f.s.rpc("public_registration_info", { p_slug: slugA1() })).data as { found: boolean }).found).toBe(true);
  });

  it("an organiser cannot change the label of their own organisation", async () => {
    const r = await f.clients.orgA.from("organisations").update({ is_test: false }).eq("id", f.ids.orgA).select("id");
    expect((r.data ?? []).length).toBe(0);
    expect((await f.s.from("organisations").select("is_test").eq("id", f.ids.orgA).single()).data!.is_test).toBe(true);
  });

  it("an organisation made with a test web address is marked as test by the database even if the test forgot to say so", async () => {
    const slug = `rls-label-${run}`;
    const made = await f.s.from("organisations").insert({ name: `RLS label ${run}`, slug }).select("is_test").single(); // label-left-out: this proves the database trigger
    expect(made.error).toBeNull();
    expect(made.data!.is_test).toBe(true);
  });

  it("purge_organisation refuses Arrow, Redbull and EKL (and any organisation not marked as test) and nothing is removed", async () => {
    const db = service();
    const real = ((await db.from("organisations").select("id, slug, is_test").in("slug", ["arrow", "redbull", "ekl", "demo-org"])).data ?? []).filter((o) => !o.is_test);
    for (const o of real) {
      const before = (await db.from("events").select("id", { count: "exact", head: true }).eq("organisation_id", o.id)).count;
      const answer = await db.rpc("purge_refusal_probe", { p_org: o.id });
      expect(answer.data, o.slug).toMatch(/NOT_A_TEST_ORGANISATION/);
      expect((await db.from("organisations").select("id").eq("id", o.id)).data).toHaveLength(1);
      expect((await db.from("events").select("id", { count: "exact", head: true }).eq("organisation_id", o.id)).count).toBe(before);
    }
    // the probe itself is closed to visitors and organisers
    expect((await visitor.rpc("purge_refusal_probe", { p_org: f.ids.orgA })).error).not.toBeNull();
    expect((await f.clients.orgA.rpc("purge_refusal_probe", { p_org: f.ids.orgA })).error).not.toBeNull();
    expect((await f.clients.orgA.rpc("purge_organisation", { p_org: f.ids.orgA })).error).not.toBeNull(); // organisers have no right to call it at all
  });
});
