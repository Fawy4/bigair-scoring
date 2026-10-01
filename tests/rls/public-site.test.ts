import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, type Fixture } from "./helpers";
import { codeOf } from "./live-helpers";
import { mkLadder, publishLadderHeat, type Ladder } from "./public-helpers";

// Phase 6: everything a visitor can read goes through the public functions. Nothing before publish, nothing held, nothing from a simulation or archived event,
// no judge-level marks, no stored draw. Every function is tried on every kind of event that must stay closed.
type J = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe.skipIf(!ENV_OK)("Public site functions (hosted development project)", () => {
  let f: Fixture;
  let slugs: Record<"open" | "draft" | "sim" | "archived" | "orgArchived", string>;
  let ids: Record<"open" | "draft" | "sim" | "archived" | "orgArchived", string>;
  let orgC = "";
  let ladder: Ladder;
  let unlocked: Ladder;
  const anon = () => f.clients.anon;
  const closed = ["draft", "sim", "archived", "orgArchived"] as const;
  const rpc = async (fn: string, args: object, c = anon()): Promise<J> => {
    const { data, error } = await c.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data as J;
  };
  const results = async (): Promise<J> => rpc("get_public_results", { p_event: ids.open });
  const heatOf = (res: J, id: string): J => res.divisions.flatMap((d: J) => d.rounds.flatMap((r: J) => r.heats)).find((h: J) => h.id === id);

  beforeAll(async () => {
    f = await buildFixture();
    const s = f.s;
    const base = { timezone: "Africa/Cairo", start_date: "2026-10-10", end_date: "2026-10-11", status: "published" };
    const mk = async (key: string, patch: object, org = f.ids.orgA) => {
      const slug = `rls-p6-${key}-${f.ids.orgA.slice(0, 6)}`;
      const { data, error } = await s.from("events").insert({ ...base, organisation_id: org, name: `P6 ${key}`, slug, ...patch }).select("id").single();
      if (error) throw new Error(error.message);
      return { slug, id: data.id as string };
    };
    orgC = (await s.from("organisations").insert({ name: `RLS archived ${f.ids.orgA.slice(0, 6)}`, slug: `rls-p6-org-${f.ids.orgA.slice(0, 6)}`, archived_at: new Date().toISOString() }).select("id").single()).data!.id;
    const open = { slug: (await s.from("events").select("slug").eq("id", f.ids.evA1).single()).data!.slug as string, id: f.ids.evA1 };
    const draft = { slug: (await s.from("events").select("slug").eq("id", f.ids.evA2).single()).data!.slug as string, id: f.ids.evA2 };
    const sim = await mk("sim", { is_simulation: true });
    const archived = await mk("archived", { archived_at: new Date().toISOString() });
    const orgArchived = await mk("orgarch", {}, orgC);
    slugs = { open: open.slug, draft: draft.slug, sim: sim.slug, archived: archived.slug, orgArchived: orgArchived.slug };
    ids = { open: open.id, draft: draft.id, sim: sim.id, archived: archived.id, orgArchived: orgArchived.id };
    // every closed event has a locked division with a published heat, a plan and a wind call, so a leak would show
    for (const k of ["sim", "archived", "orgArchived"] as const) {
      const div = (await s.from("divisions").insert({ event_id: ids[k], name: `Closed ${k}`, sort_order: 1, draw_locked_at: new Date().toISOString() }).select("id").single()).data!.id;
      const round = (await s.from("rounds").insert({ division_id: div, sort_order: 1, name: "Round 1", short_name: "R1", spec: {} }).select("id").single()).data!.id;
      await s.from("heats").insert({ round_id: round, division_id: div, event_id: ids[k], number: 1, duration_sec: 600, status: "published", publish_hold: false });
      await s.from("wind_calls").insert({ event_id: ids[k], status: "red", message: "secret" });
    }
    ladder = await mkLadder(f, { name: "Ladder" });
    unlocked = await mkLadder(f, { name: "Unlocked", locked: false });
  });
  afterAll(async () => {
    if (orgC) await f.s.rpc("purge_organisation", { p_org: orgC });
    await f?.cleanup();
  });

  // ---------------------------------------------------------------- every function stays closed
  it("every public function says nothing about a draft, simulation or archived event, an archived organisation or an unknown address", async () => {
    for (const k of closed) {
      expect((await rpc("get_public_site", { p_slug: slugs[k] })).found).toBe(false);
      for (const fn of ["get_public_timetable", "get_public_results", "get_public_draw", "get_public_rules"]) {
        expect((await rpc(fn, { p_event: ids[k] })).allowed, `${fn} on ${k}`).toBe(false);
      }
    }
    expect((await rpc("get_public_site", { p_slug: "no-such-event" })).found).toBe(false);
    expect((await rpc("get_public_results", { p_event: "00000000-0000-0000-0000-000000000000" })).allowed).toBe(false);
    // the same for a signed-in stranger (another organisation's organiser): they are a visitor here
    for (const c of [f.clients.orgB, f.clients.bJudge]) {
      expect((await rpc("get_public_site", { p_slug: slugs.sim }, c)).found).toBe(false);
      expect((await rpc("get_public_results", { p_event: ids.sim }, c)).allowed).toBe(false);
    }
  });

  it("the site payload names the event, the organisation, the branding and the settings a visitor needs, and nothing that opens a seat", async () => {
    await f.s.from("events").update({ branding: { logoUrl: "https://example.com/logo.png", sponsors: [{ name: "WOO" }] }, settings: { publicLiveScores: "live", readyCallMin: 12, livePollSec: 5, screenRotateSec: 15, externalLeaderboards: [{ title: "Highest Jump", url: "https://woo.example.com/hj", embed: false }], pinSecret: "x" } }).eq("id", ids.open);
    const site = await rpc("get_public_site", { p_slug: slugs.open });
    expect(site.found).toBe(true);
    expect(site.event).toMatchObject({ id: ids.open, timezone: "Africa/Cairo", status: "published" });
    expect(site.organisation.slug).toMatch(/^rls-a-/);
    expect(site.branding.sponsors[0].name).toBe("WOO");
    expect(site.settings).toMatchObject({ readyCallMin: 12, livePollSec: 5, screenRotateSec: 15 });
    expect(site.settings.externalLeaderboards[0].title).toBe("Highest Jump");
    expect(site.settings.pinSecret).toBeUndefined(); // a whitelist, not the whole settings object
    const text = JSON.stringify(site).toLowerCase();
    for (const bad of ["pin_hash", "qr_hash", "email", "phone", "auth_user"]) expect(text).not.toContain(bad);
    expect(site.divisions.map((d: J) => d.name)).toContain("Ladder");
  });

  // ---------------------------------------------------------------- the wind call
  it("the wind call: the head judge or an organiser sets it, nobody else; the banner follows the event's switch; every call is audited", async () => {
    expect((await rpc("get_public_site", { p_slug: slugs.open })).wind).toBeNull();
    expect(codeOf(await f.clients.j1.rpc("set_wind_call", { p_event: ids.open, p_status: "red", p_message: "no" }))).toContain("NOT_ALLOWED");
    expect(codeOf(await anon().rpc("set_wind_call", { p_event: ids.open, p_status: "red", p_message: "no" }))).not.toBe("");
    expect(codeOf(await f.clients.orgB.rpc("set_wind_call", { p_event: ids.open, p_status: "red", p_message: "no" }))).toContain("NOT_ALLOWED");
    expect(codeOf(await f.clients.head.rpc("set_wind_call", { p_event: ids.open, p_status: "purple", p_message: "" }))).toContain("BAD_WIND_STATUS");
    expect(codeOf(await f.clients.head.rpc("set_wind_call", { p_event: ids.open, p_status: "amber", p_message: "x".repeat(300) }))).toContain("MESSAGE_TOO_LONG");
    expect(codeOf(await f.clients.head.rpc("set_wind_call", { p_event: ids.open, p_status: "amber", p_message: "Light wind, heats on hold" }))).toBe("");
    let wind = (await rpc("get_public_site", { p_slug: slugs.open })).wind;
    expect(wind).toMatchObject({ status: "amber", message: "Light wind, heats on hold" });
    expect(codeOf(await f.clients.orgA.rpc("set_wind_call", { p_event: ids.open, p_status: "green", p_message: "Go" }))).toBe("");
    wind = (await rpc("get_public_site", { p_slug: slugs.open })).wind;
    expect(wind).toMatchObject({ status: "green", message: "Go" });
    // switched off on the event: the call is stored but the banner is not offered
    const settings = (await f.s.from("events").select("settings").eq("id", ids.open).single()).data!.settings as object;
    await f.s.from("events").update({ settings: { ...settings, windCallBanner: false } }).eq("id", ids.open);
    expect((await rpc("get_public_site", { p_slug: slugs.open })).wind).toBeNull();
    await f.s.from("events").update({ settings }).eq("id", ids.open);
    expect(codeOf(await f.clients.head.rpc("set_wind_call", { p_event: ids.open, p_status: "clear", p_message: null }))).toBe("");
    expect((await rpc("get_public_site", { p_slug: slugs.open })).wind).toBeNull();
    const audit = (await f.s.from("audit_log").select("action").eq("event_id", ids.open).eq("action", "wind_call_set")).data ?? [];
    expect(audit.length).toBe(3);
  });

  // ---------------------------------------------------------------- the timetable
  it("the timetable lists active plans and the heats of drawn divisions, never a draft draw, and carries no stored draw", async () => {
    await f.s.from("schedule_plans").insert([
      { event_id: ids.open, day: "2026-10-10", name: "Live plan", active: true, items: [], anchors: {} },
      { event_id: ids.open, day: "2026-10-10", name: "Spare plan", active: false, items: [], anchors: {} },
    ]);
    const t = await rpc("get_public_timetable", { p_event: ids.open });
    expect(t.allowed).toBe(true);
    expect(t.plans.map((p: J) => p.name)).toEqual(["Live plan"]);
    const divisionNames = t.divisions.map((d: J) => d.name);
    expect(divisionNames).toContain("Ladder");
    expect(divisionNames).not.toContain("Unlocked"); // the draw is still a draft
    const heatIds = t.heats.map((h: J) => h.id);
    expect(heatIds).toContain(ladder.heats["R1-H1"]);
    for (const id of Object.values(unlocked.heats)) expect(heatIds).not.toContain(id);
    const h1 = t.heats.find((h: J) => h.id === ladder.heats["R1-H1"]);
    expect(h1).toMatchObject({ round_last: false, break_after_heat_min: 2 });
    const final = t.heats.find((h: J) => h.id === ladder.heats["F-H1"]);
    expect(final.round_last).toBe(true);
    const text = JSON.stringify(t);
    expect(text).not.toContain("entrants");
    expect(text).not.toContain("seedOrder");
    expect(typeof t.server_now).toBe("string");
  });

  // ---------------------------------------------------------------- results, holds, masks
  it("nothing before publish: an unlocked draw is not listed and a heat that has not been published carries no result", async () => {
    const res = await results();
    expect(res.allowed).toBe(true);
    const names = res.divisions.map((d: J) => d.name);
    expect(names).toContain("Ladder");
    expect(names).not.toContain("Unlocked");
    const h = heatOf(res, ladder.heats["R1-H1"]);
    expect(h.results).toEqual([]);
    expect(h.slots.length).toBe(3);
  });

  it("a held heat shows nothing: no result, no winner in the next seat, no winner in the stored draw; releasing it shows all three", async () => {
    const { winner } = await publishLadderHeat(f, ladder, "R1-H1", { hold: true });
    let res = await results();
    const held = heatOf(res, ladder.heats["R1-H1"]);
    expect(held).toMatchObject({ held: true, results: [] });
    const final = heatOf(res, ladder.heats["F-H1"]);
    expect(final.slots.every((s: J) => s.entry_id !== winner)).toBe(true);
    expect(final.slots[0].entry_id).toBeNull(); // the seat is a placeholder ("1st H1") for the public
    expect(final.slots[0].source).toMatchObject({ round: "R1", heat: 1, place: 1 });
    let draw = (await rpc("get_public_draw", { p_event: ids.open })).divisions.find((d: J) => d.id === ladder.div).draw;
    expect(draw.results).toEqual({});
    const drawFinal = draw.rounds[1].heats[0];
    expect(drawFinal.slots[0].entrantId).toBeUndefined();
    // the people who run the event still see the winner in the seat
    expect((await f.s.from("heat_slots").select("entry_id").eq("heat_id", ladder.heats["F-H1"]).eq("position", 1).single()).data!.entry_id).toBe(winner);

    await f.s.from("heats").update({ publish_hold: false }).eq("id", ladder.heats["R1-H1"]);
    res = await results();
    expect(heatOf(res, ladder.heats["R1-H1"]).results.map((r: J) => r.place)).toEqual([1, 2, 3]);
    expect(heatOf(res, ladder.heats["F-H1"]).slots[0].entry_id).toBe(winner);
    draw = (await rpc("get_public_draw", { p_event: ids.open })).divisions.find((d: J) => d.id === ladder.div).draw;
    expect(Object.keys(draw.results)).toEqual(["R1-H1"]);
    expect(draw.rounds[1].heats[0].slots[0].entrantId).toBe(winner);
  });

  it("a visitor never gets judge-level marks, flags or percentages from a result (panel scores only); a division can switch percentages on", async () => {
    const res = await results();
    const row = heatOf(res, ladder.heats["R1-H1"]).results[0];
    const text = JSON.stringify(row);
    for (const bad of ["judgeScores", "judgeId", "missedBy", "missing", "outlier", "J1", "J2", "outliers"]) expect(text).not.toContain(bad);
    expect(row.breakdown.allAttempts[0]).toMatchObject({ seq: 1, trickName: "Backroll", panelScore: 15, counted: true });
    expect(row.breakdown.allAttempts[1]).toMatchObject({ status: "crashed", counted: false, score: null });
    expect(row.breakdown.impression.score).toBe(5);
    expect(row.percent).toBeNull();
    await f.s.from("divisions").update({ live_settings: { showPercentOfMax: true } }).eq("id", ladder.div);
    expect(heatOf(await results(), ladder.heats["R1-H1"]).results[0].percent).toBe(50);
    await f.s.from("divisions").update({ live_settings: {} }).eq("id", ladder.div);
  });

  it("the Final shows the seat's rider only once the heat that feeds it is released; a seat from a heat that was never published stays a placeholder", async () => {
    // R1-H2 is unpublished: its place-1 seat in the Final stays empty and shows no rider
    const res = await results();
    const final = heatOf(res, ladder.heats["F-H1"]);
    expect(final.slots[1].entry_id).toBeNull();
    // a seat filled behind the scenes from a heat that is only "under review" is masked too
    await f.s.from("heat_slots").update({ entry_id: ladder.entries[3] }).eq("heat_id", ladder.heats["F-H1"]).eq("position", 2);
    expect(heatOf(await results(), ladder.heats["F-H1"]).slots[1].entry_id).toBeNull();
    await f.s.from("heat_slots").update({ entry_id: null }).eq("heat_id", ladder.heats["F-H1"]).eq("position", 2);
  });

  it("the highest jump counts only landed attempts of released heats", async () => {
    const heat = ladder.heats["R1-H1"];
    const rider = ladder.entries[0];
    await f.s.from("trick_attempts").insert([
      { heat_id: heat, entry_id: rider, seq: 1, status: "landed", trick_name: "Backroll", client_key: crypto.randomUUID(), height_m: 14.2 },
      { heat_id: heat, entry_id: rider, seq: 2, status: "crashed", trick_name: "Megaloop", client_key: crypto.randomUUID(), height_m: 19.9 },
      { heat_id: ladder.heats["R1-H2"], entry_id: ladder.entries[3], seq: 1, status: "landed", trick_name: "Backroll", client_key: crypto.randomUUID(), height_m: 21.0 },
    ]);
    const div = (await results()).divisions.find((d: J) => d.id === ladder.div);
    expect(div.highest_jump).toMatchObject({ height_m: 14.2, entry_id: rider });
    // held again: nothing about heights either
    await f.s.from("heats").update({ publish_hold: true }).eq("id", heat);
    expect((await results()).divisions.find((d: J) => d.id === ladder.div).highest_jump).toBeNull();
    await f.s.from("heats").update({ publish_hold: false }).eq("id", heat);
  });

  it("a draft draw is not offered: the stored draw of an unlocked division is null for a visitor", async () => {
    const d = (await rpc("get_public_draw", { p_event: ids.open })).divisions;
    expect(d.find((x: J) => x.id === unlocked.div)?.draw ?? null).toBeNull();
    expect(d.find((x: J) => x.id === ladder.div).draw.template).toBeTruthy();
  });

  // ---------------------------------------------------------------- the doors the functions replace
  it("a visitor cannot read seats, the stored draw or the event's secrets from the tables directly", async () => {
    expect(codeOf(await anon().from("heat_slots").select("position, entry_id").eq("heat_id", ladder.heats["F-H1"]))).not.toBe("");
    expect(codeOf(await anon().from("divisions").select("draw").eq("id", ladder.div))).not.toBe("");
    expect(((await f.clients.orgB.from("divisions").select("name, draw").eq("id", ladder.div)).data ?? []).length).toBe(0);
    expect(codeOf(await anon().from("events").select("settings, pin_hash"))).not.toBe("");
    expect(codeOf(await anon().from("heat_results").select("breakdown").eq("heat_id", ladder.heats["R1-H1"]))).toBe("");
  });

  it("the rules function hands over each division's scoring model and format of a public event, and only that", async () => {
    const r = await rpc("get_public_rules", { p_event: ids.open });
    expect(r.allowed).toBe(true);
    const pro = r.divisions.find((d: J) => d.name === "Pro");
    expect(pro.scoring_model).toBeTruthy();
    expect(pro.scoring_overrides).toEqual({ heat: { maxAttemptsPerRider: 3 } });
    const text = JSON.stringify(r);
    for (const bad of ["email", "phone", "pin_hash", "organisation_id"]) expect(text).not.toContain(bad);
    expect(r.divisions.map((d: J) => d.name)).not.toContain("Draft division");
  });
});
