// Audit 1a (Gouna configuration) — the timetable. See docs/AUDIT.md for the findings (A1a-n) these tests point at.
// The Arrow plan: 15 heats over two days in Africa/Cairo — Thursday Round 1 (8 heats) with a lunch break, Friday R2 (4), SF (2), Final;
// warm-up 5 + heat 10, 3 min between heats, 5 min after the last heat of a round. Random pins, holds, shifts, a cancelled heat,
// a re-run, a heat with no length and a dangling row are thrown at it; the invariants below must hold for every one.
import { describe, expect, it } from "vitest";
import type { SchedulePlan } from "@/lib/schemas/schedule";
import { buildPublicTimetable } from "@/lib/public/timetable";
import type { PublicTimetable } from "@/lib/public/types";
import { driftOf, plannedTimetable, scheduleDrift } from "@/lib/schedule/drift";
import { buildHeatModel, type HeatRowDb } from "@/lib/schedule/model";
import { copyPlanToDay } from "@/lib/schedule/day-plans";
import { computeTimetable, extendBreak, localToUtc, resumeBreak, shift, startHold, utcToLocalHHMM, type HeatLive, type Timetable, type TimetableOptions } from "./index";

const TZ = "Africa/Cairo";
const THU = "2026-10-08";
const FRI = "2026-10-09";
const MIN = 60_000;
const DEFAULTS = { breakAfterHeatMin: 3, breakAfterRoundMin: 5, readyCallMin: 15 };
const at = (day: string, hhmm: string, sec = 0) => localToUtc(day, hhmm, TZ) + sec * 1000;
const iso = (ms: number) => new Date(ms).toISOString();
const optsFor = (day: string, now?: number): TimetableOptions => ({ timezone: TZ, eventDay: day, defaults: DEFAULTS, ...(now !== undefined ? { now: iso(now) } : {}) });

// R1 = h1…h8, R2 = h9…h12, SF = h13, h14, F = h15
const ROUND_OF = (i: number) => (i <= 8 ? "R1" : i <= 12 ? "R2" : i <= 14 ? "SF" : "F");
const LAST = new Set([8, 12, 14, 15]);
function heats(): HeatLive[] {
  return Array.from({ length: 15 }, (_, k) => {
    const i = k + 1;
    return { heatId: `h${i}`, division: "Open", round: ROUND_OF(i), heat: `Heat ${i}`, durationMin: 10, warmUpMin: 5, breakAfterHeatMin: 3, breakAfterRoundMin: 5, roundLast: LAST.has(i) };
  });
}
const thursday = (): SchedulePlan => ({
  id: "thu",
  name: "Plan A – Thu",
  active: true,
  items: [
    ...[1, 2, 3, 4].map((i) => ({ id: `i${i}`, kind: "heat" as const, heatId: `h${i}` })),
    { id: "lunch", kind: "break" as const, label: "Lunch", durationMin: 45 },
    ...[5, 6, 7, 8].map((i) => ({ id: `i${i}`, kind: "heat" as const, heatId: `h${i}` })),
  ],
  anchors: { i1: "10:00" },
  actualStarts: {},
});
const friday = (): SchedulePlan => ({
  id: "fri",
  name: "Plan A – Fri",
  active: true,
  items: [9, 10, 11, 12, 13, 14, 15].map((i) => ({ id: `i${i}`, kind: "heat" as const, heatId: `h${i}` })),
  anchors: { i9: "10:00" },
  actualStarts: {},
});

describe("Audit 1a · timetable · the Arrow plan as written", () => {
  it("Thursday: warm-up 9:55, start 10:00, end 10:10; next heat 10:18 (3 min break + 5 min warm-up); lunch; finish", () => {
    const t = computeTimetable(thursday(), heats(), optsFor(THU));
    expect(t.rows.map((r) => [r.itemId, r.warmUpStart, r.start, r.end, r.breakAfterMin])).toEqual([
      ["i1", "09:55", "10:00", "10:10", 3],
      ["i2", "10:13", "10:18", "10:28", 3],
      ["i3", "10:31", "10:36", "10:46", 3],
      ["i4", "10:49", "10:54", "11:04", 3],
      ["lunch", null, "11:04", "11:49", 0],
      ["i5", "11:49", "11:54", "12:04", 3],
      ["i6", "12:07", "12:12", "12:22", 3],
      ["i7", "12:25", "12:30", "12:40", 3],
      ["i8", "12:43", "12:48", "12:58", null],
    ]);
    expect(t.finish).toBe("12:58");
  });

  it("Friday: the last heat of R2 and of the SF is followed by the 5 min round break", () => {
    const t = computeTimetable(friday(), heats(), optsFor(FRI));
    expect(t.rows.map((r) => [r.itemId, r.start, r.breakAfterMin])).toEqual([
      ["i9", "10:00", 3], ["i10", "10:18", 3], ["i11", "10:36", 3], ["i12", "10:54", 5], ["i13", "11:14", 3], ["i14", "11:32", 5], ["i15", "11:52", null],
    ]);
  });
});

// ── random scenarios ──────────────────────────────────────────────────────────────────────────────────────────────
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)), chance: (p: number) => next() < p };
}

interface Scenario {
  day: string;
  plan: SchedulePlan;
  lives: HeatLive[];
  now: number;
}

/** A random state of one day: some heats run (with seconds), one may be running or paused, pins, a hold, a cancel, a re-run, broken rows. */
function scenario(seed: number): Scenario {
  const r = rng(seed);
  const day = r.chance(0.5) ? THU : FRI;
  const plan = day === THU ? thursday() : friday();
  let lives = heats();
  const heatItems = plan.items.filter((i) => i.kind === "heat");
  // pins "not before" on random items
  for (const item of plan.items) if (r.chance(0.15)) plan.anchors[item.id] = `${String(r.int(9, 15)).padStart(2, "0")}:${String(r.int(0, 59)).padStart(2, "0")}`;
  // heats that ran: in order, each ending some seconds off the plan
  const ran = r.int(0, heatItems.length);
  let clock = at(day, "10:00") + r.int(-120, 600) * 1000;
  for (const item of heatItems.slice(0, ran)) {
    const id = (item as { heatId: string }).heatId;
    const start = clock;
    const end = start + (10 + r.int(-1, 3)) * MIN + r.int(0, 59) * 1000;
    lives = lives.map((h) => (h.heatId === id ? { ...h, startedAt: iso(start), endedAt: iso(end) } : h));
    clock = end + (8 + r.int(0, 4)) * MIN + r.int(0, 59) * 1000;
  }
  let now = clock - r.int(0, 6) * MIN;
  const nextItem = heatItems[ran] as { heatId: string } | undefined;
  if (nextItem && r.chance(0.3)) {
    // one heat on the water, maybe paused for a while, maybe running over
    lives = lives.map((h) => (h.heatId === nextItem.heatId ? { ...h, startedAt: iso(clock), pausedMin: r.chance(0.3) ? r.int(1, 6) : 0 } : h));
    now = clock + r.int(1, 25) * MIN + r.int(0, 59) * 1000;
  }
  const later = heatItems.slice(ran + 1).map((i) => (i as { heatId: string }).heatId);
  if (later.length && r.chance(0.25)) {
    const id = later[r.int(0, later.length - 1)];
    lives = lives.map((h) => (h.heatId === id ? { ...h, cancelled: true } : h)); // cancelled before it started
  }
  if (ran > 0 && r.chance(0.2)) {
    // a re-run: the heat that ran is cancelled (it keeps its real times) and a new heat for it goes at the end of the day
    const orig = (heatItems[ran - 1] as { heatId: string }).heatId;
    lives = lives.map((h) => (h.heatId === orig ? { ...h, cancelled: true } : h));
    lives.push({ ...heats().find((h) => h.heatId === orig)!, heatId: `${orig}-rerun`, heat: `${orig} re-run` });
    plan.items.push({ id: `rerun-${orig}`, kind: "heat", heatId: `${orig}-rerun` });
  }
  if (later.length && r.chance(0.15)) {
    const id = later[r.int(0, later.length - 1)];
    lives = lives.map((h) => (h.heatId === id ? { ...h, durationMin: undefined } : h)); // a heat with no length
  }
  if (r.chance(0.15)) plan.items.splice(r.int(0, plan.items.length), 0, { id: "dangling", kind: "heat", heatId: "gone-from-the-draw" });
  if (r.chance(0.1)) plan.items.splice(r.int(0, plan.items.length), 0, { id: "note", kind: "note", label: "Prize giving" });
  if (r.chance(0.15)) plan.hold = { since: iso(now - r.int(0, 20) * MIN), reason: "wind" };
  return { day, plan, lives, now };
}

const cursorRows = (t: Timetable) => t.rows.filter((r) => r.kind !== "note" && r.startUtc !== null);
const unstarted = (s: string) => s === "next" || s === "est" || s === "pinned";
const SEEDS = Array.from({ length: 1500 }, (_, i) => 77 + i);

describe("Audit 1a · timetable · 1500 random states of the Arrow days", () => {
  it("never throws; End = Start + length; next Start = End + break + warm-up (or a pin, or now); a pin means not before", () => {
    for (const seed of SEEDS) {
      const s = scenario(seed);
      const t = computeTimetable(s.plan, s.lives, optsFor(s.day, s.now));
      const rows = cursorRows(t);
      rows.forEach((row, i) => {
        const ctx = `seed ${seed}, ${row.itemId}: ${row.reason}`;
        const start = Date.parse(row.startUtc!);
        const end = Date.parse(row.endUtc!);
        if (unstarted(row.status)) {
          expect(end - start, ctx).toBe(row.durationMin * MIN);
          expect(Date.parse(row.warmUpStartUtc ?? row.startUtc!), ctx).toBe(start - row.warmUpMin * MIN);
          const prev = rows[i - 1];
          const pin = s.plan.anchors[row.itemId] ? at(s.day, s.plan.anchors[row.itemId]) : undefined;
          if (pin !== undefined) expect(start, `${ctx}: not before the pin`).toBeGreaterThanOrEqual(pin);
          expect(start, `${ctx}: nothing in the past`).toBeGreaterThanOrEqual(s.now + row.warmUpMin * MIN);
          if (prev) {
            const brk = row.kind === "break" ? 0 : (prev.breakAfterMin ?? 0);
            const earliest = Date.parse(prev.endUtc!) + (brk + row.warmUpMin) * MIN;
            expect(start, ctx).toBe(Math.max(earliest, pin ?? -Infinity, s.now + row.warmUpMin * MIN));
          }
        }
        if (row.status === "live" && row.kind === "heat") expect(end - start, ctx).toBeGreaterThanOrEqual(row.durationMin * MIN);
      });
      // rows with no time are exactly: held, cancelled-before-start, the dangling row
      for (const row of t.rows.filter((x) => x.startUtc === null && x.kind !== "note")) {
        expect(row.status === "held" || row.status === "cancelled", `seed ${seed}, ${row.itemId}`).toBe(true);
      }
      if (s.plan.items.some((i) => i.id === "dangling")) expect(t.rows.find((x) => x.itemId === "dangling")?.issue).toBe("no-heat");
      expect(t.rows.filter((x) => x.status === "next").length, `seed ${seed}: at most one "next"`).toBeLessThanOrEqual(1);
    }
  });

  it("the +1 minute rule: the next start moves by at least the minutes asked and less than one minute more", () => {
    let tried = 0;
    for (const seed of SEEDS) {
      const s = scenario(seed);
      if (s.plan.hold) continue;
      for (const minutes of [1, 2, 5]) {
        let next: SchedulePlan;
        try {
          next = extendBreak(s.plan, s.lives, minutes, { ...optsFor(s.day), now: iso(s.now) });
        } catch {
          continue; // nothing left to start, or no time yet: refused with a sentence, never a wrong pin
        }
        const changed = Object.keys(next.anchors).find((k) => next.anchors[k] !== s.plan.anchors[k])!;
        const before = computeTimetable(s.plan, s.lives, optsFor(s.day)).rows.find((r) => r.itemId === changed)!;
        const from = Math.max(Date.parse(before.startUtc!), s.now);
        const pin = at(s.day, next.anchors[changed]);
        const ctx = `seed ${seed}, +${minutes}: from ${new Date(from).toISOString()} pin ${next.anchors[changed]}`;
        expect(pin - (from + minutes * MIN), ctx).toBeGreaterThanOrEqual(0);
        expect(pin - (from + minutes * MIN), ctx).toBeLessThan(MIN);
        tried++;
      }
    }
    expect(tried).toBeGreaterThan(1000);
  });

  it("Pause break then resume: the next heat is pinned at now + what was left, rounded up to the whole minute", () => {
    let tried = 0;
    for (const seed of SEEDS) {
      const s = scenario(seed);
      if (s.plan.hold || s.lives.some((h) => h.startedAt && !h.endedAt)) continue;
      const paused = startHold(s.plan, iso(s.now));
      const later = s.now + 3 * MIN + 17_000;
      const resumed = resumeBreak(paused, s.lives, { ...optsFor(s.day), now: iso(later) });
      expect(resumed.hold, `seed ${seed}`).toBeUndefined();
      const changed = Object.keys(resumed.anchors).find((k) => resumed.anchors[k] !== s.plan.anchors[k]);
      if (!changed) continue;
      const pin = at(s.day, resumed.anchors[changed]);
      expect(pin % MIN).toBe(0);
      expect(pin).toBeGreaterThan(later);
      tried++;
    }
    expect(tried).toBeGreaterThan(100);
  });

  it.fails("A1a-4: Shift +N should move the next start by at least N minutes (it truncates the seconds, like +1 min must not)", () => {
    // R1 H1 ended 10:10:40 → H2 projected 10:18:40. Shift +5 should give ≥ 10:23:40; the pin is "10:23" → 10:23:00, 40 s short.
    const lives = heats().map((h) => (h.heatId === "h1" ? { ...h, startedAt: iso(at(THU, "10:00", 40)), endedAt: iso(at(THU, "10:10", 40)) } : h));
    const opts = optsFor(THU, at(THU, "10:12"));
    const before = computeTimetable(thursday(), lives, opts).rows.find((r) => r.itemId === "i2")!;
    const after = computeTimetable(shift(thursday(), lives, 5, opts), lives, opts).rows.find((r) => r.itemId === "i2")!;
    expect(Date.parse(after.startUtc!) - Date.parse(before.startUtc!)).toBeGreaterThanOrEqual(5 * MIN);
  });

  it("A1a-4 today: that Shift +5 moves the heat by 4 min 20 s", () => {
    const lives = heats().map((h) => (h.heatId === "h1" ? { ...h, startedAt: iso(at(THU, "10:00", 40)), endedAt: iso(at(THU, "10:10", 40)) } : h));
    const opts = optsFor(THU, at(THU, "10:12"));
    const before = computeTimetable(thursday(), lives, opts).rows.find((r) => r.itemId === "i2")!;
    const after = computeTimetable(shift(thursday(), lives, 5, opts), lives, opts).rows.find((r) => r.itemId === "i2")!;
    expect(Date.parse(after.startUtc!) - Date.parse(before.startUtc!)).toBe(4 * MIN + 20_000);
  });
});

// ── the drift badge ──────────────────────────────────────────────────────────────────────────────────────────────
describe("Audit 1a · timetable · the drift badge", () => {
  it("matches the arithmetic on every random state: whole minutes of (start now − start as written), tone by the 10-minute rule", () => {
    for (const seed of SEEDS) {
      const s = scenario(seed);
      const opts = optsFor(s.day, s.now);
      const d = scheduleDrift(s.plan, s.lives, opts);
      const current = computeTimetable(s.plan, s.lives, opts);
      const next = current.rows.find((r) => r.kind === "heat" && unstarted(r.status));
      if (!d) {
        expect(!next || !next.startUtc || s.plan.hold !== undefined || !plannedTimetable(s.plan, s.lives, opts).rows.find((r) => r.itemId === next.itemId)?.startUtc, `seed ${seed}`).toBe(true);
        continue;
      }
      const was = plannedTimetable(s.plan, s.lives, opts).rows.find((r) => r.itemId === d.itemId)!.startUtc!;
      const signed = Math.round((Date.parse(next!.startUtc!) - Date.parse(was)) / MIN);
      expect(d.itemId, `seed ${seed}`).toBe(next!.itemId);
      expect(d.minutes, `seed ${seed}`).toBe(Math.abs(signed));
      expect(d.tone, `seed ${seed}`).toBe(signed <= 0 ? "green" : signed <= 10 ? "amber" : "red");
    }
  });

  it.fails("A1a-5: the badge should agree with the two times on the board (planned 10:18, now 10:20 → '2 min late', not 3)", () => {
    // R1 H1 started 10:02:40 and ended 10:12:40: H2 is now 10:20:40 (shown "10:20") against 10:18 in the plan.
    const lives = heats().map((h) => (h.heatId === "h1" ? { ...h, startedAt: iso(at(THU, "10:02", 40)), endedAt: iso(at(THU, "10:12", 40)) } : h));
    const opts = optsFor(THU, at(THU, "10:13"));
    const now = computeTimetable(thursday(), lives, opts).rows.find((r) => r.itemId === "i2")!;
    const planned = plannedTimetable(thursday(), lives, opts).rows.find((r) => r.itemId === "i2")!;
    expect([planned.start, now.start]).toEqual(["10:18", "10:20"]);
    expect(scheduleDrift(thursday(), lives, opts)?.minutes).toBe(2);
  });

  it("A1a-5 today: the board shows 10:18 in the plan and 10:20 now, and the badge says 3 min late", () => {
    const lives = heats().map((h) => (h.heatId === "h1" ? { ...h, startedAt: iso(at(THU, "10:02", 40)), endedAt: iso(at(THU, "10:12", 40)) } : h));
    const opts = optsFor(THU, at(THU, "10:13"));
    expect(computeTimetable(thursday(), lives, opts).rows.find((r) => r.itemId === "i2")!.start).toBe("10:20");
    expect(plannedTimetable(thursday(), lives, opts).rows.find((r) => r.itemId === "i2")!.start).toBe("10:18");
    expect(scheduleDrift(thursday(), lives, opts)).toMatchObject({ state: "late", minutes: 3 });
  });

  it("A1a-5 detail: half a minute rounds up when late and down when early (Math.round)", () => {
    const t = (startUtc: string) => ({ rows: [{ itemId: "x", kind: "heat", status: "next", startUtc }], finishUtc: null, finish: null, heatsLeft: 1, warnings: [] }) as unknown as Timetable;
    expect(driftOf(t("2026-10-08T07:00:00Z"), t("2026-10-08T07:02:30Z"))?.minutes).toBe(3);
    expect(driftOf(t("2026-10-08T07:00:00Z"), t("2026-10-08T06:57:30Z"))?.minutes).toBe(2);
  });
});

// ── organiser and public see the same estimates ──────────────────────────────────────────────────────────────────
describe("Audit 1a · timetable · organiser and public estimates are identical", () => {
  /** The same heats as the organiser screens read them (heats rows + stored draw) and as the public payload carries them. */
  function bothSides(s: Scenario) {
    const rows: HeatRowDb[] = s.lives.map((h, i) => ({
      id: h.heatId, division_id: "d", round_id: h.round ?? "R1", draw_uid: h.heatId, number: i + 1, name: h.heat ?? null,
      status: h.cancelled ? "cancelled" : h.endedAt ? "published" : h.startedAt ? "running" : "pending",
      started_at: h.startedAt ?? null, ended_at: h.endedAt ?? null,
      duration_sec: (h.durationMin ?? 0) * 60, warm_up_sec: (h.warmUpMin ?? 0) * 60, paused_total_sec: (h.pausedMin ?? 0) * 60,
    }));
    const draw = { rounds: [{ heats: s.lives.map((h) => ({ id: h.heatId, uid: h.heatId, roundLast: Boolean(h.roundLast), breakAfterHeatMin: h.breakAfterHeatMin, breakAfterRoundMin: h.breakAfterRoundMin })) }] };
    const organiser = buildHeatModel([{ id: "d", name: "Open", sort_order: 0, draw }], ["R1", "R2", "SF", "F"].map((id, i) => ({ id, division_id: "d", name: id, short_name: id, sort_order: i })), rows).lives;
    const pub: PublicTimetable = {
      allowed: true, server_now: iso(s.now), timezone: TZ, poll_sec: 30, ready_call_min: 15,
      plans: [{ id: s.plan.id, day: s.day, name: s.plan.name, items: s.plan.items, anchors: s.plan.anchors, actual_starts: s.plan.actualStarts, hold: s.plan.hold ?? null, defaults: { breakAfterHeatMin: 3, breakAfterRoundMin: 5 } }],
      divisions: [{ id: "d", name: "Open", sort_order: 0 }],
      rounds: ["R1", "R2", "SF", "F"].map((id, i) => ({ id, division_id: "d", name: id, short_name: id, sort_order: i })),
      heats: rows.map((r, i) => ({ id: r.id, division_id: "d", round_id: r.round_id, number: r.number, suffix: null, name: r.name, status: r.status, effective_status: null, held: false, started_at: r.started_at, ended_at: r.ended_at, paused_at: null, paused_total_sec: r.paused_total_sec, duration_sec: r.duration_sec, warm_up_sec: r.warm_up_sec, rerun_of: null, round_last: Boolean(s.lives[i].roundLast), break_after_heat_min: s.lives[i].breakAfterHeatMin ?? null, break_after_round_min: s.lives[i].breakAfterRoundMin ?? null })),
    };
    return { organiser, pub };
  }

  it("same plan, same heats, same clock: every row the public sees has the organiser's start and end, and the same finish and drift", () => {
    for (const seed of SEEDS.slice(0, 600)) {
      const s = scenario(seed);
      const { organiser, pub } = bothSides(s);
      const org = computeTimetable(s.plan, organiser, optsFor(s.day, s.now));
      const pubModel = buildPublicTimetable(pub, iso(s.now));
      for (const p of pubModel.rows) {
        const o = org.rows.find((r) => r.itemId === p.itemId)!;
        expect([p.start, p.end, p.status], `seed ${seed}, ${p.itemId}`).toEqual([o.start, o.end, o.status]);
      }
      expect(pubModel.rows.length, `seed ${seed}: the public hides only cancelled and broken rows`).toBe(org.rows.filter((r) => r.status !== "cancelled" && !r.issue).length);
      expect(pubModel.finish, `seed ${seed}`).toBe(org.finish);
      expect(pubModel.drift ?? null, `seed ${seed}`).toEqual(scheduleDrift(s.plan, organiser, optsFor(s.day, s.now)));
    }
  });
});

// ── two days ─────────────────────────────────────────────────────────────────────────────────────────────────────
describe("Audit 1a · timetable · a heat never shows on both days", () => {
  it("the two plans as built hold disjoint heats, and each day's rows carry only that day's times", () => {
    const thu = computeTimetable(thursday(), heats(), optsFor(THU));
    const fri = computeTimetable(friday(), heats(), optsFor(FRI));
    const ids = (t: Timetable) => t.rows.flatMap((r) => (r.heatId ? [r.heatId] : []));
    expect(ids(thu).filter((h) => ids(fri).includes(h))).toEqual([]);
    for (const r of thu.rows) expect(r.startUtc!.slice(0, 10)).toBe(THU);
    for (const r of fri.rows) expect(r.startUtc!.slice(0, 10)).toBe(FRI);
  });

  it.fails("A1a-7: Friday made with 'Copy Thursday's plan' should not list Thursday's heats again (or the drift badge reads hours early)", () => {
    // Thursday ran; the organiser copies Thursday's plan to Friday and adds the R2–Final heats (the known P2-14 gap).
    const ranThu = computeTimetable(thursday(), heats(), optsFor(THU));
    const lives = heats().map((h) => {
      const r = ranThu.rows.find((x) => x.heatId === h.heatId);
      return r ? { ...h, startedAt: r.startUtc, endedAt: r.endUtc } : h;
    });
    const copied = copyPlanToDay({ id: "thu", day: THU, name: "Plan A – Thu", active: true, items: thursday().items, anchors: thursday().anchors, hand_pins: ["i1"] });
    const fri: SchedulePlan = { id: "fri", name: "Plan A – Fri", active: true, items: [...(copied.items as SchedulePlan["items"]), ...friday().items], anchors: { ...copied.anchors, i9: "10:00" }, actualStarts: {} };
    const opts = optsFor(FRI, at(FRI, "09:30"));
    const t = computeTimetable(fri, lives, opts);
    const thuHeats = t.rows.filter((r) => r.heatId && Number(r.heatId.slice(1)) <= 8);
    expect(thuHeats).toEqual([]);
    expect(scheduleDrift(fri, lives, opts)?.minutes ?? 0).toBeLessThan(60);
  });

  it("A1a-7 today: the 8 Thursday heats show on Friday as done; Thursday's lunch break runs again at 09:30 and pushes Friday's 10:00 pin to 10:20", () => {
    const ranThu = computeTimetable(thursday(), heats(), optsFor(THU));
    const lives = heats().map((h) => {
      const r = ranThu.rows.find((x) => x.heatId === h.heatId);
      return r ? { ...h, startedAt: r.startUtc, endedAt: r.endUtc } : h;
    });
    const copied = copyPlanToDay({ id: "thu", day: THU, name: "Plan A – Thu", active: true, items: thursday().items, anchors: thursday().anchors, hand_pins: ["i1"] });
    const fri: SchedulePlan = { id: "fri", name: "Plan A – Fri", active: true, items: [...(copied.items as SchedulePlan["items"]), ...friday().items], anchors: { ...copied.anchors, i9: "10:00" }, actualStarts: {} };
    const opts = optsFor(FRI, at(FRI, "09:30"));
    const t = computeTimetable(fri, lives, opts);
    expect(t.rows.filter((r) => r.status === "done").map((r) => [r.heatId, r.startUtc!.slice(0, 10)])).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`h${i}`, THU]));
    const d = scheduleDrift(fri, lives, opts)!;
    expect(d.state).toBe("early");
    expect(d.minutes).toBeGreaterThan(150);
    expect(t.rows.find((r) => r.itemId === "lunch")?.start).toBe("09:30");
    expect(utcToLocalHHMM(t.rows.find((r) => r.itemId === "i9")!.startUtc!, TZ)).toBe("10:20");
  });
});
