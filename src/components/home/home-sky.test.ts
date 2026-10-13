import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/live/theme-tokens";
import { ANCHORS, createSky, figureBounds, POSE, waterBand, type Scene, type SkyColours } from "./home-sky-engine";

// The home page's Sendbook background (owner's choice): orange buttons and links on this page only, a drawn background with a still rider, water about 8% of the screen height.
const css = readFileSync("src/app/home.css", "utf8");
const sky = css.slice(css.indexOf("The Sendbook background"));
const day = sky.slice(0, sky.indexOf('.home.home-sky[data-theme="dark"]'));
const dark = sky.slice(sky.indexOf('.home.home-sky[data-theme="dark"]'), sky.indexOf(".home-sky-canvas"));

describe("the background's colours", () => {
  it("Day uses the owner's values", () => {
    for (const v of ["--sky-wave1: rgba(255, 106, 0, 0.11)", "--sky-wave2: rgba(255, 106, 0, 0.07)", "--sky-wave3: rgba(255, 106, 0, 0.15)", "--sky-air: rgba(230, 95, 0, 0.42)", "--sky-crest: rgba(230, 95, 0, 0.22)", "--sky-kiter: #f3af80", "--sky-kite: #ffac73", "#fff1e6 0%"]) expect(day).toContain(v);
  });
  it("Dark uses the owner's values", () => {
    for (const v of ["--sky-wave1: rgba(255, 106, 0, 0.13)", "--sky-wave2: rgba(255, 106, 0, 0.08)", "--sky-wave3: rgba(255, 106, 0, 0.16)", "--sky-air: rgba(255, 130, 40, 0.48)", "--sky-crest: rgba(255, 106, 0, 0.25)", "--sky-kiter: #8c4210", "--sky-kite: #b34a00", "#160a03 0%"]) expect(dark).toContain(v);
  });
});

describe("orange on this page", () => {
  it("buttons are #FF6A00 with black words at 7:1; Day's orange words #BA4800 read 5.2:1 on white; Dark's orange words read on the near-black page", () => {
    expect(day).toContain("--h-accent: #ff6a00");
    expect(day).toContain("--h-on-accent: #000000");
    expect(day).toContain("--h-orange: #ba4800");
    expect(dark).toContain("--h-orange: #ff6a00");
    // #111111 words on the orange would be 6.58:1, under the 7:1 line for essential text; black is 7.31:1
    expect(contrastRatio("#000000", "#ff6a00")).toBeGreaterThanOrEqual(7);
    expect(contrastRatio("#ba4800", "#ffffff")).toBeGreaterThanOrEqual(5.2);
    expect(contrastRatio("#ba4800", "#fff1e6")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#ff6a00", "#111111")).toBeGreaterThanOrEqual(6.5);
  });
  it("only the home page asks for it: the Join page and every other page keep teal", () => {
    expect(css.split("\n").filter((l) => l.startsWith(".home.home-sky"))).toHaveLength(2);
    expect(css.slice(0, css.indexOf("The Sendbook background"))).toContain("--h-accent: #0f5c57");
    expect(readFileSync("src/app/page.tsx", "utf8")).toContain('className="home home-sky"');
    for (const f of ["src/app/join/page.tsx", "src/app/legal/page.tsx", "src/components/home/site-chrome.tsx"]) expect(readFileSync(f, "utf8")).not.toContain("home-sky");
  });
});

describe("loading", () => {
  it("the page does not import the drawing: it is fetched after the page has loaded, with its two small pictures", () => {
    expect(readFileSync("src/app/page.tsx", "utf8")).not.toContain("home-sky-engine");
    const c = readFileSync("src/components/home/home-sky.tsx", "utf8");
    expect(c).not.toMatch(/^import .*home-sky-engine/m);
    expect(c).toContain('import("./home-sky-engine")');
    expect(c).toContain('"load"');
    expect(c).toContain("Math.min(2,");
    expect(c).toContain("visibilitychange");
    expect(c).toContain("prefers-reduced-motion");
  });
});

describe("the water", () => {
  it("is about 8% of the screen height, 40 to 76 px", () => {
    expect(waterBand(844)).toBeCloseTo(67.52, 2);
    expect(waterBand(300)).toBe(40);
    expect(waterBand(2000)).toBe(76);
  });
});

const sprites = { rider: { image: {} as CanvasImageSource, width: 133, height: 166 }, kite: { image: {} as CanvasImageSource, width: 440, height: 194 } };
const colours: SkyColours = { wave1: "#a", wave2: "#b", wave3: "#c", air: "#d", crest: "#e", line: "#f" };
const scene = (k: number, x = 0, y = 0): Scene => ({ ...POSE, x, y, k });

function fakeContext() {
  const calls: Array<{ fn: string; args: unknown[] }> = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (t, k: string) => (k in t ? t[k] : (...args: unknown[]) => void calls.push({ fn: k, args })),
    set: (t, k: string, v) => ((t[k] = v), true),
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe("the figure", () => {
  it("has a size that grows with the scale", () => {
    const b1 = figureBounds(scene(1), sprites);
    const b2 = figureBounds(scene(2), sprites);
    expect(b1.maxX - b1.minX).toBeGreaterThan(100);
    expect(b1.maxY - b1.minY).toBeGreaterThan(100);
    expect((b2.maxX - b2.minX) / (b1.maxX - b1.minX)).toBeCloseTo(2, 5);
    expect(ANCHORS.air.g[1]).toBeGreaterThan(ANCHORS.air.c[1]);
  });
  it("the rider does not move: the same place in every picture, while the air and the water change", () => {
    const { ctx, calls } = fakeContext();
    const s = createSky(ctx, sprites, colours);
    s.resize(1440, 900, 2);
    s.setScene(scene(1, 1100, 200));
    const riderDrawn = () => JSON.stringify(calls.filter((c) => c.fn === "translate" || c.fn === "rotate" || c.fn === "drawImage").map((c) => c.args));
    s.render(2, 1 / 60);
    const first = riderDrawn();
    const moving = () => JSON.stringify(calls.filter((c) => c.fn === "lineTo"));
    const airAndWater = moving();
    calls.length = 0;
    s.render(9.5, 1 / 60);
    expect(riderDrawn()).toEqual(first);
    expect(moving()).not.toEqual(airAndWater);
    expect(calls.filter((c) => c.fn === "drawImage")).toHaveLength(2);
    s.setScene(null);
    calls.length = 0;
    s.render(10, 1 / 60);
    expect(calls.filter((c) => c.fn === "drawImage")).toHaveLength(0);
  });
});
