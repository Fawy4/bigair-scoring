// Audit 1b, part 3b — the flags and the start sequence, the pure half (docs/AUDIT.md, A1b-n). The database half is tests/rls/audit-1b-flags.test.ts.
// The Gouna settings: flags on, 1:00 pre-start, 1:00 last minute, heats of 10 minutes.
import { describe, expect, it } from "vitest";
import { DEFAULT_FLAGS } from "@/lib/schemas/flags";
import { clockOffset, remainingMs } from "./timer";
import { flagState, hornsFor, overlayArmed, pickFlagHeat, type FlagHeat, type FlagState, type FlagRowLike } from "./flags";
import { livesFor } from "./run-order";

const T0 = Date.parse("2026-10-08T07:00:00Z"); // 10:00 in Cairo
const at = (sec: number) => T0 + sec * 1000;
const iso = (sec: number) => new Date(at(sec)).toISOString();
const S = DEFAULT_FLAGS;

/** What the database row says at server second `t` for a sequence armed at 0 with a 60 s pre-start and a 600 s heat, with an optional pause [p0, p1). */
function rowAt(t: number, o: { pause?: [number, number]; materialiseLateBy?: number } = {}): FlagHeat {
  const armed: FlagHeat = { status: "scheduled", durationSec: 600, startedAt: null, pausedAt: null, pausedTotalSec: 0, armedAt: iso(0), prestartSec: 60 };
  // until somebody calls start_armed_if_due the row stays "scheduled + armed" even after 0:00 (the console phone may be dead)
  if (t < 60 + (o.materialiseLateBy ?? 0)) return armed;
  const p = o.pause;
  if (p && t >= p[0] && t < p[1]) return { ...armed, armedAt: null, prestartSec: null, status: "paused", startedAt: iso(60), pausedAt: iso(p[0]) };
  const pausedTotal = p && t >= p[1] ? Math.ceil(p[1] - p[0]) : 0;
  const end = 660 + pausedTotal;
  if (t >= end) return { ...armed, armedAt: null, prestartSec: null, status: "ended", startedAt: iso(60), pausedTotalSec: pausedTotal };
  return { ...armed, armedAt: null, prestartSec: null, status: "running", startedAt: iso(60), pausedTotalSec: pausedTotal };
}
const kindAt = (t: number, o?: Parameters<typeof rowAt>[1]) => flagState({ settings: S, heat: rowAt(t, o), nowMs: at(t), anyHeatStarted: true })!;

describe("A1b 3b — the server-derived state at every moment", () => {
  it("every quarter second from −5 s to the end: Stopped → Before start (60 s) → Running → Last minute (60 s) → Stopped/Finished, each exactly once and in that order", () => {
    const seen: string[] = [];
    for (let q = -20; q <= 700 * 4; q++) {
      const t = q / 4;
      const heat: FlagHeat | null = t < 0 ? { status: "scheduled", durationSec: 600, startedAt: null, pausedAt: null, pausedTotalSec: 0, armedAt: null, prestartSec: null } : rowAt(t);
      const k = flagState({ settings: S, heat, nowMs: at(t), anyHeatStarted: true })!;
      const tag = k.kind === "stopped" ? `stopped:${k.why}` : k.kind;
      if (seen.at(-1) !== tag) seen.push(tag);
    }
    expect(seen).toEqual(["stopped:between", "before_start", "running", "last_minute", "stopped:finished"]);
    expect(kindAt(59.75).kind).toBe("before_start");
    expect(kindAt(60).kind).toBe("running");
    expect(kindAt(599.75).kind).toBe("running");
    expect(kindAt(600.25).kind).toBe("last_minute");
    expect(kindAt(660).kind).toBe("stopped");
  });

  it("a screen that reloads at any of 2,000 random moments gets exactly the state of a screen that never reloaded (no device memory)", () => {
    let x = 7;
    const r = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 2000; i++) {
      const t = r() * 700;
      const fresh = flagState({ settings: S, heat: rowAt(t), nowMs: at(t), anyHeatStarted: true });
      const again = flagState({ settings: S, heat: JSON.parse(JSON.stringify(rowAt(t))), nowMs: at(t), anyHeatStarted: true });
      expect(again).toEqual(fresh);
    }
  });

  it("the console phone dies during the yellow (nobody writes the start down): every screen still turns green at 0:00 with the start at exactly the armed moment + 60 s", () => {
    for (const late of [0, 5, 120]) {
      const h = overlayArmed(rowAt(61, { materialiseLateBy: late }), at(61));
      expect(h.status).toBe("running");
      expect(Date.parse(String(h.startedAt))).toBe(at(60));
      expect(remainingMs(h, at(61))).toBe(599_000);
    }
  });
});

describe("A1b 3b — horns: once per transition on each screen, never twice after a reload", () => {
  /** A screen sampling every `step` s, reloading (forgetting its previous reading) at the given moments. Returns the horns it sounded, by second. */
  function hornsOf(step: number, reloads: number[], o?: Parameters<typeof rowAt>[1]) {
    const out: Array<[number, number]> = [];
    let prev: FlagState | null = null;
    const rl = new Set(reloads.map((t) => Math.round(t / step)));
    for (let q = 0; q * step <= 700; q++) {
      const t = q * step;
      if (rl.has(q)) prev = null;
      const next = kindAt(t, o);
      const n = hornsFor(prev, next);
      if (n) out.push([t, n]);
      prev = next;
    }
    return out;
  }
  it("a screen that never reloads: 1 at green (1:00), 1 at the last minute (10:00), 2 at the finish (11:00); nothing at the yellow", () => {
    expect(hornsOf(0.25, [])).toEqual([[60, 1], [600, 1], [660, 2]]);
  });
  it("500 screens with random reloads: each transition sounds at most once per screen, and a reload never sounds anything", () => {
    let x = 99;
    const r = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 500; i++) {
      const reloads = Array.from({ length: 5 }, () => Math.round(r() * 700 * 4) / 4);
      const horns = hornsOf(0.25, reloads);
      const total = horns.reduce((a, [, n]) => a + n, 0);
      expect(total).toBeLessThanOrEqual(4);
      // a horn never sounds on the sample right after a reload
      for (const [t] of horns) expect(reloads.includes(t)).toBe(false);
      // and never twice for the same transition
      expect(new Set(horns.map(([t]) => t)).size).toBe(horns.length);
    }
  });
  it("Abort (yellow → red, not finished) and a pause sound nothing; Resume sounds once", () => {
    const yellow = flagState({ settings: S, heat: rowAt(10), nowMs: at(10), anyHeatStarted: true });
    const aborted = flagState({ settings: S, heat: { ...rowAt(10), armedAt: null, prestartSec: null }, nowMs: at(11), anyHeatStarted: true });
    expect(hornsFor(yellow, aborted)).toBe(0);
    const pause: [number, number] = [620, 640];
    expect(hornsOf(0.25, [], { pause })).toEqual([[60, 1], [600, 1], [640, 1], [680, 2]]);
  });
});

describe("A1b 3b — a 40 s clock skew on the marshal's phone", () => {
  it("the offset from one round trip corrects a phone 40 s slow or fast: the flag, the countdown and the start moment are the same as on a correct phone", () => {
    for (const skew of [-40_000, 40_000]) {
      // a 300 ms round trip; the server answered in the middle
      const sent = at(30) + skew;
      const received = sent + 300;
      const serverNow = at(30) + 150;
      const offset = clockOffset(sent, serverNow, received);
      for (const t of [0, 30, 59.5, 60, 61, 600.5, 659, 661]) {
        const device = at(t) + skew;
        const onPhone = flagState({ settings: S, heat: rowAt(t), nowMs: device + offset, anyHeatStarted: true })!;
        const truth = flagState({ settings: S, heat: rowAt(t), nowMs: at(t), anyHeatStarted: true })!;
        expect(onPhone.kind).toBe(truth.kind);
        expect(Math.abs((onPhone.countdownMs ?? 0) - (truth.countdownMs ?? 0))).toBeLessThanOrEqual(200);
      }
    }
  });
  it("without the offset (the server clock not reached yet) a 40 s slow phone would show yellow for 40 s after the real green — the screens must use the offset", () => {
    const slow = at(70) - 40_000;
    expect(flagState({ settings: S, heat: rowAt(70), nowMs: at(70), anyHeatStarted: true })!.kind).toBe("running");
    // the row the phone holds is still the armed row if nobody wrote the start down yet
    expect(flagState({ settings: S, heat: rowAt(70, { materialiseLateBy: 100 }), nowMs: slow, anyHeatStarted: true })!.kind).toBe("before_start");
  });
});

describe("A1b 3b — pause inside the last minute and resume with 20 s left", () => {
  it("paused at 10:40 (20 s left): red Paused with 0:20 standing still; resumed 30 s later: Last minute with 0:20, finish 30 s later than planned", () => {
    const pause: [number, number] = [640, 670];
    const p = kindAt(650, { pause });
    expect(p).toMatchObject({ kind: "stopped", why: "paused" });
    expect(p.countdownMs).toBe(20_000);
    expect(kindAt(669, { pause }).countdownMs).toBe(20_000);
    const back = kindAt(670, { pause });
    expect(back.kind).toBe("last_minute");
    expect(back.countdownMs).toBe(20_000);
    expect(kindAt(689.75, { pause }).kind).toBe("last_minute");
    expect(kindAt(690, { pause })).toMatchObject({ kind: "stopped", why: "finished" });
  });
});

describe("A1b 3b — the yellow always wins the strip, and the pre-start never moves the run order", () => {
  const row = (o: Partial<FlagRowLike>): FlagRowLike => ({ id: "x", status: "scheduled", duration_sec: 600, started_at: null, paused_at: null, paused_total_sec: 0, ...o });
  it("a heat in its pre-start is picked over the heat the screen is on; after 0:00 it is no longer 'armed' and the screen's own pick stands", () => {
    const current = row({ id: "cur", status: "ended", started_at: iso(-900) });
    const next = row({ id: "nxt", armed_at: iso(0), prestart_sec: 60 });
    expect(pickFlagHeat([current, next], current, at(30))?.id).toBe("nxt");
    expect(pickFlagHeat([current, next], current, at(61))?.id).toBe("cur");
  });

  it("the run order's input is the same whether the next heat is armed (yellow up, even a frozen one) or not: livesFor reads started_at, ended_at and the lengths only", () => {
    const ctx = { divisions: [{ id: "d", name: "Pro" }], rounds: [{ id: "r", name: "Round 1" }] } as never;
    const h = { id: "h2", division_id: "d", round_id: "r", number: 2, number_suffix: null, name: null, status: "scheduled", started_at: null, ended_at: null, paused_at: null, paused_total_sec: 0, duration_sec: 600, warm_up_sec: 300 };
    const plain = livesFor(ctx, [h] as never, {});
    const armed = livesFor(ctx, [{ ...h, armed_at: iso(0), prestart_sec: 60 }] as never, {});
    const frozen = livesFor(ctx, [{ ...h, armed_at: iso(0), prestart_sec: 60, armed_paused_at: iso(20) }] as never, {});
    expect(armed).toEqual(plain);
    expect(frozen).toEqual(plain);
  });
});
