import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ENV_OK, run, service, signedIn } from "./helpers";

// Polish 4: organisations manage their own presets, hide built-ins for themselves; the owner manages built-ins.
// Throwaway organisations and throwaway built-in keys only: no real preset is changed (the real DEFAULT is put back at the end).
const msg = (r: { error: { message: string } | null }): string => r.error?.message ?? "";

describe.skipIf(!ENV_OK)("Preset management (hosted development project)", () => {
  const s = service();
  const password = `Pw-${randomBytes(12).toString("hex")}`;
  const users: string[] = [];
  const orgs: string[] = [];
  const ids: Record<string, string> = {};
  let orgA: SupabaseClient, orgB: SupabaseClient, owner: SupabaseClient, staff: SupabaseClient;
  const keyA = `p4-${run}-a`;
  const keyB = `p4-${run}-b`;
  const builtIn = `p4-${run}-builtin`;
  const model = { name: "x" };
  let originalDefault: string | undefined;

  const ins = async <T>(table: string, row: object): Promise<T & { id: string }> => {
    const { data, error } = await s.from(table).insert(row).select().single();
    if (error) throw new Error(`insert ${table}: ${error.message}`);
    return data as T & { id: string };
  };
  const user = async (key: string) => {
    const email = `p4-${run}-${key}@example.com`;
    const { data, error } = await s.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    return { email, id: data.user.id };
  };
  const names = async (table: string, key: string, org: string | null) => {
    const q = s.from(table).select("name, json, retired_at, version").eq("key", key);
    const { data } = await (org ? q.eq("organisation_id", org) : q.is("organisation_id", null)).order("version");
    return data ?? [];
  };

  beforeAll(async () => {
    const [oa, ob, ow, st] = [await user("a"), await user("b"), await user("owner"), await user("staff")];
    await ins("platform_admins", { user_id: ow.id, role: "owner" });
    await ins("platform_admins", { user_id: st.id, role: "staff" });
    ids.orgA = (await ins("organisations", { name: `P4 A ${run}`, slug: `p4-a-${run}` })).id;
    ids.orgB = (await ins("organisations", { name: `P4 B ${run}`, slug: `p4-b-${run}` })).id;
    orgs.push(ids.orgA, ids.orgB);
    await ins("memberships", { organisation_id: ids.orgA, user_id: oa.id, role: "owner" });
    await ins("memberships", { organisation_id: ids.orgB, user_id: ob.id, role: "owner" });
    orgA = await signedIn(oa.email, password);
    orgB = await signedIn(ob.email, password);
    owner = await signedIn(ow.email, password);
    staff = await signedIn(st.email, password);
    // A's presets: version 1 and 2 of keyA; one of B's
    ids.a1 = (await ins("scoring_models", { organisation_id: ids.orgA, key: keyA, name: "A preset", version: 1, json: { ...model, counted: 3 }, content_hash: "h1" })).id;
    ids.a2 = (await ins("scoring_models", { organisation_id: ids.orgA, key: keyA, name: "A preset", version: 2, json: { ...model, counted: 2 }, content_hash: "h2" })).id;
    ids.b1 = (await ins("scoring_models", { organisation_id: ids.orgB, key: keyB, name: "B preset", version: 1, json: model, content_hash: "h3" })).id;
    // a throwaway built-in
    ids.s1 = (await ins("scoring_models", { organisation_id: null, key: builtIn, name: "P4 built-in", version: 1, json: { ...model, counted: 5 }, content_hash: "h4", published_at: new Date().toISOString() })).id;
    const d = await s.from("platform_default_presets").select("key").eq("kind", "scoring_model").maybeSingle();
    originalDefault = d.data?.key;
    // an event of A with a division that uses A's version 1
    const base = { timezone: "Africa/Cairo", start_date: "2026-10-10", end_date: "2026-10-11" };
    ids.ev = (await ins("events", { ...base, organisation_id: ids.orgA, name: "P4 Arrow", slug: `p4-ev-${run}`, status: "draft" })).id;
    ids.div = (await ins("divisions", { event_id: ids.ev, name: "Pro Men", sort_order: 1, scoring_model_id: ids.a1 })).id;
  });

  afterAll(async () => {
    if (originalDefault) await s.from("platform_default_presets").upsert({ kind: "scoring_model", key: originalDefault });
    for (const o of orgs) await s.rpc("purge_organisation", { p_org: o });
    await s.from("scoring_models").delete().eq("key", builtIn);
    for (const id of users) await s.auth.admin.deleteUser(id);
  });

  describe("an organiser and their own presets", () => {
    it("can rename their own preset: every version gets the new name, the rules are untouched", async () => {
      const r = await orgA.rpc("rename_org_preset", { p_org: ids.orgA, p_kind: "scoring_model", p_key: keyA, p_name: "  Renamed  " });
      expect(msg(r)).toBe("");
      const rows = await names("scoring_models", keyA, ids.orgA);
      expect(rows.map((x) => x.name)).toEqual(["Renamed", "Renamed"]);
      expect(rows.map((x) => (x.json as { counted: number }).counted)).toEqual([3, 2]);
    });
    it("cannot rename someone else's preset, or a built-in, or use a name that is too short", async () => {
      expect(msg(await orgB.rpc("rename_org_preset", { p_org: ids.orgA, p_kind: "scoring_model", p_key: keyA, p_name: "Mine now" }))).toContain("NOT_ALLOWED");
      expect(msg(await orgB.rpc("rename_org_preset", { p_org: ids.orgB, p_kind: "scoring_model", p_key: keyA, p_name: "Mine now" }))).toContain("NOT_FOUND");
      expect(msg(await orgA.rpc("rename_org_preset", { p_org: ids.orgA, p_kind: "scoring_model", p_key: builtIn, p_name: "Taken" }))).toContain("NOT_FOUND");
      expect(msg(await orgA.rpc("rename_org_preset", { p_org: ids.orgA, p_kind: "scoring_model", p_key: keyA, p_name: "x" }))).toContain("PRESET_NAME");
      expect((await names("scoring_models", builtIn, null))[0].name).toBe("P4 built-in");
    });
    it("cannot write, update or delete a built-in or another organisation's preset through the table either", async () => {
      await orgA.from("scoring_models").update({ name: "Hacked" }).eq("id", ids.s1);
      await orgA.from("scoring_models").delete().eq("id", ids.s1);
      await orgA.from("scoring_models").update({ name: "Hacked" }).eq("id", ids.b1);
      await orgA.from("scoring_models").delete().eq("id", ids.b1);
      expect((await names("scoring_models", builtIn, null))[0].name).toBe("P4 built-in");
      expect((await names("scoring_models", keyB, ids.orgB))[0].name).toBe("B preset");
      const asA = await orgA.from("scoring_models").insert({ organisation_id: null, key: `p4-${run}-x`, name: "Mine", version: 1, json: model, content_hash: "z" });
      expect(asA.error).not.toBeNull();
    });
    it("can add the next version (Update preset from this division) without touching the one a division loaded", async () => {
      const r = await orgA.from("scoring_models").insert({ organisation_id: ids.orgA, key: keyA, name: "Renamed", version: 3, json: { ...model, counted: 1 }, content_hash: "h5" });
      expect(msg(r)).toBe("");
      const { data } = await s.from("scoring_models").select("json").eq("id", ids.a1).single();
      expect((data!.json as { counted: number }).counted).toBe(3);
      const { data: d } = await s.from("divisions").select("scoring_model_id").eq("id", ids.div).single();
      expect(d!.scoring_model_id).toBe(ids.a1);
    });
    it("cannot delete a preset a division of a live event uses: the answer names the division", async () => {
      const r = await orgA.rpc("delete_org_preset", { p_org: ids.orgA, p_kind: "scoring_model", p_key: keyA });
      expect(r.data).toEqual({ ok: false, usedBy: ["Pro Men in P4 Arrow"] });
      expect((await names("scoring_models", keyA, ids.orgA)).length).toBe(3);
    });
    it("cannot delete someone else's preset", async () => {
      expect(msg(await orgB.rpc("delete_org_preset", { p_org: ids.orgA, p_kind: "scoring_model", p_key: keyA }))).toContain("NOT_ALLOWED");
      expect(msg(await orgB.rpc("delete_org_preset", { p_org: ids.orgB, p_kind: "scoring_model", p_key: keyA }))).toContain("NOT_FOUND");
    });
    it("can delete an unused preset outright", async () => {
      const r = await orgB.rpc("delete_org_preset", { p_org: ids.orgB, p_kind: "scoring_model", p_key: keyB });
      expect(r.data).toEqual({ ok: true, usedBy: [] });
      expect((await names("scoring_models", keyB, ids.orgB)).length).toBe(0);
    });
    it("a preset only an ARCHIVED event still uses is retired (kept for that division), not refused", async () => {
      await s.from("events").update({ archived_at: new Date().toISOString() }).eq("id", ids.ev);
      const r = await orgA.rpc("delete_org_preset", { p_org: ids.orgA, p_kind: "scoring_model", p_key: keyA });
      expect(r.data).toEqual({ ok: true, usedBy: [] });
      const rows = await names("scoring_models", keyA, ids.orgA);
      expect(rows.length).toBe(3);
      expect(rows.every((x) => x.retired_at)).toBe(true);
      const { data } = await s.from("scoring_models").select("json").eq("id", ids.a1).single();
      expect((data!.json as { counted: number }).counted).toBe(3); // the division still reads what it loaded
      await s.from("events").update({ archived_at: null }).eq("id", ids.ev);
    });
  });

  describe("hiding built-ins", () => {
    it("an organisation can hide a built-in for itself only, and show it again", async () => {
      expect(msg(await orgA.rpc("hide_builtin_preset", { p_org: ids.orgA, p_kind: "scoring_model", p_key: builtIn, p_hidden: true }))).toBe("");
      const a = await orgA.from("organisation_hidden_presets").select("key");
      const b = await orgB.from("organisation_hidden_presets").select("key");
      expect((a.data ?? []).map((x) => x.key)).toContain(builtIn);
      expect(b.data ?? []).toEqual([]);
      expect(msg(await orgA.rpc("hide_builtin_preset", { p_org: ids.orgA, p_kind: "scoring_model", p_key: builtIn, p_hidden: false }))).toBe("");
      expect((await orgA.from("organisation_hidden_presets").select("key")).data).toEqual([]);
    });
    it("cannot hide for another organisation, write the table directly, or hide something that is not a built-in", async () => {
      expect(msg(await orgB.rpc("hide_builtin_preset", { p_org: ids.orgA, p_kind: "scoring_model", p_key: builtIn, p_hidden: true }))).toContain("NOT_ALLOWED");
      expect((await orgA.from("organisation_hidden_presets").insert({ organisation_id: ids.orgA, kind: "scoring_model", key: builtIn })).error).not.toBeNull();
      expect(msg(await orgA.rpc("hide_builtin_preset", { p_org: ids.orgA, p_kind: "scoring_model", p_key: keyA, p_hidden: true }))).toContain("NOT_FOUND");
    });
    it("the DEFAULT built-in cannot be hidden", async () => {
      if (!originalDefault) return;
      expect(msg(await orgA.rpc("hide_builtin_preset", { p_org: ids.orgA, p_kind: "scoring_model", p_key: originalDefault, p_hidden: true }))).toContain("PRESET_IS_DEFAULT");
    });
  });

  describe("the owner and the built-ins", () => {
    it("an organiser and staff cannot rename, retire, set DEFAULT or delete a built-in", async () => {
      for (const c of [orgA, staff]) {
        expect(msg(await c.rpc("admin_rename_preset", { p_kind: "scoring_model", p_key: builtIn, p_name: "Nope" }))).toContain("NOT_ALLOWED");
        expect(msg(await c.rpc("admin_set_preset_retired", { p_kind: "scoring_model", p_key: builtIn, p_retired: true }))).toContain("NOT_ALLOWED");
        expect(msg(await c.rpc("admin_set_default_preset", { p_kind: "scoring_model", p_key: builtIn }))).toContain("NOT_ALLOWED");
        expect(msg(await c.rpc("admin_delete_preset", { p_kind: "scoring_model", p_key: builtIn }))).toContain("NOT_ALLOWED");
      }
      expect((await names("scoring_models", builtIn, null))[0]).toMatchObject({ name: "P4 built-in", retired_at: null });
    });
    it("the owner can rename, retire and restore; retiring leaves the row (and every division's copy) as it was", async () => {
      expect(msg(await owner.rpc("admin_rename_preset", { p_kind: "scoring_model", p_key: builtIn, p_name: "P4 renamed" }))).toBe("");
      expect(msg(await owner.rpc("admin_set_preset_retired", { p_kind: "scoring_model", p_key: builtIn, p_retired: true }))).toBe("");
      let row = (await names("scoring_models", builtIn, null))[0];
      expect(row.name).toBe("P4 renamed");
      expect(row.retired_at).not.toBeNull();
      expect((row.json as { counted: number }).counted).toBe(5);
      expect(msg(await owner.rpc("admin_set_preset_retired", { p_kind: "scoring_model", p_key: builtIn, p_retired: false }))).toBe("");
      row = (await names("scoring_models", builtIn, null))[0];
      expect(row.retired_at).toBeNull();
    });
    it("the owner can edit a built-in (a draft, then published) as a new version: the first version is untouched", async () => {
      const r = await owner.rpc("admin_create_preset_version", { p_kind: "scoring_model", p_key: builtIn, p_name: "P4 renamed", p_json: { ...model, counted: 9 }, p_hash: "h6" });
      expect(msg(r)).toBe("");
      expect(msg(await owner.rpc("admin_publish_preset", { p_kind: "scoring_model", p_id: r.data }))).toBe("");
      const rows = await names("scoring_models", builtIn, null);
      expect(rows.map((x) => (x.json as { counted: number }).counted)).toEqual([5, 9]);
    });
    it("the owner can set the DEFAULT; the DEFAULT can be neither retired, hidden nor deleted; then it is put back", async () => {
      expect(msg(await owner.rpc("admin_set_default_preset", { p_kind: "scoring_model", p_key: builtIn }))).toBe("");
      expect(msg(await owner.rpc("admin_set_preset_retired", { p_kind: "scoring_model", p_key: builtIn, p_retired: true }))).toContain("PRESET_IS_DEFAULT");
      expect(msg(await orgA.rpc("hide_builtin_preset", { p_org: ids.orgA, p_kind: "scoring_model", p_key: builtIn, p_hidden: true }))).toContain("PRESET_IS_DEFAULT");
      expect(msg(await owner.rpc("admin_delete_preset", { p_kind: "scoring_model", p_key: builtIn }))).toContain("PRESET_IS_DEFAULT");
      if (originalDefault) await s.from("platform_default_presets").upsert({ kind: "scoring_model", key: originalDefault });
      else await s.from("platform_default_presets").delete().eq("kind", "scoring_model");
    });
    it("deleting a built-in is refused while any division references it, and works when none does", async () => {
      await s.from("divisions").update({ scoring_model_id: ids.s1 }).eq("id", ids.div);
      const refused = await owner.rpc("admin_delete_preset", { p_kind: "scoring_model", p_key: builtIn });
      expect(refused.data).toEqual({ ok: false, usedBy: ["Pro Men in P4 Arrow"] });
      expect((await names("scoring_models", builtIn, null)).length).toBe(2);
      await s.from("divisions").update({ scoring_model_id: ids.a1 }).eq("id", ids.div);
      const done = await owner.rpc("admin_delete_preset", { p_kind: "scoring_model", p_key: builtIn });
      expect(done.data).toEqual({ ok: true, usedBy: [] });
      expect((await names("scoring_models", builtIn, null)).length).toBe(0);
    });
    it("a division that loaded a built-in keeps its copy while the owner renames and retires it", async () => {
      ids.s2 = (await ins("scoring_models", { organisation_id: null, key: builtIn, name: "P4 built-in", version: 1, json: { ...model, counted: 5 }, content_hash: "h7", published_at: new Date().toISOString() })).id;
      await s.from("divisions").update({ scoring_model_id: ids.s2 }).eq("id", ids.div);
      await owner.rpc("admin_rename_preset", { p_kind: "scoring_model", p_key: builtIn, p_name: "Different name" });
      await owner.rpc("admin_set_preset_retired", { p_kind: "scoring_model", p_key: builtIn, p_retired: true });
      const { data } = await s.from("divisions").select("scoring_model_id, scoring_models(json, retired_at)").eq("id", ids.div).single();
      expect(data!.scoring_model_id).toBe(ids.s2);
      expect((data!.scoring_models as unknown as { json: { counted: number } }).json.counted).toBe(5);
      // the organiser who owns the division can still read the retired row it uses
      const asA = await orgA.from("scoring_models").select("id").eq("id", ids.s2);
      expect((asA.data ?? []).length).toBe(1);
      await s.from("divisions").update({ scoring_model_id: ids.a1 }).eq("id", ids.div);
    });
  });
});
