import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, failed, run, signedIn, type Fixture } from "./helpers";

// Release tracker: platform admins read the ticks, only the owner ticks and confirms a version; organisers and visitors see and change nothing.
// It uses a version no real release has (999.0.x), and removes every row it makes.
const V = `999.0.${Math.floor(Math.random() * 1000)}`;

describe.skipIf(!ENV_OK)("Release tracker (hosted development project)", () => {
  let f: Fixture;
  const password = `Pw-${randomBytes(12).toString("hex")}`;
  const users: string[] = [];
  let owner: SupabaseClient;
  let staff: SupabaseClient;
  const user = async (k: string) => {
    const email = `rls-${run}-rel-${k}@example.com`;
    const { data, error } = await f.s.auth.admin.createUser({ email, email_confirm: true, password });
    if (error) throw new Error(error.message);
    users.push(data.user.id);
    return { email, id: data.user.id };
  };

  beforeAll(async () => {
    f = await buildFixture();
    const o = await user("owner");
    const s = await user("staff");
    await f.s.from("platform_admins").insert([{ user_id: o.id, role: "owner" }, { user_id: s.id, role: "staff" }]);
    owner = await signedIn(o.email, password);
    staff = await signedIn(s.email, password);
  });
  afterAll(async () => {
    await f?.s.from("release_check_ticks").delete().eq("version", V);
    await f?.s.from("release_signoffs").delete().eq("version", V);
    await f?.s.from("platform_admins").delete().in("user_id", users);
    for (const id of users) await f?.s.auth.admin.deleteUser(id);
    await f?.cleanup();
  });

  it("organisers and visitors can neither tick, confirm, read the status nor write the tables", async () => {
    for (const c of [f.clients.orgA, f.clients.anon]) {
      expect(failed(await c.rpc("admin_release_tick", { p_version: V, p_key: "abc", p_text: "x", p_ticked: true }))).not.toBe("");
      expect(failed(await c.rpc("admin_release_mark_tested", { p_version: V, p_keys: ["abc"] }))).not.toBe("");
      expect(failed(await c.rpc("admin_release_status"))).not.toBe("");
      expect(failed(await c.from("release_check_ticks").insert({ version: V, check_key: "abc", check_text: "x" }))).not.toBe("");
    }
    expect((await f.clients.orgA.from("release_check_ticks").select("version")).data ?? []).toEqual([]);
  });

  it("staff read but cannot tick; nobody writes the tables directly", async () => {
    expect(failed(await staff.rpc("admin_release_tick", { p_version: V, p_key: "abc", p_text: "x", p_ticked: true }))).toContain("NOT_ALLOWED");
    expect(failed(await staff.rpc("admin_release_status"))).toBe("");
    expect(failed(await owner.from("release_check_ticks").insert({ version: V, check_key: "abc", check_text: "x" }))).not.toBe("");
  });

  it("the owner ticks; confirming is refused until every check is ticked; unticking takes the confirmation away", async () => {
    expect(failed(await owner.rpc("admin_release_tick", { p_version: V, p_key: "aaa", p_text: "first", p_ticked: true }))).toBe("");
    expect(failed(await owner.rpc("admin_release_mark_tested", { p_version: V, p_keys: ["aaa", "bbb"] }))).toContain("RELEASE_CHECKS_OPEN");
    expect(failed(await owner.rpc("admin_release_tick", { p_version: V, p_key: "bbb", p_text: "second", p_ticked: true }))).toBe("");
    expect(failed(await owner.rpc("admin_release_mark_tested", { p_version: V, p_keys: ["aaa", "bbb"] }))).toBe("");
    const status = (await staff.rpc("admin_release_status")).data as { ticks: { version: string; by: string }[]; signoffs: { version: string }[] };
    expect(status.ticks.filter((t) => t.version === V)).toHaveLength(2);
    expect(status.ticks.find((t) => t.version === V)?.by).toContain(`rls-${run}-rel-owner`);
    expect(status.signoffs.some((s) => s.version === V)).toBe(true);
    expect(failed(await owner.rpc("admin_release_tick", { p_version: V, p_key: "aaa", p_text: "first", p_ticked: false }))).toBe("");
    expect((await f.s.from("release_signoffs").select("version").eq("version", V)).data).toEqual([]);
    expect(failed(await owner.rpc("admin_release_tick", { p_version: "not-a-version", p_key: "aaa", p_text: "x", p_ticked: true }))).toContain("INVALID_VERSION");
  });
});
