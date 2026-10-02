import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildGenerated, migrationCodes } from "../../../scripts/manual/generated";
import { DivisionLiveSchema } from "@/lib/schemas/division-live";
import { EventSettingsSchema } from "@/lib/schemas/event-settings";
import { FORMAT_LABELS, SCORING_LABELS, copy, help, orgCopy } from "@/lib/ui-copy";
import { PRODUCT_VERSION } from "@/lib/product-version";
import { buildManual } from "./build";
import { renderMarkdown, slugify } from "./markdown";
import { MANUAL_PAGES } from "./pages";
import { refusalFor, refusals } from "./refusals";
import { searchManual } from "./search";
import { settingHref, settingHelps } from "./settings-lookup";

const DIR = path.join(process.cwd(), "docs", "manual");
const read = (f: string) => readFileSync(path.join(DIR, f), "utf8");
const manual = buildManual(MANUAL_PAGES.map((p) => ({ ...p, source: read(p.file) })));
const errorsMd = read("errors.md");
const settingsMd = read("settings.md");
/** A sentence as the errors table writes it: | inside a cell is escaped, line breaks become spaces. */
const asCell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();

describe("the Markdown renderer", () => {
  const opts = { idPrefix: "p--", link: (h: string) => `L:${h}`, image: (s: string) => `I:${s}` };
  it("renders headings with ids, fixed ids, tables with row anchors, lists, code, images and mermaid", () => {
    const r = renderMarkdown(
      ["# Title", "", "## Hold / Resume {#dep-hold}", "Text with **bold**, _italic_, *also italic*, `code|x` and [a link](x.md#y).", "", "| A | B |", "|---|---|", "| {#row-1} one | two \\| three |", "", "- item", "  - nested", "", "![alt](img/a.png)", "", "```mermaid", "flowchart TD", "  A --> B", "```"].join("\n"),
      opts,
    );
    expect(r.headings.map((h) => h.id)).toEqual(["p--title", "dep-hold"]);
    expect(r.html).toContain('<h3 id="dep-hold">');
    expect(r.html).toContain("<strong>bold</strong>");
    expect(r.html).toContain("<em>italic</em>");
    expect(r.html).toContain("<em>also italic</em>");
    expect(r.html).toContain("<code>code|x</code>");
    expect(r.html).toContain('<tr id="row-1"><td>one</td><td>two | three</td></tr>');
    expect(r.html).toContain("<ul><li>nested</li></ul>");
    expect(r.html).toContain('<img src="I:img/a.png" alt="alt"');
    expect(r.html).toContain('<pre class="mermaid" data-diagram>flowchart TD\n  A --&gt; B</pre>');
    expect(r.links).toEqual(["L:x.md#y"]);
    expect(r.sections.find((s) => s.id === "row-1")?.text).toBe("one · two | three");
  });
  it("escapes HTML in the text", () => {
    expect(renderMarkdown("a <script>x</script>", opts).html).toBe("<p>a &lt;script&gt;x&lt;/script&gt;</p>");
  });
  it("makes plain anchors", () => {
    expect(slugify("Hold / Resume at")).toBe("hold-resume-at");
  });
});

describe("the manual's pages", () => {
  it("every page has a title, a one-line summary and a “Last checked” line with a version not newer than the product", () => {
    const toNum = (v: string) => v.split(".").map(Number).reduce((a, n) => a * 1000 + n, 0);
    for (const p of manual.pages) {
      expect(p.title, p.file).not.toBe(p.file);
      expect(p.summary.length, p.file).toBeGreaterThan(20);
      const m = /^Last checked: \d{1,2} [A-Z][a-z]{2} \d{4} · Product version (\d+\.\d+\.\d+)$/.exec(p.checked);
      expect(m, `${p.file}: “${p.checked}”`).not.toBeNull();
      expect(toNum(m![1]), p.file).toBeLessThanOrEqual(toNum(PRODUCT_VERSION));
    }
  });
  it("every anchor is unique across the manual", () => {
    const all = manual.pages.flatMap((p) => [p.anchor, ...p.headings.map((h) => h.id)]).concat(manual.search.map((s) => s.id));
    const seen = new Set<string>();
    const dup = new Set<string>();
    for (const id of new Set(manual.pages.flatMap((p) => p.headings.map((h) => h.id)))) if (seen.has(id)) dup.add(id); else seen.add(id);
    expect([...dup]).toEqual([]);
    expect(all.length).toBeGreaterThan(100);
  });
  it("every link inside the manual points at an anchor that exists", () => {
    const broken = manual.links.filter((l) => l.startsWith("#") && !manual.ids.has(l.slice(1)));
    expect(broken).toEqual([]);
  });
  it("every picture exists in docs/manual/img", () => {
    const missing = [...new Set(manual.images)].filter((src) => !existsSync(path.join(DIR, src.replace(/^\/help\//, ""))));
    expect(missing).toEqual([]);
  });
  it("uses the house words (no banned word outside code)", () => {
    const BANNED = /\b(chips?|vests?|marks?|marked|marking|byes?|repechage|dingle|man-on-man|(winners?|losers?)['’]?\s+bracket|configure[sd]?|configuring|configuration|entity|entities|records?|recorded|RPC)\b/i;
    const offenders: string[] = [];
    for (const p of MANUAL_PAGES) {
      read(p.file)
        .split("\n")
        .forEach((line, i) => {
          const prose = line.replace(/`[^`]*`/g, "").replace(/\{#[^}]+\}/g, "").replace(/\]\([^)]*\)/g, "]");
          if (BANNED.test(prose)) offenders.push(`${p.file}:${i + 1}: ${prose.slice(0, 80)}`);
        });
    }
    expect(offenders).toEqual([]);
  });
  it("search finds the Hold row of the dependency map first for “grey”, and finds “Hold”", () => {
    expect(searchManual(manual.search, "grey")[0]?.id).toBe("dep-hold");
    expect(searchManual(manual.search, "Hold").length).toBeGreaterThan(3);
    expect(searchManual(manual.search, "")).toEqual([]);
  });
});

describe("the manual cannot drift from the product", () => {
  it("every refusal and error sentence of ui-copy.ts is in errors.md, word for word, with its anchor", () => {
    const all = refusals();
    expect(all.length).toBeGreaterThan(400);
    const missing = all.filter((r) => !errorsMd.includes(`{#${r.anchor}} “${asCell(r.text)}”`)).map((r) => `${r.path}: ${r.text}`);
    expect(missing).toEqual([]);
  });
  it("every code the database can raise is in errors.md", () => {
    const codes = migrationCodes();
    expect(codes.length).toBeGreaterThan(100);
    expect(codes.filter((c) => !errorsMd.includes(`\`${c}\``))).toEqual([]);
  });
  it("every sentence is recognised on screen, so its Learn more link goes to its own row", () => {
    for (const r of refusals()) {
      const hit = refusalFor(r.text.replace(/‹[^›]*›/g, "Pro Men"));
      expect(hit, r.path).not.toBeNull();
      expect(hit!.text.replace(/‹[^›]*›/g, "X") === r.text.replace(/‹[^›]*›/g, "X") || hit!.path === r.path || hit!.patterns.length > 0, r.path).toBe(true);
    }
    expect(refusalFor("Draw for Pro Men is not locked — lock it in the Draw step")?.path).toBe("liveErrors.codes.DRAW_NOT_LOCKED");
    expect(refusalFor("Could not do that: The run order is not on hold.")?.path).toBe("liveErrors.codes.NOT_ON_HOLD");
    expect(refusalFor("✖ nothing like this")).toBeNull();
  });
  it("every setting of the scoring, format, event and division schemas is in settings.md", () => {
    const anchors = [
      ...Object.entries(SCORING_LABELS).filter(([, l]) => l.help).map(([p]) => copy.manual.anchor.setting(`scoring.${p}`)),
      ...Object.entries(FORMAT_LABELS).filter(([, l]) => l.help).map(([p]) => copy.manual.anchor.setting(`format.${p}`)),
      ...Object.keys(help).map((k) => copy.manual.anchor.setting(k)),
      ...Object.keys(orgCopy.settings.dials).map((k) => copy.manual.anchor.setting(`dial.${k}`)),
      ...Object.keys(orgCopy.settings.advanced).map((k) => copy.manual.anchor.setting(`dial.${k}`)),
      ...settingHelps().map((h) => h.anchor),
    ];
    expect(anchors.filter((a) => !settingsMd.includes(`{#${a}}`))).toEqual([]);
    // every stored field of the Event step and of a division's live screens is named
    const eventFields = Object.keys(EventSettingsSchema.shape).filter((k) => k !== "judgeGraceSec" && k !== "identification");
    expect(eventFields.filter((k) => !settingsMd.includes(`settings.${k}`))).toEqual([]);
    const liveFields = Object.keys(DivisionLiveSchema.shape);
    expect(liveFields.filter((k) => !settingsMd.includes(`live_settings.${k}`))).toEqual([]);
  });
  it("every “?” of the organiser screens opens its own row of settings.md", () => {
    // two settings can share their words (for example the Impression / Variety score in Simple and in More settings): either row explains it
    for (const h of settingHelps()) {
      const anchor = settingHref(h.text).replace("/help#", "");
      expect(settingHelps().find((x) => x.anchor === anchor)?.text, h.key).toBe(h.text);
    }
    expect(settingHref("words no help has")).toBe("/help#page-settings");
  });
  it("the generated tables are up to date (run npm run manual:generate)", () => {
    for (const [file, blocks] of Object.entries(buildGenerated())) {
      const text = read(file);
      for (const [name, body] of Object.entries(blocks)) {
        const start = `<!-- generated:${name}:start -->`;
        const a = text.indexOf(start);
        const b = text.indexOf(`<!-- generated:${name}:end -->`);
        expect(a, `${file} ${name}`).toBeGreaterThan(-1);
        expect(text.slice(a + start.length, b).trim(), `${file}: “${name}” is out of date — run npm run manual:generate`).toBe(body.trim());
      }
    }
  });
});
