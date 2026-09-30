import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drawDemoEvent } from "@/lib/demo/draw";
import { ENV_OK, run, service } from "./helpers";

// The draw step of "Create demo organisation" (also used by `npm run seed:demo`), tried on a throwaway event so the real demo is never touched.
describe.skipIf(!ENV_OK)("demo draw", () => {
  const s = service();
  let orgId = "";
  let eventId = "";

  beforeAll(async () => {
    const ins = async <T>(table: string, row: object): Promise<T & { id: string }> => {
      const { data, error } = await s.from(table).insert(row).select().single();
      if (error) throw new Error(`insert ${table}: ${error.message}`);
      return data as T & { id: string };
    };
    orgId = (await ins("organisations", { name: `Draw test ${run}`, slug: `plat-draw-${run}` })).id;
    eventId = (await ins("events", { organisation_id: orgId, name: "Draw event", slug: `plat-draw-ev-${run}`, status: "draft" })).id;
    const { data: fmt } = await s.from("format_templates").select("id").is("organisation_id", null).eq("key", "kota-dingle").not("published_at", "is", null).order("version", { ascending: false }).limit(1).single();
    const div = await ins<{ id: string }>("divisions", { event_id: eventId, name: "Pro", sort_order: 1, format_template_id: fmt!.id });
    for (let i = 1; i <= 8; i++) {
      const rider = await ins<{ id: string }>("riders", { organisation_id: orgId, first_name: `Rider${i}`, last_name: "Draw" });
      await ins("entries", { division_id: div.id, rider_id: rider.id, seed: i, status: "confirmed", source: "manual" });
    }
  });
  afterAll(async () => {
    if (orgId) await s.rpc("purge_organisation", { p_org: orgId });
  });

  it("draws every division once with rounds, heats and slots, and a second run changes nothing", async () => {
    const first = await drawDemoEvent(s, `plat-draw-ev-${run}`);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ drawn: true });
    expect(first[0].heats).toBeGreaterThan(0);
    const heatsAfterFirst = ((await s.from("heats").select("id").eq("event_id", eventId)).data ?? []).length;
    expect(heatsAfterFirst).toBe(first[0].heats);
    const second = await drawDemoEvent(s, `plat-draw-ev-${run}`);
    expect(second[0]).toMatchObject({ drawn: false });
    expect(((await s.from("heats").select("id").eq("event_id", eventId)).data ?? []).length).toBe(heatsAfterFirst);
  });

  it("says so in plain words when the event does not exist", async () => {
    await expect(drawDemoEvent(s, "no-such-event-xyz")).rejects.toThrow(/not found/i);
  });
});
