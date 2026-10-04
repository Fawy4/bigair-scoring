import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, type Fixture } from "./helpers";

// Export 1: who may export, and the audit line. export_role says organiser / head / nobody; log_export refuses everybody else, in the database, and its one write is its audit line.
describe.skipIf(!ENV_OK)("Export: export_role and log_export (hosted development project)", () => {
  let f: Fixture;
  beforeAll(async () => {
    f = await buildFixture();
  });
  afterAll(async () => {
    await f?.cleanup();
  });

  const role = async (who: keyof Fixture["clients"], event = "evA1") => (await f.clients[who].rpc("export_role", { p_event: f.ids[event] })).data;
  const lines = async (action: string) => (await f.s.from("audit_log").select("action, actor_user_id, after").eq("event_id", f.ids.evA1).eq("action", action)).data ?? [];

  it("an organiser of the event is 'organiser', its head judge is 'head', everybody else is nobody", async () => {
    expect(await role("orgA")).toBe("organiser");
    expect(await role("head")).toBe("head");
    for (const who of ["j1", "j2", "spotter", "announcer", "revoked", "anon", "orgB", "bJudge"] as const) expect(await role(who), who).toBeNull();
  });

  it("log_export writes one line for an organiser (results and backup) and one for the head judge (results only)", async () => {
    const before = (await lines("results_exported")).length;
    expect((await f.clients.orgA.rpc("log_export", { p_event: f.ids.evA1, p_kind: "results_csv", p_include_draft: true, p_heats: 3 })).error).toBeNull();
    expect((await f.clients.head.rpc("log_export", { p_event: f.ids.evA1, p_kind: "results_print" })).error).toBeNull();
    const after = await lines("results_exported");
    expect(after.length).toBe(before + 2);
    expect(after.some((l) => (l.after as { include_draft?: boolean; heats?: number }).include_draft === true && (l.after as { heats?: number }).heats === 3)).toBe(true);
    expect((await f.clients.orgA.rpc("log_export", { p_event: f.ids.evA1, p_kind: "backup" })).error).toBeNull();
    expect((await lines("backup_downloaded")).length).toBe(1);
  });

  it("the head judge may not log a backup or a draft export; judges, spotters, observers-to-be, other organisations and visitors may not log anything", async () => {
    expect((await f.clients.head.rpc("log_export", { p_event: f.ids.evA1, p_kind: "backup" })).error?.message).toContain("NOT_ALLOWED");
    expect((await f.clients.head.rpc("log_export", { p_event: f.ids.evA1, p_kind: "results_csv", p_include_draft: true })).error?.message).toContain("NOT_ALLOWED");
    const before = (await lines("results_exported")).length;
    for (const who of ["j1", "spotter", "announcer", "revoked", "anon", "orgB", "bJudge"] as const) {
      expect((await f.clients[who].rpc("log_export", { p_event: f.ids.evA1, p_kind: "results_csv" })).error, who).not.toBeNull();
    }
    expect((await f.clients.orgA.rpc("log_export", { p_event: f.ids.evA1, p_kind: "something_else" })).error?.message).toContain("NOT_ALLOWED");
    expect((await lines("results_exported")).length).toBe(before);
  });
});
