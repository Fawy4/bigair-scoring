import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, type Fixture } from "./helpers";
import { ago, codeOf, key, mkDivision, mkHeat, type LiveDivision } from "./live-helpers";

// Phase 5b step 2: the spotter. Attempts, the cap, duplicates, Undo last, plus the data-model additions (layout, live settings, height, sensor bindings).
describe.skipIf(!ENV_OK)("Spotter: attempts, cap, duplicates and Undo last (hosted development project)", () => {
  let f: Fixture;
  let d: LiveDivision;
  const log = (who: "spotter" | "head" | "j1" | "orgA" | "announcer", heat: string, entry: string, status: "landed" | "crashed" = "landed", ck = key(), extra: object = {}) =>
    f.clients[who].rpc("add_attempt", { p_heat: heat, p_entry: entry, p_client_key: ck, p_status: status, p_trick_name: "Left Backroll", p_trick_parts: { direction: "left", items: [{ id: "base:backroll" }] }, ...extra });
  const attempts = async (heat: string, entry: string) => (await f.s.from("trick_attempts").select("id, seq, deleted_at, possible_duplicate_of, created_at, trick_parts, input_method, raw_text").eq("heat_id", heat).eq("entry_id", entry).order("seq")).data ?? [];

  beforeAll(async () => {
    f = await buildFixture();
    d = await mkDivision(f, { name: "SpotDiv", seats: ["j1", "j2", "j3"], overrides: { heat: { maxAttemptsPerRider: 7 } } });
    await f.s.from("events").update({ settings: { publicLiveScores: "live", maxRunningHeats: 9 } }).eq("id", f.ids.evA1);
  });
  afterAll(async () => {
    await f?.cleanup();
  });

  it("the 8th attempt is refused even from a stale phone, a retry of a tap is not a new attempt, and deleting one gives the place back", async () => {
    const h = await mkHeat(f, d, { status: "running", started_at: ago(30) });
    const keys: string[] = [];
    for (let i = 0; i < 7; i++) {
      keys.push(key());
      expect(codeOf(await log("spotter", h, d.entries[0], "landed", keys[i])), `attempt ${i + 1}`).toBe("");
    }
    expect(codeOf(await log("spotter", h, d.entries[0], "landed", key()))).toContain("ATTEMPT_CAP_REACHED");
    expect(codeOf(await log("spotter", h, d.entries[0], "landed", keys[3]))).toBe(""); // the stale phone repeats its 4th tap: same attempt back
    expect(await attempts(h, d.entries[0])).toHaveLength(7);
    const first = (await attempts(h, d.entries[0]))[0];
    expect(codeOf(await f.clients.head.rpc("delete_attempt", { p_attempt: first.id, p_reason: "wrong rider" }))).toBe("");
    expect(codeOf(await log("spotter", h, d.entries[0], "landed", key()))).toBe("");
    expect(codeOf(await log("spotter", h, d.entries[0], "landed", key()))).toContain("ATTEMPT_CAP_REACHED");
  });

  it("two spotters 8 s apart: the second attempt carries possible_duplicate_of; 45 s apart: no flag; the same spotter twice: no flag", async () => {
    const h = await mkHeat(f, d, { status: "running", started_at: ago(60) });
    await log("spotter", h, d.entries[1]);
    await log("spotter", h, d.entries[1]);
    let rows = await attempts(h, d.entries[1]);
    expect(rows.every((r) => r.possible_duplicate_of === null)).toBe(true);
    // different seats: back-date the first attempt by 8 s, then by 45 s
    const h2 = await mkHeat(f, d, { status: "running", started_at: ago(60) });
    await log("spotter", h2, d.entries[0]);
    await f.s.from("trick_attempts").update({ created_at: ago(8) }).eq("heat_id", h2);
    await log("head", h2, d.entries[0]);
    rows = await attempts(h2, d.entries[0]);
    expect(rows[1].possible_duplicate_of).toBe(rows[0].id);
    const h3 = await mkHeat(f, d, { status: "running", started_at: ago(60) });
    await log("spotter", h3, d.entries[0]);
    await f.s.from("trick_attempts").update({ created_at: ago(45) }).eq("heat_id", h3);
    await log("head", h3, d.entries[0]);
    expect((await attempts(h3, d.entries[0]))[1].possible_duplicate_of).toBeNull();
  });

  it("the sequence of blocks, the free text and the way it was entered are stored as logged", async () => {
    const h = await mkHeat(f, d, { status: "running", started_at: ago(30) });
    const parts = { direction: "left", items: [{ id: "base:backroll", multiplier: "x2" }, { id: "addon:board_off" }], freeText: "banana", needsReview: true };
    const r = await log("spotter", h, d.entries[2], "landed", key(), { p_trick_parts: parts, p_input_method: "speech", p_raw_text: "left double backroll board off banana", p_direction: "left", p_category_key: "board_off" });
    expect(codeOf(r)).toBe("");
    const row = (await attempts(h, d.entries[2]))[0];
    expect(row.trick_parts).toEqual(parts);
    expect(row).toMatchObject({ input_method: "speech", raw_text: "left double backroll board off banana" });
  });

  it("spotters cannot log while the heat is paused, nor on a heat that has not started; judges and announcers cannot log unless allowed", async () => {
    const paused = await mkHeat(f, d, { status: "paused", started_at: ago(300), paused_at: ago(20) });
    expect(codeOf(await log("spotter", paused, d.entries[0]))).toContain("HEAT_NOT_RUNNING");
    const waiting = await mkHeat(f, d);
    expect(codeOf(await log("spotter", waiting, d.entries[0]))).toContain("HEAT_NOT_RUNNING");
    const run = await mkHeat(f, d, { status: "running", started_at: ago(30) });
    expect(codeOf(await log("j1", run, d.entries[0]))).toContain("NOT_ALLOWED");
    expect(codeOf(await log("announcer", run, d.entries[0]))).toContain("NOT_ALLOWED");
  });

  it("Undo last: the creating spotter takes an attempt back within 10 s (soft delete, audited, no reason); after 10 s or by anyone else it is refused", async () => {
    const h = await mkHeat(f, d, { status: "running", started_at: ago(30) });
    const made = await log("spotter", h, d.entries[0]);
    const id = (made.data as { id: string }).id;
    expect(codeOf(await f.clients.head.rpc("undo_attempt", { p_attempt: id }))).toContain("NOT_ALLOWED");
    expect(codeOf(await f.clients.j1.rpc("undo_attempt", { p_attempt: id }))).toContain("NOT_ALLOWED");
    expect(codeOf(await f.clients.spotter.rpc("undo_attempt", { p_attempt: id }))).toBe("");
    expect((await attempts(h, d.entries[0]))[0].deleted_at).not.toBeNull();
    const line = (await f.s.from("audit_log").select("action, actor_seat_id").eq("row_id", id).eq("action", "attempt_undone")).data ?? [];
    expect(line).toHaveLength(1);
    expect(line[0].actor_seat_id).toBe(f.ids.seat_spotter);
    expect(codeOf(await f.clients.spotter.rpc("undo_attempt", { p_attempt: id }))).toBe(""); // already undone: nothing more happens
    const late = await log("spotter", h, d.entries[1]);
    const lateId = (late.data as { id: string }).id;
    await f.s.from("trick_attempts").update({ created_at: ago(11) }).eq("id", lateId);
    expect(codeOf(await f.clients.spotter.rpc("undo_attempt", { p_attempt: lateId }))).toContain("UNDO_TOO_LATE");
    expect((await attempts(h, d.entries[1]))[0].deleted_at).toBeNull();
  });

  it("the counter's reconnect check agrees with the attempts list", async () => {
    const h = await mkHeat(f, d, { status: "running", started_at: ago(30) });
    for (let i = 0; i < 3; i++) await log("spotter", h, d.entries[0]);
    const r = await f.clients.spotter.rpc("attempt_counts", { p_heat: h });
    expect(codeOf(r)).toBe("");
    expect(JSON.stringify(r.data)).toContain("3");
  });

  describe("data model for later: layout, live settings, height and sensor bindings", () => {
    it("an organiser stores the spotter's layout in the trick base; a layout that is not an object is refused; officials cannot write it", async () => {
      const layout = { families: ["direction", "multiplier", "base", "grab_landing", "addon"], moved: { "addon:tic_tac": "base" }, order: {}, favourites: ["base:backroll"] };
      const ok = await f.clients.orgA.from("divisions").update({ trick_base: { disabled: [], layout } }).eq("id", d.div).select("trick_base");
      expect(codeOf(ok)).toBe("");
      expect((ok.data ?? [])[0].trick_base).toEqual({ disabled: [], layout });
      expect(codeOf(await f.clients.orgA.from("divisions").update({ trick_base: { disabled: [], layout: "nope" } }).eq("id", d.div))).toContain("TRICK_BASE_INVALID");
      const other = await f.clients.head.from("divisions").update({ trick_base: { disabled: ["base:x"] } }).eq("id", d.div).select("id");
      expect(other.data ?? []).toHaveLength(0);
    });

    it("live settings are stored per division by the organiser and readable by the officials", async () => {
      const settings = { showPercentOfMax: true, impressionSummary: { counts: false } };
      expect(codeOf(await f.clients.orgA.from("divisions").update({ live_settings: settings }).eq("id", d.div))).toBe("");
      const seen = await f.clients.j1.from("divisions").select("live_settings").eq("id", d.div).single();
      expect(seen.data?.live_settings).toEqual(settings);
      expect(codeOf(await f.clients.orgA.from("divisions").update({ live_settings: [] }).eq("id", d.div))).not.toBe("");
    });

    it("an attempt can carry a height, where it came from, a reference and when; the source is a short list", async () => {
      const h = await mkHeat(f, d, { status: "running", started_at: ago(30) });
      const { error } = await f.s.from("trick_attempts").insert({ heat_id: h, entry_id: d.entries[0], seq: 1, status: "landed", client_key: key(), height_m: 14.2, height_source: "woo", height_ref: "woo-session-77", height_at: new Date().toISOString() });
      expect(error).toBeNull();
      const bad = await f.s.from("trick_attempts").insert({ heat_id: h, entry_id: d.entries[0], seq: 2, status: "landed", client_key: key(), height_source: "guess" });
      expect(bad.error).not.toBeNull();
    });

    it("sensor bindings: the event's organisers manage them, officials of the event read them, nobody else sees them", async () => {
      const row = { entry_id: d.entries[0], provider: "woo", external_user_id: "woo-123", device_serial: "WOO-0001" };
      const made = await f.clients.orgA.from("sensor_bindings").insert(row).select("id, event_id, bound_at, unbound_at").single();
      expect(codeOf(made)).toBe("");
      expect(made.data?.event_id).toBe(f.ids.evA1);
      expect(made.data?.unbound_at).toBeNull();
      expect(codeOf(await f.clients.orgB.from("sensor_bindings").insert(row))).not.toBe("");
      expect(codeOf(await f.clients.j1.from("sensor_bindings").insert(row))).not.toBe("");
      expect(((await f.clients.j1.from("sensor_bindings").select("id").eq("entry_id", d.entries[0])).data ?? []).length).toBe(1);
      expect(((await f.clients.orgB.from("sensor_bindings").select("id").eq("entry_id", d.entries[0])).data ?? []).length).toBe(0);
      expect(((await f.clients.anon.from("sensor_bindings").select("id")).data ?? []).length).toBe(0);
      const unbound = await f.clients.orgA.from("sensor_bindings").update({ unbound_at: new Date().toISOString() }).eq("id", made.data!.id).select("unbound_at").single();
      expect(unbound.data?.unbound_at).not.toBeNull();
      expect(codeOf(await f.clients.orgA.from("sensor_bindings").insert({ entry_id: d.entries[0], provider: "woo" }))).not.toBe("");
    });
  });
});
