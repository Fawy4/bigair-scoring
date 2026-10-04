import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildFixture, ENV_OK, type Fixture } from "./helpers";
import { ago, codeOf, key, mkDivision, mkHeat, type LiveDivision } from "./live-helpers";
import { buildGouna, type GounaWorld } from "./audit-1b-world";

/**
 * Fix 2, item 1(c) — the proof that the crowd cannot slow the officials. Repeatable, and it loads the shared hosted project, so it runs only with FIX2_LOAD=1 against
 * a production server (`npm run build && npx next start -p 3200`, FIX2_BASE_URL=http://localhost:3200). NEVER run it while another test batch is running, and never
 * more than one ramp at a time (the free box fell over under test load on 3 Oct).
 *
 *   FIX2_LOAD=1 FIX2_BASE_URL=http://localhost:3200 npx vitest run --config vitest.rls.config.ts tests/rls/fix2-load.test.ts -t "officials"
 *   FIX2_LOAD=1 FIX2_BASE_URL=... FIX2_RAMP=1 npx vitest run --config vitest.rls.config.ts tests/rls/fix2-load.test.ts -t "ramp"
 *
 * Spectators: each asks the app for the live heat page and the results page in turn, every 7 s (an RSC refresh, as `router.refresh` does), from a random phase.
 * Officials, every 5 s for FIX2_SECONDS (default 180): the head judge's Start heat sequence (arm) / Abort / Publish (rotating), a judge's score save, a spotter's log.
 * Pass mark: each official action's 95th percentile under one second. Writes test-results/fix2-load.json.
 */
const BASE = process.env.FIX2_BASE_URL ?? "http://localhost:3200";
const ON = process.env.FIX2_LOAD === "1";
const POLL_MS = 7000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const pct = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
};
const stat = (xs: number[]) => ({ n: xs.length, p50: Math.round(pct(xs, 0.5)), p95: Math.round(pct(xs, 0.95)), max: Math.round(Math.max(0, ...xs)) });
const crit = (v: number) => ({ height: v, extremity: v, technicality: v, execution: v });

async function sql(query: string): Promise<Array<Record<string, unknown>> | null> {
  const ref = process.env.SUPABASE_PROJECT_REF;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!ref || !token) return null;
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  return res.ok ? ((await res.json()) as Array<Record<string, unknown>>) : null;
}
/** Transactions committed so far: the difference over a level is the database's work (calls) in that time. */
const commits = async () => Number((await sql("select sum(xact_commit)::bigint as n from pg_stat_database where datname = 'postgres'"))?.[0]?.n ?? NaN);

describe.skipIf(!ENV_OK || !ON)("Fix 2 — the officials under a crowd (FIX2_LOAD=1)", () => {
  let f: Fixture;
  let w: GounaWorld;
  let slug: string;
  let live: LiveDivision;
  let armDiv: LiveDivision;
  const publishOrder: string[] = [];
  /** This machine's round trip to the database, how many database calls one Publish makes and how long it takes ALONE (measured once in setup). The console's Publish
   * runs on the app's server next to the database, but this test drives it from here, so the raw Publish time includes about `publishCalls` round trips of this machine's
   * distance. The pass mark for Publish is therefore: under the crowd no slower than 1.5 × alone (+ 250 ms); the absolute "under 1 s" is read from the live address. */
  let rttMs = 0;
  let publishCalls = 1;
  let publishAloneMs = 0;

  beforeAll(async () => {
    f = await buildFixture();
    w = await buildGouna({ fixture: f, name: "Fix2 load" });
    await f.s.from("events").update({ status: "live", settings: { publicLiveScores: "live", maxRunningHeats: 3, livePollSec: 7, flags: { enabled: true, prestartSec: 60, lastMinuteSec: 60 } } as never }).eq("id", f.ids.evA1);
    slug = (await f.s.from("events").select("slug").eq("id", f.ids.evA1).single()).data!.slug as string;
    // the head's Publish presses the ladder's heats in order; each is scored and ended just before (outside the timing), so no later round has "started"
    for (const round of w.uids) for (const uid of round) publishOrder.push((await w.heatByUid(uid)).id);
    const rtts: number[] = [];
    for (let i = 0; i < 7; i++) {
      const t0 = performance.now();
      await f.s.rpc("server_now");
      rtts.push(performance.now() - t0);
    }
    rttMs = pct(rtts, 0.5);
    const calibrate = publishOrder.shift()!;
    await w.scoreAndEnd(calibrate);
    const realFetch = globalThis.fetch;
    let counted = 0;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input instanceof Request ? input.url : input).includes(".supabase.co")) counted++;
      return realFetch(input, init);
    }) as typeof fetch;
    const t0 = performance.now();
    try {
      const r = await w.publish(calibrate);
      publishAloneMs = performance.now() - t0;
      if (!r.ok) throw new Error(`calibration publish: ${JSON.stringify(r)}`);
    } finally {
      globalThis.fetch = realFetch;
    }
    publishCalls = Math.max(1, counted);
    live = await mkDivision(f, { name: "Fix2 live", seats: ["j1", "j2", "j3"], riders: 4 });
    armDiv = await mkDivision(f, { name: "Fix2 arm", seats: ["j1", "j2", "j3"] });
  }, 1_200_000);
  afterAll(async () => {
    await f?.cleanup();
  });

  /** The officials' loop. Returns timings by action. */
  async function officials(seconds: number): Promise<Record<string, number[]> & { errors: string[] }> {
    const t: Record<string, number[]> = { head_start_sequence: [], head_abort: [], head_publish: [], judge_score: [], spotter_log: [] };
    const errors: string[] = [];
    const timed = async (name: string, fn: () => Promise<string>) => {
      const t0 = performance.now();
      const err = await fn();
      t[name].push(performance.now() - t0);
      if (err) errors.push(`${name}: ${err}`);
    };
    let liveHeat = await mkHeat(f, live, { status: "running", started_at: ago(30) }, { riders: 4 });
    let n = 0; // attempts in this heat
    let attempt = "";
    const armHeat = await mkHeat(f, armDiv, {}, { riders: 3 });
    let tick = 0;
    const end = Date.now() + seconds * 1000;
    const head = (async () => {
      while (Date.now() < end) {
        const t0 = Date.now();
        const step = tick++ % 3;
        if (step === 0) await timed("head_start_sequence", async () => codeOf(await f.clients.head.rpc("arm_heat", { p_heat: armHeat, p_prestart: 60 })));
        else if (step === 1) await timed("head_abort", async () => codeOf(await f.clients.head.rpc("abort_start", { p_heat: armHeat })));
        else {
          const heat = publishOrder.shift();
          if (heat) await w.scoreAndEnd(heat);
          if (heat) await timed("head_publish", async () => { const r = await w.publish(heat); return r.ok ? "" : JSON.stringify(r).slice(0, 120); });
        }
        await sleep(5000 - (Date.now() - t0));
      }
    })();
    const spotter = (async () => {
      let i = 0;
      while (Date.now() < end) {
        const t0 = Date.now();
        if (n >= 24) {
          await f.s.from("heats").update({ status: "ended", ended_at: ago(1) }).eq("id", liveHeat);
          liveHeat = await mkHeat(f, live, { status: "running", started_at: ago(30) }, { riders: 4 });
          n = 0;
        }
        await timed("spotter_log", async () => {
          const r = await f.clients.spotter.rpc("add_attempt", { p_heat: liveHeat, p_entry: live.entries[i++ % 4], p_client_key: key(), p_status: "landed", p_trick_name: "Backroll" });
          if (!r.error) { attempt = (r.data as { id: string }).id; n++; }
          return codeOf(r);
        });
        await sleep(5000 - (Date.now() - t0));
      }
    })();
    const judge = (async () => {
      let rev = 0;
      await sleep(2500);
      while (Date.now() < end) {
        const t0 = Date.now();
        if (attempt) await timed("judge_score", async () => { const v = 5 + (++rev % 4); return codeOf(await f.clients.j1.rpc("submit_trick_score", { p_attempt: attempt, p_client_key: key(), p_client_rev: rev, p_criteria: crit(v) as never, p_flag: null as never, p_missed: false, p_score: v })); });
        await sleep(5000 - (Date.now() - t0));
      }
    })();
    await Promise.all([head, spotter, judge]);
    await f.s.from("heats").update({ armed_at: null, prestart_sec: null, armed_paused_at: null }).eq("id", armHeat);
    return Object.assign(t, { errors });
  }

  /** `n` spectators until `stopAt`; every refresh alternates the live and the results page. */
  async function crowd(n: number, stopAt: number, out: { times: number[]; updating: number; errors: string[] }) {
    const one = async (i: number) => {
      await sleep(Math.random() * POLL_MS);
      let k = i;
      while (Date.now() < stopAt && out.errors.length < 5) {
        const t0 = performance.now();
        try {
          const res = await fetch(`${BASE}/e/${slug}/${k++ % 2 ? "results" : "live"}`, { headers: { RSC: "1" } });
          const body = await res.text();
          if (!res.ok) out.errors.push(`HTTP ${res.status}`);
          else if (body.includes("public-updating")) out.updating++;
          out.times.push(performance.now() - t0);
        } catch (e) {
          out.errors.push(String(e).slice(0, 80));
        }
        await sleep(POLL_MS - (performance.now() - t0));
      }
    };
    await Promise.all(Array.from({ length: n }, (_, i) => one(i)));
  }

  it("officials stay under one second at the 95th percentile while 300 spectators refresh the live and results pages", async () => {
    const seconds = Number(process.env.FIX2_SECONDS ?? 180);
    const spectators = Number(process.env.FIX2_SPECTATORS ?? 300);
    const out = { times: [] as number[], updating: 0, errors: [] as string[] };
    const c0 = await commits();
    const started = Date.now();
    const [off] = await Promise.all([officials(seconds), crowd(spectators, started + seconds * 1000, out)]);
    const c1 = await commits();
    const secs = (Date.now() - started) / 1000;
    const report = {
      at: new Date().toISOString(), spectators, seconds,
      officials: Object.fromEntries(Object.entries(off).filter(([k]) => k !== "errors").map(([k, v]) => [k, stat(v as number[])])),
      officialErrors: off.errors.slice(0, 10),
      thisMachine: { databaseRoundTripMs: Math.round(rttMs), publishDatabaseCalls: publishCalls, publishAloneMs: Math.round(publishAloneMs) },
      spectatorsRefresh: stat(out.times), spectatorsUpdatingPage: out.updating, spectatorErrors: out.errors.slice(0, 5),
      databaseTransactionsPerSec: Number.isFinite(c1 - c0) ? Math.round(((c1 - c0) / secs) * 10) / 10 : null,
    };
    console.info("FIX2 officials under load:", JSON.stringify(report, null, 1));
    mkdirSync("test-results", { recursive: true });
    writeFileSync("test-results/fix2-load.json", JSON.stringify(report, null, 1));
    expect(off.errors, "an official action was refused").toEqual([]);
    for (const [k, v] of Object.entries(off)) if (k !== "errors") {
      expect((v as number[]).length, `${k} was never timed`).toBeGreaterThan(0);
      // single calls: one round trip from this machine, under one second. Publish: see publishAloneMs above.
      if (k === "head_publish") expect(pct(v as number[], 0.95), "head_publish p95 (ms) against the same Publish alone").toBeLessThan(publishAloneMs * 1.5 + 250);
      else expect(pct(v as number[], 0.95), `${k} p95 (ms)`).toBeLessThan(1000);
    }
    expect(out.errors, "a spectator got an error").toEqual([]);
  }, 1_200_000);

  it("ramp 50 → 100 → 150 → 300 spectators, stop at the first error (one ramp at a time)", async () => {
    if (process.env.FIX2_RAMP !== "1") return;
    const levels = (process.env.FIX2_LEVELS ?? "50,100,150,300").split(",").map(Number);
    const ms = Number(process.env.FIX2_LEVEL_MS ?? 60_000);
    const report: Array<Record<string, unknown>> = [];
    for (const n of levels) {
      const out = { times: [] as number[], updating: 0, errors: [] as string[] };
      const c0 = await commits();
      const t0 = Date.now();
      await crowd(n, t0 + ms, out);
      const c1 = await commits();
      report.push({ spectators: n, ...stat(out.times), updatingPage: out.updating, errors: out.errors.length, firstError: out.errors[0] ?? "", dbTransactionsPerSec: Number.isFinite(c1 - c0) ? Math.round(((c1 - c0) / ((Date.now() - t0) / 1000)) * 10) / 10 : null });
      console.info("FIX2 ramp level:", JSON.stringify(report.at(-1)));
      mkdirSync("test-results", { recursive: true });
      writeFileSync("test-results/fix2-ramp.json", JSON.stringify({ at: new Date().toISOString(), levels: report }, null, 1));
      if (out.errors.length) break;
      await sleep(15_000);
    }
    expect(report.length).toBeGreaterThan(0);
  }, 1_800_000);
});
