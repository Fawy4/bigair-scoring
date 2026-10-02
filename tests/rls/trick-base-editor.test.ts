import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, failed, run, signedIn, type Fixture } from "./helpers";

// Master trick base editor: owner only for every write; organisers read the published version; an event keeps its version until "Update to latest";
// proposals are written by their organiser and answered by the owner. Every master version this file makes is removed afterwards.
const KEY = "big-air-vocabulary";

describe.skipIf(!ENV_OK)("Master trick base editor (hosted development project)", () => {
  let f: Fixture;
  const password = `Pw-${randomBytes(12).toString("hex")}`;
  const extraUsers: string[] = [];
  const madeVersions: string[] = [];
  let owner: SupabaseClient;
  let staff: SupabaseClient;
  let latest = 0;

  const newest = async () => (await f.s.from("trick_vocabularies").select("id, version, json, published_at").is("organisation_id", null).is("event_id", null).eq("key", KEY).order("version", { ascending: false }).limit(1).single()).data!;
  const user = async (k: string) => {
    const email = `rls-${run}-tb-${k}@example.com`;
    const { data, error } = await f.s.auth.admin.createUser({ email, email_confirm: true, password });
    if (error) throw new Error(error.message);
    extraUsers.push(data.user.id);
    return { email, id: data.user.id };
  };

  beforeAll(async () => {
    f = await buildFixture();
    const o = await user("owner");
    const s = await user("staff");
    await f.s.from("platform_admins").insert([{ user_id: o.id, role: "owner" }, { user_id: s.id, role: "staff" }]);
    owner = await signedIn(o.email, password);
    staff = await signedIn(s.email, password);
    latest = (await f.s.from("trick_vocabularies").select("version").is("organisation_id", null).is("event_id", null).eq("key", KEY).not("published_at", "is", null).order("version", { ascending: false }).limit(1).single()).data!.version;
  });
  afterAll(async () => {
    await f?.cleanup(); // the throwaway events first: none may point at a version removed below
    if (madeVersions.length) await f?.s.from("trick_vocabularies").delete().in("id", madeVersions);
    await f?.s.from("platform_admins").delete().in("user_id", extraUsers);
    for (const id of extraUsers) await f?.s.auth.admin.deleteUser(id);
  });

  it("a new event starts on the newest published version; organisers and visitors read that version", async () => {
    const { data } = await f.s.from("events").select("trick_vocabulary_version").eq("id", f.ids.evA2).single();
    expect(data!.trick_vocabulary_version).toBe(latest);
    const read = await f.clients.orgA.from("trick_vocabularies").select("version").is("organisation_id", null).is("event_id", null).eq("key", KEY).eq("version", latest);
    expect(read.data).toHaveLength(1);
    expect((await f.clients.anon.from("trick_vocabularies").select("version").is("organisation_id", null).eq("key", KEY).eq("version", latest)).data).toHaveLength(1);
  });

  it("organisers cannot write the master base, nor change their event's version by hand", async () => {
    const top = await newest();
    expect(failed(await f.clients.orgA.rpc("admin_trick_base_save", { p_json: top.json, p_hash: "x", p_base_version: top.version }))).toContain("NOT_ALLOWED");
    expect(failed(await f.clients.orgA.from("trick_vocabularies").insert({ organisation_id: null, event_id: null, key: KEY, version: 999, json: {}, content_hash: "x" }))).not.toBe("");
    expect(failed(await f.clients.orgA.from("events").update({ trick_vocabulary_version: 1 } as never).eq("id", f.ids.evA2))).not.toBe("");
    expect(failed(await f.clients.anon.rpc("admin_trick_base_history"))).not.toBe("");
  });

  it("staff read the history but cannot save or publish; only the owner saves a draft", async () => {
    const top = await newest();
    expect((await staff.rpc("admin_trick_base_history")).error).toBeNull();
    const json = { ...(top.json as object), _rls: run };
    expect(failed(await staff.rpc("admin_trick_base_save", { p_json: json, p_hash: `rls-${run}`, p_base_version: top.version }))).toContain("NOT_ALLOWED");
    expect(failed(await staff.rpc("admin_create_preset_version", { p_kind: "trick_vocabulary", p_key: KEY, p_name: "x", p_json: json, p_hash: `rls-${run}` }))).toContain("NOT_ALLOWED");

    // someone saved in between: refused rather than overwritten
    expect(failed(await owner.rpc("admin_trick_base_save", { p_json: json, p_hash: `rls-${run}`, p_base_version: top.version - 1 }))).toContain("TRICK_BASE_STALE");
    const saved = await owner.rpc("admin_trick_base_save", { p_json: json, p_hash: `rls-${run}`, p_base_version: top.version });
    expect(saved.error).toBeNull();
    const made = saved.data as { id: string; version: number; created: boolean };
    madeVersions.push(made.id);
    expect(made).toMatchObject({ version: top.version + 1, created: true });
    // saving the same content again makes nothing
    expect((await owner.rpc("admin_trick_base_save", { p_json: json, p_hash: `rls-${run}`, p_base_version: made.version })).data).toMatchObject({ id: made.id, created: false });
    // a draft is not readable by organisers
    expect((await f.clients.orgA.from("trick_vocabularies").select("id").eq("id", made.id)).data).toEqual([]);
    expect(failed(await staff.rpc("admin_trick_base_publish", { p_id: made.id, p_summary: "x" }))).toContain("NOT_ALLOWED");
  });

  it("the owner publishes with the diff in words; history says who; existing events keep their version until Update to latest", async () => {
    const draft = await newest();
    expect(draft.published_at).toBeNull();
    const pub = await owner.rpc("admin_trick_base_publish", { p_id: draft.id, p_summary: "1 renamed" });
    expect(pub.error).toBeNull();
    expect(failed(await owner.rpc("admin_trick_base_publish", { p_id: draft.id, p_summary: "again" }))).toContain("ALREADY_DEFAULT");
    const history = (await owner.rpc("admin_trick_base_history")).data as Array<{ version: number; published_by_email: string; created_by_email: string; change_summary: string }>;
    expect(history[0]).toMatchObject({ version: draft.version, change_summary: "1 renamed", published_by_email: `rls-${run}-tb-owner@example.com`, created_by_email: `rls-${run}-tb-owner@example.com` });

    expect((await f.s.from("events").select("trick_vocabulary_version").eq("id", f.ids.evA2).single()).data!.trick_vocabulary_version).toBe(latest);
    // another organisation cannot update this event; a running heat blocks the update
    expect(failed(await f.clients.orgB.rpc("update_event_trick_base", { p_event: f.ids.evA2 }))).toContain("NOT_ALLOWED");
    expect(failed(await f.clients.orgA.rpc("update_event_trick_base", { p_event: f.ids.evA1 }))).toContain("HEAT_RUNNING");
    const up = await f.clients.orgA.rpc("update_event_trick_base", { p_event: f.ids.evA2 });
    expect(up.error).toBeNull();
    expect(up.data).toEqual({ from: latest, to: draft.version });
    expect((await f.s.from("events").select("trick_vocabulary_version").eq("id", f.ids.evA2).single()).data!.trick_vocabulary_version).toBe(draft.version);
  });

  it("proposals: written by their organiser, read and answered by the owner; dismissing needs a reason the organiser then reads", async () => {
    const block = { family: "base", key: `local_rls_${run}`, label: `RLS roll ${run}`, category: "rotation", status: "proposed" };
    const ins = await f.clients.orgA.from("trick_vocabularies").insert({ organisation_id: f.ids.orgA, event_id: f.ids.evA2, key: "event-additions", json: { blocks: [block] }, content_hash: "x" }).select("id").single();
    expect(ins.error).toBeNull();
    expect(failed(await f.clients.orgB.from("trick_vocabularies").insert({ organisation_id: f.ids.orgA, event_id: f.ids.evA2, key: "event-additions-2", json: { blocks: [] }, content_hash: "x" }))).not.toBe("");
    expect(JSON.stringify((await owner.rpc("admin_trick_proposals")).data)).toContain(block.key);
    const answer = { p_event: f.ids.evA2, p_family: "base", p_key: block.key, p_status: "declined" };
    expect(failed(await staff.rpc("admin_set_proposal_status", { ...answer, p_reason: "no" }))).toContain("NOT_ALLOWED");
    expect(failed(await f.clients.orgA.rpc("admin_set_proposal_status", { ...answer, p_reason: "no" }))).toContain("NOT_ALLOWED");
    expect(failed(await owner.rpc("admin_set_proposal_status", { ...answer, p_reason: "  " }))).toContain("REASON_REQUIRED");
    expect((await owner.rpc("admin_set_proposal_status", { ...answer, p_reason: "Same as Sloth roll" })).error).toBeNull();
    const seen = (await f.clients.orgA.from("trick_vocabularies").select("json").eq("id", ins.data!.id).single()).data!.json as { blocks: Array<{ status: string; reason?: string }> };
    expect(seen.blocks[0]).toMatchObject({ status: "declined", reason: "Same as Sloth roll" });
    expect(failed(await owner.rpc("admin_set_proposal_status", { ...answer, p_key: "local_missing", p_reason: "x" }))).toContain("NOT_FOUND");
  });

  it("a division's ticked default-off blocks may only grow after a heat has started", async () => {
    await f.s.from("divisions").update({ trick_base: { disabled: [], enabled: ["addon:tic_tac"] } }).eq("id", f.ids.divA1);
    expect(failed(await f.clients.orgA.from("divisions").update({ trick_base: { disabled: [], enabled: ["addon:tic_tac", "addon:late"] } }).eq("id", f.ids.divA1))).toBe("");
    expect(failed(await f.clients.orgA.from("divisions").update({ trick_base: { disabled: [], enabled: ["addon:late"] } }).eq("id", f.ids.divA1))).toContain("TRICK_BASE_LOCKED");
    expect(failed(await f.clients.orgA.from("divisions").update({ trick_base: { disabled: [], enabled: "x" } }).eq("id", f.ids.divA2))).toContain("TRICK_BASE_INVALID");
  });
});
