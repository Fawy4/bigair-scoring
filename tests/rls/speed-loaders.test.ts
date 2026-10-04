import { afterAll, beforeAll, describe, expect, it } from "vitest";
import kota from "../../presets/scoring/kota-best3-impression.json";
import { loadDivisionContext } from "@/lib/draw/server";
import { builtInSchemes } from "@/lib/schemas/identification";
import { identificationSchemesFrom, loadIdentificationSchemes, SCHEME_ROWS } from "@/lib/org/presets";
import { loadPanelOverview } from "@/lib/org/panel-overview";
import { loadSetupCounts } from "@/lib/org/setup-counts";
import { minJudgesFor } from "@/lib/officials/panels";
import { publishHeatCore } from "@/lib/live/publish-core";
import { signedInUser } from "@/lib/supabase/claims";
import { buildFixture, ENV_OK, type Fixture } from "./helpers";
import { ago, key, mkDivision, mkHeat } from "./live-helpers";

// Speed 1 — the organiser's pages and Publish read their data in fewer, wider requests. Each test reads the same thing the old way (the requests the pages used to make,
// one after the other) and the new way, as the organiser, and checks the answers are the same; and that somebody who may not see an event gets nothing from the new
// reads either (the PIN check runs with the server's key, so it is checked here that it adds nothing for a stranger). Against the hosted development project, throwaway
// organisations only.
describe.skipIf(!ENV_OK)("Speed 1 — the new reads give the same answers, to the same people (hosted development project)", () => {
  let f: Fixture;

  beforeAll(async () => {
    f = await buildFixture();
    // a saved Rider label for each organisation, and a second version of A's
    const scheme = (name: string) => ({ ...builtInSchemes()[0], name });
    await f.s.from("presets").insert([
      { organisation_id: f.ids.orgA, kind: "identification", key: "a-label", name: "A label", version: 1, json: scheme("A v1") as never, content_hash: key() },
      { organisation_id: f.ids.orgA, kind: "identification", key: "a-label", name: "A label", version: 2, json: scheme("A v2") as never, content_hash: key() },
      { organisation_id: f.ids.orgB, kind: "identification", key: "b-label", name: "B label", version: 1, json: scheme("B v1") as never, content_hash: key() },
    ]);
  }, 300_000);
  afterAll(async () => {
    await f?.cleanup();
  });

  it("who is signed in is read from the login token, without asking the auth server: the organiser's own id, nobody for a client with no login", async () => {
    expect((await signedInUser(f.clients.orgA))?.id).toBe(f.userIds.orgA);
    expect((await signedInUser(f.clients.anon))).toBeNull();
  });

  it("the panel overview (one request) is what the two-step reading gave, and a stranger sees no divisions", async () => {
    // the old reading: the divisions, then their scoring rules and their panels' members
    const { data: divisions } = await f.clients.orgA.from("divisions").select("id, name, panel_id, scoring_model_id, scoring_overrides").eq("event_id", f.ids.evA1).order("sort_order").order("created_at");
    const { data: models } = await f.clients.orgA.from("scoring_models").select("id, json").in("id", [...new Set((divisions ?? []).map((d) => d.scoring_model_id).filter((x): x is string => Boolean(x)))]);
    const { data: members } = await f.clients.orgA.from("panel_members").select("panel_id, judge_seat_id, seat_no").in("panel_id", [...new Set((divisions ?? []).map((d) => d.panel_id).filter((x): x is string => Boolean(x)))]).order("seat_no");
    const json = new Map((models ?? []).map((m) => [m.id, m.json]));
    const old = (divisions ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      panelId: d.panel_id,
      hasScoringModel: Boolean(d.scoring_model_id),
      minJudges: minJudgesFor(d.scoring_model_id ? json.get(d.scoring_model_id) : null, d.scoring_overrides),
      seatIds: (members ?? []).filter((m) => m.panel_id === d.panel_id).map((m) => m.judge_seat_id),
    }));
    expect(old.length).toBeGreaterThan(0);
    expect(old[0].seatIds).toHaveLength(2);
    expect(await loadPanelOverview(f.clients.orgA, f.ids.evA1)).toEqual(old);
    expect(await loadPanelOverview(f.clients.orgB, f.ids.evA1)).toEqual([]);
  });

  it("the set-up counts: one round gives the right numbers for the organiser, and a stranger gets nothing, not even from the PIN check that uses the server's key", async () => {
    // two active seats get a PIN on file, the rest do not
    await f.s.from("judge_seats").update({ pin_enc: "x" }).in("id", [f.ids.seat_j1, f.ids.seat_j2]);
    const mine = await loadSetupCounts(f.clients.orgA, f.ids.evA1);
    expect(mine.ridersByDivision[f.ids.divA1]).toBe(4);
    expect(mine.judgeSeats).toBeGreaterThanOrEqual(3);
    expect(mine.panels?.find((p) => p.id === f.ids.divA1)?.assigned).toBe(2);
    const { data: seats } = await f.clients.orgA.from("judge_seats").select("id, status").eq("event_id", f.ids.evA1);
    const active = (seats ?? []).filter((s) => s.status === "active").length;
    expect(mine.seatCount).toBe((seats ?? []).length);
    expect(mine.seatsWithoutPin).toBe(active - 2);
    expect(mine.drawn).toEqual([f.ids.divA1]);

    const stranger = await loadSetupCounts(f.clients.orgB, f.ids.evA1);
    expect(stranger.seatsWithoutPin).toBe(0);
    expect(stranger.seatCount).toBe(0);
    expect(stranger.judgeSeats).toBe(0);
    expect(stranger.panels).toEqual([]);
    // the heats of a published event are public: a stranger sees exactly what a plain read gives, no more
    const { data: publicHeats } = await f.clients.orgB.from("heats").select("division_id").eq("event_id", f.ids.evA1);
    expect(stranger.drawn).toEqual([...new Set((publicHeats ?? []).map((h) => h.division_id))]);
    expect(stranger.ridersByDivision).toEqual({});
  });

  it("the organisation's saved Rider labels come with the event in one request: the same list as before, only this organisation's, newest version of each", async () => {
    const old = await loadIdentificationSchemes(f.clients.orgA, f.ids.orgA);
    const { data: ev } = await f.clients.orgA.from("events").select(`id, organisations(${SCHEME_ROWS})`).eq("id", f.ids.evA1).eq("organisations.presets.kind", "identification").maybeSingle();
    const fresh = identificationSchemesFrom(((ev?.organisations as unknown as { presets?: never[] } | null)?.presets ?? []) as never[]);
    expect(fresh).toEqual(old);
    const own = fresh.filter((s) => s.id.startsWith("org:"));
    expect(own.map((s) => s.id)).toEqual(["org:a-label"]);
    expect(own[0].name).toBe("A v2");
    // another organisation's published event is public, but its organisation's saved Rider labels do not come with it
    const { data: other } = await f.clients.orgA.from("events").select(`id, organisations(${SCHEME_ROWS})`).eq("id", f.ids.evB1).maybeSingle();
    expect(other?.organisations ?? null).toBeNull();
  });

  it("the organisation's riders come with the event in one request, in the same order as the separate list", async () => {
    const { data: old } = await f.clients.orgA.from("riders").select("id, first_name, last_name, email, nationality").eq("organisation_id", f.ids.orgA).order("last_name").order("first_name");
    const { data: ev } = await f.clients.orgA
      .from("events")
      .select("id, organisations(riders(id, first_name, last_name, email, nationality))")
      .eq("id", f.ids.evA1)
      .order("last_name", { referencedTable: "organisations.riders" })
      .order("first_name", { referencedTable: "organisations.riders" })
      .maybeSingle();
    expect((ev?.organisations as unknown as { riders?: unknown } | null)?.riders).toEqual(old);
    expect((old ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("the draw's division context (the division, its format, riders and heats read together) is what the three-step reading gave", async () => {
    const { data: fmt } = await f.s.from("format_templates").select("id").is("organisation_id", null).eq("key", "heats4-top2-single-elim").order("version", { ascending: false }).limit(1).single();
    const d = await mkDivision(f, { name: "Context", seats: ["j1", "j2"], locked: false });
    await mkHeat(f, d, { status: "scheduled" }, { riders: 2 });
    const set = await f.s.from("divisions").update({ format_template_id: fmt!.id, format_params: { timing: { defaultHeatMin: 12 } } as never }).eq("id", d.div);
    expect(set.error).toBeNull();
    const ctx = await loadDivisionContext(f.clients.orgA, d.div);
    const { data: entries } = await f.clients.orgA.from("entries").select("id, seed, status").eq("division_id", d.div);
    const { data: heats } = await f.clients.orgA.from("heats").select("id, number, status").eq("division_id", d.div).order("number");
    const { data: tpl } = await f.clients.orgA.from("format_templates").select("json").eq("id", fmt!.id).maybeSingle();
    expect(ctx.id).toBe(d.div);
    expect(ctx.entries.map((e) => e.id).sort()).toEqual((entries ?? []).map((e) => e.id).sort());
    expect(ctx.heatRows.map((h) => [h.id, h.number, h.status])).toEqual((heats ?? []).map((h) => [h.id, h.number, h.status]));
    expect(ctx.templateError).toBeNull();
    expect(ctx.template).not.toBeNull();
    // the format's own settings with the division's override on top, as before
    expect(ctx.template?.timing.defaultHeatMin).toBe(12);
    expect((tpl?.json as { id: string }).id).toBe(ctx.template?.id);
    expect(ctx.started).toBe(false);
    expect(ctx.locked).toBe(false);
    // somebody who may not see the division is refused the same way as before
    await expect(loadDivisionContext(f.clients.orgB, d.div)).rejects.toMatchObject({ code: "not_allowed" });
  });

  it("publish_heat_inputs: the head judge and an organiser of the event get the heat's rows in one answer; a judge, a spotter and another organisation are refused", async () => {
    const d = await mkDivision(f, { name: "Inputs", seats: ["j1", "j2"], model: kota, overrides: { heat: { maxAttemptsPerRider: 7 } } });
    const h = await mkHeat(f, d, { status: "ended", started_at: ago(900), ended_at: ago(300) }, { riders: 2 });
    const a = (await f.s.from("trick_attempts").insert({ heat_id: h, entry_id: d.entries[0], seq: 1, status: "landed", trick_name: "Backroll", client_key: key() }).select("id").single()).data!;
    await f.s.from("trick_scores").insert({ attempt_id: a.id, judge_seat_id: f.ids.seat_j1, score: 7, criteria: { height: 7, extremity: 7, technicality: 7, execution: 7 } as never, client_key: key(), client_rev: 1 });
    await f.s.from("impression_scores").insert({ heat_id: h, entry_id: d.entries[0], judge_seat_id: f.ids.seat_j1, value: 6, client_key: key(), client_rev: 1 });

    const head = await f.clients.head.rpc("publish_heat_inputs", { p_heat: h });
    const org = await f.clients.orgA.rpc("publish_heat_inputs", { p_heat: h });
    expect(head.error).toBeNull();
    expect(org.error).toBeNull();
    expect(org.data).toEqual(head.data);
    const got = head.data as unknown as { heat: { id: string; status: string }; latest: number; slots: unknown[]; attempts: unknown[]; scores: unknown[]; impressions: unknown[]; members: unknown[]; seats: Array<{ id: string }>; entries: Array<{ id: string }>; model: unknown };
    expect(got.heat).toMatchObject({ id: h, status: "ended" });
    expect(got.latest).toBe(0);
    expect(got.slots).toHaveLength(2);
    expect(got.attempts).toHaveLength(1);
    expect(got.scores).toHaveLength(1);
    expect(got.impressions).toHaveLength(1);
    expect(got.members).toHaveLength(2);
    expect(got.seats.map((s) => s.id).sort()).toEqual([f.ids.seat_j1, f.ids.seat_j2].sort());
    // only the riders of this heat, by name
    expect(got.entries.map((e) => e.id).sort()).toEqual([...d.entries.slice(0, 2)].sort());
    expect(got.model).toMatchObject({ heat: expect.anything() });
    // the reading the server used to make, row by row, finds the same rows
    const { data: slots } = await f.s.from("heat_slots").select("id").eq("heat_id", h);
    expect((got.slots as Array<{ id: string }>).map((s) => s.id).sort()).toEqual((slots ?? []).map((s) => s.id).sort());

    for (const who of ["j1", "spotter", "orgB", "anon"] as const) {
      const r = await f.clients[who].rpc("publish_heat_inputs", { p_heat: h });
      expect(r.error?.message ?? "", who).toMatch(/NOT_ALLOWED|permission denied/);
      expect(r.data, who).toBeNull();
    }
    const missing = await f.clients.head.rpc("publish_heat_inputs", { p_heat: "00000000-0000-0000-0000-000000000000" });
    expect(missing.error?.message).toContain("HEAT_NOT_FOUND");
  });

  it("Publish with the one read still writes the same result: the head judge publishes, the places and totals are stored, and pressing it again says so", async () => {
    const d = await mkDivision(f, { name: "Speed publish", seats: ["j1", "j2"], model: kota, overrides: { heat: { maxAttemptsPerRider: 7 } } });
    const h = await mkHeat(f, d, { status: "ended", started_at: ago(900), ended_at: ago(300) }, { riders: 2 });
    const crit = (v: number) => ({ height: v, extremity: v, technicality: v, execution: v });
    for (const [i, entry] of d.entries.slice(0, 2).entries()) {
      const a = (await f.s.from("trick_attempts").insert({ heat_id: h, entry_id: entry, seq: 1, status: "landed", trick_name: "Backroll", client_key: key() }).select("id").single()).data!;
      for (const seat of [f.ids.seat_j1, f.ids.seat_j2]) {
        await f.s.from("trick_scores").insert({ attempt_id: a.id, judge_seat_id: seat, score: 8 - i, criteria: crit(8 - i) as never, client_key: key(), client_rev: 1 });
        await f.s.from("impression_scores").insert({ heat_id: h, entry_id: entry, judge_seat_id: seat, value: 6, client_key: key(), client_rev: 1 });
      }
    }
    for (const seat of [f.ids.seat_j1, f.ids.seat_j2]) await f.s.from("judge_sheets").upsert({ event_id: f.ids.evA1, heat_id: h, judge_seat_id: seat, submitted_at: new Date().toISOString() }, { onConflict: "heat_id,judge_seat_id" });
    const first = await publishHeatCore({ user: f.clients.head, service: f.s }, h);
    expect(first).toMatchObject({ ok: true, version: 1, already: false });
    const rows = (await f.s.from("heat_results").select("entry_id, place, total").eq("heat_id", h).order("place")).data ?? [];
    expect(rows.map((r) => r.place)).toEqual([1, 2]);
    expect(rows[0].entry_id).toBe(d.entries[0]);
    expect(await publishHeatCore({ user: f.clients.head, service: f.s }, h)).toEqual({ ok: true, version: 1, already: true });
    // a judge may not publish, and nothing is written for the refusal
    const h2 = await mkHeat(f, d, { status: "ended", started_at: ago(900), ended_at: ago(300) }, { riders: 2 });
    const refused = await publishHeatCore({ user: f.clients.j1, service: f.s }, h2);
    expect(refused).toMatchObject({ ok: false, code: "NOT_ALLOWED" });
    expect((await f.s.from("heat_results").select("id").eq("heat_id", h2)).data).toHaveLength(0);
  });
});
