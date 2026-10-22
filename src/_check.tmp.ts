/* eslint-disable */
import fs from "node:fs";
import { buildRiderReport } from "@/lib/engine/report";
import { reportContextFrom } from "@/lib/public/rider-report";
const L = (n: string) => JSON.parse(fs.readFileSync(`/tmp/claude-0/data/${n}.json`, "utf8"));
for (const k of ["rb", "ar"]) {
  const data = L(`${k}_payload`), draw = L(`${k}_draw`), rules = L(`${k}_rules`), pub: any[] = L(`${k}_pub`);
  const ctx = reportContextFrom(data, rules, draw);
  let rows = 0, bad: string[] = [], reports = 0, withheld = 0, noheats = 0, errs = 0;
  for (const e of data.entries) {
    const r: any = buildRiderReport(ctx, e.id);
    if (r.status === "withheld") { withheld++; continue; }
    if (r.status === "no_heats") { noheats++; continue; }
    if (r.status !== "ok") { errs++; continue; }
    reports++;
    for (const h of r.heats) {
      const p = pub.find((x) => x.heat_id === h.heatId && x.entry_id === e.id);
      if (!p) { bad.push(`no published row ${h.heatId}`); continue; }
      rows++;
      if (Number(p.total) !== h.total) bad.push(`total ${p.total} vs ${h.total}`);
      if (p.place !== h.place) bad.push(`place ${p.place} vs ${h.place}`);
      if (p.ac !== h.jumps) bad.push(`attempts ${p.ac} vs ${h.jumps} (${h.heatLabel})`);
      const landed = h.jumpLines.filter((j: any) => j.landed).length;
      if (p.lc !== landed) bad.push(`landed ${p.lc} vs ${landed}`);
      const cs = h.jumpLines.filter((j: any) => j.counted).map((j: any) => j.score).sort().join();
      const ps = p.counted.map((c: any) => c.score).sort().join();
      if (cs !== ps) bad.push(`counted ${ps} vs ${cs}`);
    }
    // tiles: sum of heats
    const sum = r.heats.reduce((s: number, h: any) => s + h.jumps, 0);
    if (sum !== r.tiles.jumps.value) bad.push("tile jumps");
  }
  // every published heat row has a report line
  const heatsInPayload = new Set(data.divisions.flatMap((d: any) => d.rounds.flatMap((r: any) => r.heats.map((h: any) => h.id))));
  console.log(k, { entries: data.entries.length, reports, withheld, noheats, errs, heatRowsCompared: rows, publishedRows: pub.length, publishedHeats: heatsInPayload.size, mismatches: bad.length, first: bad.slice(0, 5) });
}
