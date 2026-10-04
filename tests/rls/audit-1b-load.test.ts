import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, ENV_OK } from "./helpers";
import { buildGouna, sharedFixture, type GounaWorld } from "./audit-1b-world";

// Audit 1b, A1b-0 / A1b-11 — the breaking point of the public pages' database load (docs/AUDIT.md). A measurement that loads the shared hosted project, so it runs
// only with AUDIT_LOAD=1. A Gouna event with all 15 heats published; N "spectators" each cost what one public page refresh costs on the server: get_public_site,
// then get_public_timetable, get_public_results and get_public_rules together (src/lib/public/page-data.ts loadCore), every 7 s (the default live update) from a
// random phase. Levels 50 → 100 → 150 → 300 for 60 s each; the ramp stops at the first error so the project is not knocked over again.
const LEVELS = (process.env.AUDIT_LOAD_LEVELS ?? "50,100,150,300").split(",").map(Number);
const POLL_MS = 7000;
const LEVEL_MS = Number(process.env.AUDIT_LOAD_LEVEL_MS ?? 60_000);

describe.skipIf(!ENV_OK || process.env.AUDIT_LOAD !== "1")("Audit 1b — load ramp of the public pages (AUDIT_LOAD=1)", () => {
  let w: GounaWorld;
  let slug: string;
  beforeAll(async () => {
    w = await buildGouna({ name: "Load" });
    for (const round of w.uids) for (const uid of round) {
      const h = await w.heatByUid(uid);
      await w.scoreAndEnd(h.id);
      const r = await w.publish(h.id);
      if (!r.ok) throw new Error(`publish ${uid}: ${JSON.stringify(r)}`);
    }
    slug = (await w.f.s.from("events").select("slug").eq("id", w.f.ids.evA1).single()).data!.slug as string;
  }, 1_200_000);
  afterAll(async () => {
    if (ENV_OK && process.env.AUDIT_LOAD === "1") await (await sharedFixture()).cleanup();
  });

  it("ramp 50 → 100 → 150 → 300 spectators; stop at the first error", async () => {
    const clients = Array.from({ length: 20 }, () => anonClient());
    const report: Array<Record<string, number | string>> = [];
    let broke: number | null = null;
    for (const n of LEVELS) {
      const times: number[] = [];
      let errors = 0;
      let firstError = "";
      let renders = 0;
      const end = Date.now() + LEVEL_MS;
      const spectator = async (i: number) => {
        await new Promise((r) => setTimeout(r, Math.random() * POLL_MS));
        while (Date.now() < end && !errors) {
          const c = clients[i % clients.length];
          const t0 = Date.now();
          const site = await c.rpc("get_public_site", { p_slug: slug });
          const rest = site.error ? [] : await Promise.all([c.rpc("get_public_timetable", { p_event: w.f.ids.evA1 }), c.rpc("get_public_results", { p_event: w.f.ids.evA1 }), c.rpc("get_public_rules", { p_event: w.f.ids.evA1 })]);
          const bad = [site, ...rest].find((r) => r.error);
          if (bad) {
            errors++;
            firstError ||= `${bad.error!.code ?? ""} ${bad.error!.message}`.slice(0, 120);
          }
          times.push(Date.now() - t0);
          renders++;
          await new Promise((r) => setTimeout(r, Math.max(0, POLL_MS - (Date.now() - t0))));
        }
      };
      await Promise.all(Array.from({ length: n }, (_, i) => spectator(i)));
      times.sort((a, b) => a - b);
      const p = (q: number) => times[Math.min(times.length - 1, Math.floor(q * times.length))] ?? 0;
      report.push({ spectators: n, renders, rpcPerSec: Math.round((renders * 4) / (LEVEL_MS / 1000)), p50ms: p(0.5), p95ms: p(0.95), maxMs: times.at(-1) ?? 0, errors, firstError });
      console.info("A1b load level:", JSON.stringify(report.at(-1)));
      mkdirSync("test-results", { recursive: true });
      writeFileSync("test-results/audit-1b-load.json", JSON.stringify({ at: new Date().toISOString(), levels: report, running: true }, null, 1));
      if (errors) {
        broke = n;
        break;
      }
      await new Promise((r) => setTimeout(r, 15_000)); // a breath between levels
    }
    console.info("A1b load ramp:", JSON.stringify(report, null, 1), "broke at", broke);
    mkdirSync("test-results", { recursive: true });
    writeFileSync("test-results/audit-1b-load.json", JSON.stringify({ at: new Date().toISOString(), levels: report, brokeAt: broke }, null, 1));
    expect(report.length).toBeGreaterThan(0);
  }, 1_800_000);
});
