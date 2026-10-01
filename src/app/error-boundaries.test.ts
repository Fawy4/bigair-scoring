// Every live page and every organiser step has its own error boundary (fix-run-order-duration): a failing page shows a one-line reason and a way back,
// never the blank "Application error". The admin pages already had theirs.
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const APP = join(process.cwd(), "src", "app");

function pagesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return pagesUnder(full);
    return name === "page.tsx" ? [full] : [];
  });
}

/** The nearest error.tsx at or above the page, not counting the site-wide one at the top of src/app. */
function boundaryOf(page: string): string | null {
  for (let dir = dirname(page); dir !== APP; dir = dirname(dir)) if (existsSync(join(dir, "error.tsx"))) return relative(APP, dir) || ".";
  return null;
}

const COVERED = ["head", "judge", "spot", "seat", `org${sep}(console)`, "e", "admin"];

describe("error boundaries", () => {
  const pages = pagesUnder(APP).filter((p) => COVERED.some((c) => relative(APP, p).startsWith(c + sep)));

  it("finds the live pages and organiser steps it is meant to check", () => {
    const names = pages.map((p) => relative(APP, p));
    expect(names.some((n) => n.startsWith(`head${sep}`))).toBe(true);
    expect(names.some((n) => n.startsWith(`judge${sep}`))).toBe(true);
    expect(names.some((n) => n.startsWith(`spot${sep}`))).toBe(true);
    expect(names.filter((n) => n.includes(`events${sep}[id]`)).length).toBeGreaterThanOrEqual(8);
  });

  it.each(pages.map((p) => [relative(APP, p), p]))("%s has its own boundary", (_name, page) => {
    expect(boundaryOf(page)).not.toBeNull();
  });

  it("the site-wide net exists too", () => {
    expect(existsSync(join(APP, "error.tsx"))).toBe(true);
  });
});
