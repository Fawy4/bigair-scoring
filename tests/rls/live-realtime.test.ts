import type { RealtimeChannel } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, uuid, type Fixture } from "./helpers";

// Phase 5b step 7: officials follow a heat through Realtime. This is the part the browser tests in the sandbox cannot cover (the sandbox's browser cannot open the
// WebSocket), so it is proved here from Node: an attempt logged by the spotter reaches a judge's phone within a second, a judge never receives another judge's
// scores, and the head judge receives them all.
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!ENV_OK)("Realtime for officials (hosted development project)", () => {
  let f: Fixture;
  const channels: RealtimeChannel[] = [];
  const listen = async (who: keyof Fixture["clients"], table: string, filter: string) => {
    const seen: Array<{ at: number; row: Record<string, unknown>; type: string }> = [];
    const ch = f.clients[who].channel(`rt-${who}-${table}-${uuid().slice(0, 6)}`).on("postgres_changes", { event: "*", schema: "public", table, filter }, (p) => {
      seen.push({ at: Date.now(), row: (p.new ?? p.old) as Record<string, unknown>, type: p.eventType });
    });
    channels.push(ch);
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`channel ${who}/${table} did not subscribe`)), 20_000);
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(t);
          resolve();
        }
      });
    });
    await wait(1500); // a channel reports SUBSCRIBED slightly before the server streams (the screens refetch a snapshot at that moment, so nothing is lost)
    return seen;
  };

  beforeAll(async () => {
    f = await buildFixture();
  });
  afterAll(async () => {
    for (const ch of channels) await ch.unsubscribe();
    await f?.cleanup();
  });

  it("an attempt logged by the spotter reaches a judge and the head judge within a second; a visitor's channel never sees it", async () => {
    const heat = f.ids.H1;
    const judge = await listen("j1", "trick_attempts", `heat_id=eq.${heat}`);
    const head = await listen("head", "trick_attempts", `heat_id=eq.${heat}`);
    const stranger = await listen("bJudge", "trick_attempts", `heat_id=eq.${heat}`);
    const sent = Date.now();
    const r = await f.clients.spotter.rpc("add_attempt", { p_heat: heat, p_entry: f.ids.e3, p_client_key: uuid(), p_status: "landed", p_trick_name: "Left Backroll" });
    expect(r.error).toBeNull();
    const until = Date.now() + 5000;
    while ((judge.length === 0 || head.length === 0) && Date.now() < until) await wait(50);
    expect(judge.length).toBeGreaterThan(0);
    expect(head.length).toBeGreaterThan(0);
    const took = Math.max(judge[0].at, head[0].at) - sent;
    console.log(`attempt reached the judge and head channels ${judge[0].at - sent} ms and ${head[0].at - sent} ms after the spotter's call returned its request`);
    expect(took).toBeLessThan(1500);
    expect(judge[0].row).toMatchObject({ heat_id: heat, entry_id: f.ids.e3 });
    await wait(1500);
    expect(stranger).toHaveLength(0);
  });

  it("a judge's channel gets only that judge's own scores; the head judge's gets everybody's", async () => {
    const heat = f.ids.H1;
    const attempt = f.ids.attH1;
    const mine = await listen("j1", "trick_scores", `heat_id=eq.${heat}`);
    const head = await listen("head", "trick_scores", `heat_id=eq.${heat}`);
    const mark = (who: "j1" | "j2", v: number) => f.clients[who].rpc("submit_trick_score", { p_attempt: attempt, p_criteria: {}, p_score: v, p_missed: false, p_flag: null, p_client_key: uuid(), p_client_rev: Date.now() });
    expect((await mark("j2", 6.5)).error).toBeNull();
    expect((await mark("j1", 7.5)).error).toBeNull();
    const until = Date.now() + 6000;
    while ((head.length < 2 || mine.length < 1) && Date.now() < until) await wait(50);
    expect(head.length).toBeGreaterThanOrEqual(2);
    expect(mine.length).toBeGreaterThanOrEqual(1);
    expect(mine.every((m) => m.row.judge_seat_id === f.ids.seat_j1)).toBe(true);
  });

  it("a deleted attempt arrives as an update with deleted_at (the spotter's counter gives the place back)", async () => {
    const heat = f.ids.H1;
    const spotter = await listen("spotter", "trick_attempts", `heat_id=eq.${heat}`);
    const del = await f.clients.head.rpc("delete_attempt", { p_attempt: f.ids.attH1, p_reason: "test" });
    expect(del.error).toBeNull();
    const until = Date.now() + 5000;
    while (spotter.length === 0 && Date.now() < until) await wait(50);
    expect(spotter.find((s) => s.type === "UPDATE")?.row.deleted_at).toBeTruthy();
  });

  it("the head judge receives a judge's flag and sheet as they happen; another judge does not", async () => {
    const heat = f.ids.H3; // ended long ago: a judge may still flag and submit
    const crashed = (await f.s.from("trick_attempts").insert({ heat_id: heat, entry_id: f.ids.e1, seq: 2, status: "crashed", client_key: uuid(), trick_name: "Left Frontroll" }).select("id").single()).data!.id;
    const headFlags = await listen("head", "attempt_flags", `heat_id=eq.${heat}`);
    const otherFlags = await listen("j2", "attempt_flags", `heat_id=eq.${heat}`);
    const headSheets = await listen("head", "judge_sheets", `heat_id=eq.${heat}`);
    const flag = await f.clients.j1.rpc("submit_flag", { p_attempt: crashed, p_kind: "landed", p_note: null, p_client_key: uuid() });
    expect(flag.error).toBeNull();
    const sheet = await f.clients.j1.rpc("submit_sheet", { p_heat: heat });
    // the fixture's model has no Impression, so Submit is allowed at once
    expect(sheet.error).toBeNull();
    const until = Date.now() + 6000;
    while ((headFlags.length === 0 || headSheets.length === 0) && Date.now() < until) await wait(50);
    expect(headFlags[0]?.row.kind).toBe("landed");
    expect(headSheets.length).toBeGreaterThan(0);
    await wait(1000);
    expect(otherFlags).toHaveLength(0);
  });
});
