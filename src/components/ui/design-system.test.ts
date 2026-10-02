import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import config from "../../../tailwind.config";

// Phase 7a-2, step 1: the base components and the global styles are the approved look of /design/organiser: a 1 px frame in the muted colour (never black),
// 8 px controls and 12 px cards, semibold headings and nothing heavier, controls 40 px (44 on touch, 48 with Large), one accent for primary / selected / focus.
const dir = "src/components/ui";
const files = readdirSync(dir).filter((f) => /\.tsx$/.test(f));
const css = readFileSync("src/app/globals.css", "utf8");
const consoleCss = css.slice(0, css.indexOf("/* Printing"));

describe("base components (components/ui)", () => {
  it("has every base component", () => {
    for (const name of ["button", "input", "select", "textarea", "checkbox", "tabs", "card", "badge", "table", "dialog", "banner", "label", "toast"]) expect(files, name).toContain(`${name}.tsx`);
  });
  it.each(files)("%s: no thick or black frame, no weight above semibold, no shadow, no fixed tall controls", (f) => {
    const src = readFileSync(`${dir}/${f}`, "utf8");
    expect(src.match(/\bborder-[2-8]\b|border-\[#|\bborder-black\b/g) ?? [], "frames are 1 px in a token colour").toEqual([]);
    expect(src.match(/\bfont-(bold|extrabold|black)\b/g) ?? [], "headings are semibold").toEqual([]);
    expect(src.match(/\bshadow(-\w+)?\b/g) ?? [], "no shadow").toEqual([]);
    expect(src.match(/\b(h|min-h)-(12|14|16)\b/g) ?? [], "controls take their height from --org-ctl").toEqual([]);
    expect(src.match(/#[0-9a-fA-F]{3,6}\b/g) ?? [], "colours come from the beach tokens").toEqual([]);
  });
  it.each(["button", "input", "select", "textarea", "tabs"])("%s sits on the control height (40 px, 44 on touch, 48 with Large)", (name) => {
    expect(readFileSync(`${dir}/${name}.tsx`, "utf8")).toContain("var(--org-ctl)");
  });
  it("the primary button is the accent fill", () => {
    expect(readFileSync(`${dir}/button.tsx`, "utf8")).toMatch(/default:\s*"[^"]*bg-primary[^"]*text-primary-foreground/);
  });
  it("cards have 12–16 px corners (rounded-card) and a 1 px line; controls have 8 px", () => {
    expect(readFileSync(`${dir}/card.tsx`, "utf8")).toMatch(/rounded-card border border-beach-line/);
    for (const name of ["button", "input", "select", "textarea"]) expect(readFileSync(`${dir}/${name}.tsx`, "utf8"), name).toContain("rounded-[8px]");
  });
  it("a number box is as wide as its digits and right-aligned", () => {
    const src = readFileSync(`${dir}/input.tsx`, "utf8");
    expect(src).toMatch(/type === "number"/);
    expect(src).toContain("text-right");
    expect(src).not.toMatch(/type === "number"[^)]*\bw-full\b/);
  });
  it("a banner and a badge are a thin frame, an icon or words: never a solid coloured fill", () => {
    for (const name of ["banner", "badge"]) expect(readFileSync(`${dir}/${name}.tsx`, "utf8").match(/\bbg-(beach-)?(crash|destructive|primary|accent|outlier|failed|yellow|amber)\b/g) ?? [], name).toEqual([]);
  });
});

describe("global tokens", () => {
  it("the shadcn colour names point at the beach tokens, so base components and /design cannot drift apart", () => {
    const colors = (config.theme?.extend?.colors ?? {}) as Record<string, unknown>;
    const flat = JSON.stringify({ ...colors, beach: undefined });
    expect(flat).not.toMatch(/hsl\(/);
    expect(colors.primary).toEqual({ DEFAULT: "var(--beach-accent)", foreground: "var(--beach-on-accent)" });
    expect(colors.border).toBe("var(--beach-line)");
    expect(colors.input).toBe("var(--beach-border)");
    expect(colors.ring).toBe("var(--beach-focus)");
  });
  it("the beach tokens are also on :root, so a page outside an organiser screen has the same look", () => {
    expect(css).toMatch(/:root,\s*\.beach-day\s*\{/);
    expect(css).toMatch(/:root,\s*\.beach-text-normal\s*\{/);
  });
  it("controls are 40 px, 44 on a touch screen", () => {
    expect(css).toMatch(/--org-ctl:\s*40px/);
    expect(css).toMatch(/@media \(pointer: coarse\)\s*\{\s*:root\s*\{\s*--org-ctl:\s*44px/);
  });
  it("the organiser area styles have no black frame, no 2 px frame, no 48 px minimum, no weight above 600 and no fixed white", () => {
    expect(consoleCss.match(/border(-width)?:\s*[2-9]px/g) ?? []).toEqual([]);
    expect(consoleCss.match(/(color|background|border-color|border):[^;]*#[0-9a-f]{3,6}\b/gi) ?? [], "colours are beach tokens").toEqual([]);
    expect(consoleCss).not.toMatch(/min-height:\s*48px/);
    expect(consoleCss.match(/font-weight:\s*[78]00/g) ?? []).toEqual([]);
  });
  it("the primary .btn is the accent, not black", () => {
    expect(consoleCss).toMatch(/\.btn-primary\s*\{[^}]*background:\s*var\(--beach-accent\)/);
  });
});
