// A heat is never written without a length (fix-run-order-duration). The chain is: the round's own length, else the division's format default
// (`timing.defaultHeatMin`, required by the schema); warm-up: the round's, else the format's, else 0. The `heats` table also refuses an empty length.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { expandFormat } from "@/lib/engine/ladder";
import { newCustomFormat } from "@/lib/format-ui/custom";
import { parseFormatTemplate } from "@/lib/schemas/format-template";
import { drawProjection } from "./projection";

const DIR = join(process.cwd(), "presets", "formats");
const presets = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => [f, JSON.parse(readFileSync(join(DIR, f), "utf8"))] as const);
const riders = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i + 1}`, name: `Rider ${i + 1}` }));

describe("every heat of every built-in format is stored with a length and a warm-up", () => {
  for (const [file, json] of presets) {
    for (const n of [6, 14, 24]) {
      it(`${file} with ${n} riders`, () => {
        const template = parseFormatTemplate(json);
        let draw;
        try {
          draw = expandFormat(template, riders(n));
        } catch {
          return; // the format cannot run with that many riders: there is no draw to store
        }
        const { heats } = drawProjection(draw);
        for (const h of heats) {
          expect(Number.isInteger(h.duration_sec) && h.duration_sec > 0, `${h.uid} duration_sec ${h.duration_sec}`).toBe(true);
          expect(Number.isInteger(h.warm_up_sec) && h.warm_up_sec >= 0, `${h.uid} warm_up_sec ${h.warm_up_sec}`).toBe(true);
        }
      });
    }
  }
});

describe("the chain: the round's own length, else the division's format default", () => {
  const custom = () => {
    const json = newCustomFormat("Pro Women") as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    return json;
  };

  it("a custom round with no length of its own gets the format's default heat length and warm-up", () => {
    const json = custom();
    Object.assign(json.timing, { defaultHeatMin: 12, warmUpBeforeHeatMin: 4 });
    const { heats } = drawProjection(expandFormat(parseFormatTemplate(json), riders(6)));
    expect(heats.length).toBeGreaterThan(0);
    expect(new Set(heats.map((h) => h.duration_sec))).toEqual(new Set([720]));
    expect(new Set(heats.map((h) => h.warm_up_sec))).toEqual(new Set([240]));
  });

  it("a round's own length and warm-up win over the default (Final 15 min, 6 min warm-up)", () => {
    const json = custom();
    Object.assign(json.timing, { defaultHeatMin: 10, warmUpBeforeHeatMin: 3 });
    Object.assign(json.rounds[json.rounds.length - 1], { durationMin: 15, warmUpMin: 6 });
    const { heats } = drawProjection(expandFormat(parseFormatTemplate(json), riders(6)));
    const final = heats[heats.length - 1];
    expect([final.duration_sec, final.warm_up_sec]).toEqual([900, 360]);
    expect(heats.slice(0, -1).every((h) => h.duration_sec === 600 && h.warm_up_sec === 180)).toBe(true);
  });

  it("a generated ladder takes each round's length from its generator settings (here 12 / 12 / 15)", () => {
    const json = JSON.parse(JSON.stringify(presets.find(([f]) => f === "heats4-top2-single-elim.json")![1]));
    Object.assign(json.generator.params, { earlyMin: 12, semiMin: 12, finalMin: 15 });
    const { heats } = drawProjection(expandFormat(parseFormatTemplate(json), riders(14)));
    expect(heats[0].duration_sec).toBe(720);
    expect(heats[heats.length - 1].duration_sec).toBe(900);
  });

  it("a format with no warm-up stored at all gives warm-up 0, not nothing", () => {
    const json = custom();
    delete json.timing.warmUpBeforeHeatMin;
    const { heats } = drawProjection(expandFormat(parseFormatTemplate(json), riders(6)));
    expect(heats.every((h) => h.warm_up_sec === 0)).toBe(true);
  });

  it("a format with no default heat length cannot even be read: the schema refuses it", () => {
    const json = custom();
    delete json.timing.defaultHeatMin;
    expect(() => parseFormatTemplate(json)).toThrow();
  });
});
