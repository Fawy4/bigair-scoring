import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCT_VERSION } from "@/lib/product-version";
import { checkKey, compareVersions, newestFirst, parseReleases, readReleaseStatus, releaseAnchor, releaseProgress } from "./releases";

const source = readFileSync(path.join(process.cwd(), "docs", "RELEASES.md"), "utf8");
const releases = parseReleases(source);
const changelog = readFileSync(path.join(process.cwd(), "docs", "manual", "changelog.md"), "utf8");

describe("the releases file (docs/RELEASES.md)", () => {
  it("has an entry for package.json's version: every pull request raises the version and adds its entry", () => {
    expect(releases.map((r) => r.version), `docs/RELEASES.md has no entry for ${PRODUCT_VERSION}: add one at the top`).toContain(PRODUCT_VERSION);
  });
  it("the newest entry is package.json's version, and it is at the top", () => {
    expect(releases[0]?.version).toBe(PRODUCT_VERSION);
    expect(newestFirst(releases)[0]?.version).toBe(PRODUCT_VERSION);
  });
  it("is newest first, with each version once", () => {
    const versions = releases.map((r) => r.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions).toEqual(newestFirst(releases).map((r) => r.version));
  });
  it("every entry is complete: heading, date, PR number, What changed, Known issues", () => {
    expect(releases.filter((r) => r.problems.length).map((r) => `${r.version}: ${r.problems.join("; ")}`)).toEqual([]);
  });
  it("each pull request has one entry, and every merged one before the file existed (#1–#25, #24 still open) is there", () => {
    const prs = releases.map((r) => r.pr);
    expect(new Set(prs).size).toBe(prs.length);
    for (const n of Array.from({ length: 25 }, (_, i) => i + 1).filter((n) => n !== 24)) expect(prs, `#${n}`).toContain(n);
  });
  it("the current version has 3 to 8 checks a non-developer can do", () => {
    const current = releases.find((r) => r.version === PRODUCT_VERSION)!;
    expect(current.checks.length).toBeGreaterThanOrEqual(3);
    expect(current.checks.length).toBeLessThanOrEqual(8);
  });
  it("the manual's changelog links each of its versions to the release entry", () => {
    const versions = [...changelog.matchAll(/^## (\d+\.\d+\.\d+) /gm)].map((m) => m[1]);
    expect(versions).toContain(PRODUCT_VERSION);
    for (const v of versions) {
      expect(releases.map((r) => r.version), `changelog ${v}`).toContain(v);
      expect(changelog, `changelog ${v}`).toContain(`(/admin/releases#${releaseAnchor(v)})`);
    }
  });
});

describe("reading an entry", () => {
  const sample = [
    "# Releases",
    "intro",
    "## 0.10.1 — 4 Oct 2026 {#release-0-10-1}",
    "PR: #30",
    "### What changed",
    "- Fix: something",
    "### What to test",
    "- [ ] Open the page: it loads",
    "- [x] Tap **Save**: it saves",
    "### Known issues",
    "- None known.",
    "## 0.9.0 — 2 October {#release-0-9}",
    "### What to test",
    "Open the page",
  ].join("\n");
  const [a, b] = parseReleases(sample);
  it("reads the version, date, PR, sections and checks", () => {
    expect(a).toMatchObject({ version: "0.10.1", date: "4 Oct 2026", anchor: "release-0-10-1", pr: 30, changed: "- Fix: something", knownIssues: "- None known.", problems: [] });
    expect(a.checks.map((c) => c.text)).toEqual(["Open the page: it loads", "Tap **Save**: it saves"]);
  });
  it("says what is wrong with an incomplete entry", () => {
    expect(b.problems).toEqual([
      "the anchor must be {#release-0-9-0}",
      "the date “2 October” must read like 3 Oct 2026",
      "a check must be one line starting “- [ ] ”: “Open the page”",
      "“What changed” is empty",
      "“Known issues” is missing (write “None known.”)",
      "the line “PR: #‹number›” is missing",
    ]);
  });
  it("a check's key follows its words, not spaces or capitals", () => {
    expect(checkKey("Open the  page")).toBe(checkKey("open the page"));
    expect(checkKey("Open the page")).not.toBe(checkKey("Open the pages"));
    expect(checkKey("x")).toMatch(/^[a-z0-9]{1,7}$/);
  });
  it("orders versions by number, not by text", () => {
    expect(["0.9.1", "0.10.0", "0.1.21", "1.0.0"].sort(compareVersions)).toEqual(["1.0.0", "0.10.0", "0.9.1", "0.1.21"]);
  });
});

describe("progress of a version", () => {
  const [entry] = parseReleases("## 1.2.3 — 1 Jan 2027 {#release-1-2-3}\nPR: #1\n### What changed\n- a\n### What to test\n- [ ] one\n- [ ] two\n- [ ] three\n### Known issues\n- None known.");
  const tick = (text: string, version = "1.2.3") => ({ version, key: checkKey(text), at: "2027-01-01T10:00:00Z", by: "owner@example.com" });
  it("counts the ticks of the file's checks only (a reworded check is a new one) and says who marked it tested", () => {
    expect(releaseProgress("1.2.3", [entry], [tick("one"), tick("two"), tick("old words"), tick("three", "1.2.2")], [])).toEqual({ version: "1.2.3", hasEntry: true, done: 2, total: 3, tested: null });
    const p = releaseProgress("1.2.3", [entry], [], [{ version: "1.2.3", at: "2027-01-02T10:00:00Z", by: "owner@example.com", total: 3 }]);
    expect(p.tested).toEqual({ at: "2027-01-02T10:00:00Z", by: "owner@example.com" });
  });
  it("a version with no entry has nothing to tick", () => {
    expect(releaseProgress("9.9.9", [entry], [], [])).toEqual({ version: "9.9.9", hasEntry: false, done: 0, total: 0, tested: null });
  });
  it("reads the database's answer and leaves out anything unexpected", () => {
    expect(readReleaseStatus(null)).toEqual({ ticks: [], signoffs: [] });
    expect(readReleaseStatus({ ticks: [{ version: "1.2.3", key: "k", at: "t", by: null }, { version: 1 }], signoffs: [{ version: "1.2.3", at: "t", by: "a", total: 3 }, {}] })).toEqual({
      ticks: [{ version: "1.2.3", key: "k", at: "t", by: null }],
      signoffs: [{ version: "1.2.3", at: "t", by: "a", total: 3 }],
    });
  });
});
