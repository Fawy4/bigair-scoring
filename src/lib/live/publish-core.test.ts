import { describe, expect, it } from "vitest";
import legacy from "../../../presets/scoring/legacy-kol-best3-variety.json";
import { publishHeatCore, type PublishInputs } from "./publish-core";

// Publish reads in ONE database call and writes in ONE (Speed 1): nineteen requests, most of them waiting for the one before, became two. The rules did not change:
// the same engine scores the heat, the same blockers are worded, the same transaction writes it. These tests count the calls and check what is sent to the write.

const J = ["j1", "j2", "j3"];
const heatRow = (status: string) => ({ id: "h1", event_id: "ev", division_id: "d1", round_id: "r1", status, draw_uid: null, number: 1, name: null });
const slot = (entry: string, position: number, colour: string) => ({ id: `s-${entry}`, heat_id: "h1", position, entry_id: entry, vest_colour: colour, modifier: null, flagged_out: false, updated_at: "2026-10-04T10:00:00Z" });
const attempt = (entry: string, id: string) => ({ id, heat_id: "h1", entry_id: entry, seq: 1, client_key: id, direction: null, category_key: null, trick_name: "Backroll", trick_parts: null, status: "landed", created_by_seat: null, created_at: "2026-10-04T10:01:00Z", deleted_at: null, possible_duplicate_of: null, input_method: "buttons", raw_text: null, updated_at: "2026-10-04T10:01:00Z" });
const score = (attemptId: string, seat: string, value: number) => ({ id: `${attemptId}-${seat}`, attempt_id: attemptId, heat_id: "h1", judge_seat_id: seat, score: value, missed: false, criteria: null, client_rev: 1, version: 1, edit_reason: null, updated_at: "2026-10-04T10:02:00Z" });
const impression = (entry: string, seat: string, value: number) => ({ id: `i-${entry}-${seat}`, heat_id: "h1", entry_id: entry, judge_seat_id: seat, value, missed: false, client_rev: 1, updated_at: "2026-10-04T10:03:00Z" });

function inputs(over: Partial<PublishInputs> = {}): PublishInputs {
  return {
    heat: heatRow("ended"),
    latest: 0,
    event_settings: {},
    division: { id: "d1", scoring_model_id: "m1", scoring_overrides: {}, panel_id: "p1", live_settings: {}, draw: null },
    model: legacy,
    slots: [slot("e1", 1, "red"), slot("e2", 2, "blue")],
    attempts: [attempt("e1", "a1"), attempt("e2", "a2")],
    scores: [...J.map((s) => score("a1", s, 8)), ...J.map((s) => score("a2", s, 6))],
    impressions: [...J.map((s) => impression("e1", s, 7)), ...J.map((s) => impression("e2", s, 5))],
    penalties: [],
    decisions: [],
    sheets: J.map((s) => ({ judge_seat_id: s, submitted_at: "2026-10-04T10:04:00Z", reopened_at: null })),
    division_heats: [{ id: "h1", draw_uid: null, status: "ended", started_at: "2026-10-04T09:50:00Z" }],
    entries: [
      { id: "e1", first_name: "Sam", last_name: "Rivera" },
      { id: "e2", first_name: "Noor", last_name: "Haddad" },
    ],
    members: J.map((s, i) => ({ judge_seat_id: s, seat_no: i + 1 })),
    seats: J.map((s, i) => ({ id: s, name: `Judge ${i + 1}`, active: true, status: "active" })),
    ...over,
  };
}

/** A pair of fake database connections that record every call. The user connection answers publish_heat_inputs and knows who is signed in without asking anybody. */
function fake(answer: PublishInputs | { error: string }) {
  const calls: string[] = [];
  let committed: Record<string, unknown> | null = null;
  const user = {
    rpc: async (fn: string) => {
      calls.push(`user.rpc ${fn}`);
      return "error" in answer ? { data: null, error: { message: answer.error } } : { data: answer, error: null };
    },
    from: () => {
      calls.push("user.from");
      throw new Error("Publish must not read tables one by one");
    },
    auth: {
      getClaims: async () => ({ data: { claims: { sub: "user-1", email: "head@example.com" } }, error: null }),
      getUser: async () => {
        calls.push("user.auth.getUser");
        return { data: { user: { id: "user-1" } }, error: null };
      },
    },
  };
  const service = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push(`service.rpc ${fn}`);
      committed = args;
      return { data: { version: 1, already: false }, error: null };
    },
    from: () => {
      calls.push("service.from");
      throw new Error("Publish must not read tables one by one");
    },
  };
  return { db: { user, service } as never, calls, committed: () => committed };
}

describe("Publish makes two database calls: one to read, one to write", () => {
  it("a complete heat: reads once, writes once, nothing else; the places come from the engine", async () => {
    const f = fake(inputs());
    const r = await publishHeatCore(f.db, "h1");
    expect(r).toEqual({ ok: true, version: 1, already: false });
    expect(f.calls).toEqual(["user.rpc publish_heat_inputs", "service.rpc publish_heat_commit"]);
    const sent = f.committed() as { p_heat: string; p_expected_version: number; p_results: Array<{ entry_id: string; place: number }>; p_actor: string; p_override_reason: unknown };
    expect(sent.p_heat).toBe("h1");
    expect(sent.p_expected_version).toBe(1);
    expect(sent.p_actor).toBe("user-1");
    expect(sent.p_override_reason).toBeNull();
    expect(sent.p_results.map((x) => [x.entry_id, x.place])).toEqual([["e1", 1], ["e2", 2]]);
  });

  it("the next version is the latest published one plus one", async () => {
    const f = fake(inputs({ latest: 2, heat: heatRow("under_review") }));
    await publishHeatCore(f.db, "h1");
    expect((f.committed() as { p_expected_version: number }).p_expected_version).toBe(3);
  });

  it("a heat that is already published answers at once from the one read, and writes nothing", async () => {
    const f = fake(inputs({ latest: 2, heat: heatRow("published") }));
    expect(await publishHeatCore(f.db, "h1")).toEqual({ ok: true, version: 2, already: true });
    expect(f.calls).toEqual(["user.rpc publish_heat_inputs"]);
  });

  it("a heat that has not ended is refused with the same code as before, and nothing is written", async () => {
    const f = fake(inputs({ heat: heatRow("running") }));
    const r = await publishHeatCore(f.db, "h1");
    expect(r).toMatchObject({ ok: false, code: "HEAT_NOT_ENDED" });
    expect(f.calls).toEqual(["user.rpc publish_heat_inputs"]);
  });

  it("somebody who may not publish is refused by the database in the same call; the server never asks twice", async () => {
    const f = fake({ error: "NOT_ALLOWED" });
    const r = await publishHeatCore(f.db, "h1");
    expect(r).toMatchObject({ ok: false, code: "NOT_ALLOWED" });
    expect(f.calls).toEqual(["user.rpc publish_heat_inputs"]);
  });

  it("a missing judge sheet blocks Publish in words, and a reason lets it through; the reason is what is written", async () => {
    const missing = inputs({ sheets: J.slice(0, 2).map((s) => ({ judge_seat_id: s, submitted_at: "2026-10-04T10:04:00Z", reopened_at: null })) });
    const blocked = fake(missing);
    const r = await publishHeatCore(blocked.db, "h1");
    expect(r).toMatchObject({ ok: false, code: "PUBLISH_BLOCKED", canOverride: true });
    expect(blocked.calls).toEqual(["user.rpc publish_heat_inputs"]);
    expect(JSON.stringify((r as { blockers?: unknown }).blockers)).toContain("Judge 3");

    const forced = fake(missing);
    const ok = await publishHeatCore(forced.db, "h1", { overrideReason: "paper sheet" });
    expect(ok).toMatchObject({ ok: true });
    expect((forced.committed() as { p_override_reason: string }).p_override_reason).toBe("paper sheet");
  });

  it("Polish 3: publishing past a missing sheet needs no typed reason; an empty box is written as 'no reason given'", async () => {
    const missing = inputs({ sheets: J.slice(0, 2).map((s) => ({ judge_seat_id: s, submitted_at: "2026-10-04T10:04:00Z", reopened_at: null })) });
    for (const typed of ["", "   ", undefined]) {
      const forced = fake(missing);
      expect(await publishHeatCore(forced.db, "h1", { override: true, overrideReason: typed })).toMatchObject({ ok: true });
      expect((forced.committed() as { p_override_reason: string }).p_override_reason).toBe("no reason given");
    }
    // a heat with nothing blocking never carries an override reason, even when the flag is on
    const clean = fake(inputs());
    await publishHeatCore(clean.db, "h1", { override: true });
    expect((clean.committed() as { p_override_reason: unknown }).p_override_reason).toBeNull();
    // without the flag the old rule stands: blockers come back
    expect(await publishHeatCore(fake(missing).db, "h1")).toMatchObject({ ok: false, code: "PUBLISH_BLOCKED" });
  });
});
