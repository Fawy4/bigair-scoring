import { expect, test } from "./base";
import { createReportWorld, type ReportWorld } from "./report-world";

// RA1: every piece of text on the rider report reads at 4.5:1 or better against what is really behind it, in Daylight and in Dark, on a phone and on a wide screen.
// The page is photographed with its text made invisible, so the backdrop is exactly what a rider sees (card, tint, pill, sky lines); each text is then measured against the
// worst pixel of its own box. A throwaway event with made-up riders.
test.describe.configure({ mode: "serial" });
let w: ReportWorld;
test.beforeAll(async () => {
  test.setTimeout(300_000);
  w = await createReportWorld({ setting: "after_heat" });
});
test.afterAll(async () => {
  await w?.cleanup();
});

interface Item {
  text: string;
  tag: string;
  cls: string;
  size: number;
  weight: number;
  rgba: [number, number, number, number];
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What is on screen now: every text with its real colour (the page's own opacity included) and the box it fills. */
function collect(): Item[] {
  const parse = (c: string): [number, number, number, number] | null => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const out: Item[] = [];
  for (const el of document.querySelectorAll<HTMLElement | SVGElement>(".report *")) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && (n.textContent ?? "").trim()).map((n) => n.textContent!.trim()).join(" ");
    const isBox = el.tagName === "TEXTAREA";
    const text = el.tagName === "SELECT" ? ((el as HTMLSelectElement).selectedOptions[0]?.textContent ?? "") : isBox ? (el as HTMLTextAreaElement).placeholder : own;
    if (!text) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    // the box of the words themselves, not of the element around them (a swatch or a pill beside the words is not their backdrop)
    let r = el.getBoundingClientRect();
    if (isBox) r = new DOMRect(r.left + 10, r.top + 10, Math.min(r.width - 20, 140), 18); // the first line of grey words in the box
    else if (el.tagName !== "SELECT" && !(el instanceof SVGElement)) {
      const rg = document.createRange();
      const t = [...el.childNodes].find((n) => n.nodeType === 3 && (n.textContent ?? "").trim());
      if (t) {
        rg.selectNodeContents(t);
        const rr = rg.getBoundingClientRect();
        if (rr.width > 0) r = rr;
      }
    }
    if (r.width < 1 || r.height < 1 || r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) continue;
    const c = parse(el instanceof SVGElement ? cs.fill : isBox ? getComputedStyle(el, "::placeholder").color : cs.color);
    if (!c) continue;
    let opacity = 1;
    for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
    out.push({ text: text.slice(0, 44), tag: el.tagName.toLowerCase(), cls: String(el.getAttribute("class") ?? "").slice(0, 40), size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight), rgba: [c[0], c[1], c[2], c[3] * opacity], x: r.left, y: r.top, w: r.width, h: r.height });
  }
  return out;
}

/** The contrast of each item against the worst pixel of the photograph under its box. */
async function measure(args: { b64: string; items: Item[] }): Promise<Array<Item & { ratio: number; at: string }>> {
  const img = new Image();
  img.src = `data:image/png;base64,${args.b64}`;
  await img.decode();
  const cv = document.createElement("canvas");
  cv.width = img.width;
  cv.height = img.height;
  const g = cv.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const lum = (c: number[]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return args.items.map((it) => {
    const x = Math.max(0, Math.floor(it.x));
    const y = Math.max(0, Math.floor(it.y));
    const w = Math.max(1, Math.min(img.width - x, Math.ceil(it.w)));
    const h = Math.max(1, Math.min(img.height - y, Math.ceil(it.h)));
    const d = g.getImageData(x, y, w, h).data;
    let worst = Infinity;
    let at = "";
    for (let i = 0; i < d.length; i += 4 * 3) {
      const bg = [d[i], d[i + 1], d[i + 2]];
      const a = it.rgba[3];
      const fg = [0, 1, 2].map((k) => it.rgba[k] * a + bg[k] * (1 - a));
      const q = ratio(lum(fg), lum(bg));
      if (q < worst) {
        worst = q;
        at = `rgb(${bg.join(",")})`;
      }
    }
    return { ...it, ratio: Math.round(worst * 100) / 100, at };
  });
}

test("every text on the report reads at 4.5:1 or better, Daylight and Dark, 390 and 1280 px", async ({ browser }) => {
  test.setTimeout(600_000);
  const failures: string[] = [];
  for (const [width, height] of [[390, 844], [1280, 900]] as const) {
    for (const theme of ["day", "dark"] as const) {
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: theme === "dark" ? "dark" : "light" });
      await ctx.addInitScript((t) => window.localStorage.setItem("bigair.beach-theme", t), theme);
      const page = await ctx.newPage();
      await page.goto(`/e/${w.slug}/riders/${w.entry("Ana")}/report`);
      await expect(page.getByTestId("rider-report")).toBeVisible({ timeout: 60_000 });
      await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => undefined);
      await page.waitForTimeout(1500);
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      const all = new Map<string, Item & { ratio: number; at: string }>();
      for (let y = 0; y < total; y += height - 140) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        await page.waitForTimeout(300);
        const items = await page.evaluate(collect);
        const hide = await page.addStyleTag({ content: "*{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}svg text{fill:transparent!important}textarea::placeholder{color:transparent!important}select{color:transparent!important}" });
        const b64 = (await page.screenshot()).toString("base64");
        await hide.evaluate((el) => (el as Element).remove());
        for (const r of await page.evaluate(measure, { b64, items })) all.set(`${r.tag}|${r.cls}|${r.text}|${Math.round(r.rgba[0])}`, r);
      }
      const rows = [...all.values()];
      expect(rows.length).toBeGreaterThan(40);
      // the grey words of the notes boxes are measured too
      expect(rows.some((r) => r.tag === "textarea")).toBe(true);
      const lowest = [...rows].sort((a, b) => a.ratio - b.ratio).slice(0, 6).map((r) => `${r.ratio} ${r.tag}.${r.cls.split(" ")[0]} "${r.text.slice(0, 24)}"`);
      console.log(`  lowest: ${lowest.join(" | ")}`);
      const fails = rows.filter((r) => r.ratio < 4.5).sort((a, b) => a.ratio - b.ratio);
      console.log(`CONTRAST ${theme} ${width}: ${rows.length} texts, lowest ${Math.min(...rows.map((r) => r.ratio))}, failing ${fails.length}`);
      for (const f of fails) console.log(`  FAIL ${f.ratio} <${f.tag} class="${f.cls}"> ${f.size}px/${f.weight} "${f.text}" rgba(${f.rgba.map((n) => Math.round(n * 100) / 100).join(",")}) on ${f.at}`);
      failures.push(...fails.map((f) => `${theme} ${width}: ${f.ratio} ${f.tag}.${f.cls} "${f.text}"`));
      await ctx.close();
    }
  }
  expect(failures).toEqual([]);
});
