import { describe, expect, it } from "vitest";
import { askManual } from "./manual";
import { CORE_PAGES, pageForRoute, pickPages, questionWords } from "./pages";

// Ask Sendbook: which manual pages go with a question. The /help search index decides; the dependency map and the errors page always go.
const manual = askManual();

describe("pickPages", () => {
  it("always includes the dependency map and the errors page (and troubleshooting), first", () => {
    for (const q of ["why is Hold grey", "how do I print the start list", "", "zzzz qqqq", "PIN"]) {
      const files = pickPages(manual, q).map((p) => p.file);
      expect(files.slice(0, 3)).toEqual(["dependencies.md", "errors.md", "troubleshooting.md"]);
      expect(CORE_PAGES).toEqual(["dependencies.md", "errors.md", "troubleshooting.md"]);
    }
  });

  it("sends troubleshooting without its alphabetical index (the errors page has the same sentences)", () => {
    const t = pickPages(manual, "x").find((p) => p.file === "troubleshooting.md")!;
    expect(t.source).toContain("{#t-common}");
    expect(t.source).not.toContain("generated:index:start");
    expect(t.source.length).toBeLessThan(30_000);
  });

  it("adds at most 6 other pages, never a core page twice", () => {
    const files = pickPages(manual, "judge score heat publish rider PIN hold draw").map((p) => p.file);
    expect(files.length).toBeLessThanOrEqual(9);
    expect(new Set(files).size).toBe(files.length);
  });

  it("finds the console page for a question about the Hold button", () => {
    const files = pickPages(manual, "why is Hold grey").map((p) => p.file);
    expect(files).toContain("dependencies.md");
    expect(files.some((f) => f.startsWith("screens/console") || f === "event-day.md" || f === "screens/organiser-go-live.md")).toBe(true);
  });

  it("finds the officials page for a question about PINs", () => {
    const files = pickPages(manual, "where do I find the judges' PINs").map((p) => p.file);
    expect(files).toContain("screens/organiser-officials.md");
  });

  it("gives the page text and title with each page", () => {
    const [deps] = pickPages(manual, "hold");
    expect(deps.title).toMatch(/Dependency map/i);
    expect(deps.source).toContain("{#dep-hold}");
    expect(deps.anchor).toBe("page-dependencies");
  });

  it("keeps the picked pages under the size limit (the core pages are never cut)", () => {
    const pages = pickPages(manual, "settings troubleshooting error sentence grey", { maxChars: 20_000 });
    const extra = pages.slice(3).reduce((n, p) => n + p.source.length, 0);
    expect(extra).toBeLessThanOrEqual(20_000);
    expect(pages.slice(0, 3).map((p) => p.file)).toEqual([...CORE_PAGES]);
  });
});

describe("the page of the screen the person is on", () => {
  it("knows the console, the officials' screens and the organiser steps", () => {
    expect(pageForRoute("/head/11111111-1111-4111-8111-111111111111")).toBe("screens/console-laptop.md");
    expect(pageForRoute("/judge/x")).toBe("screens/judge.md");
    expect(pageForRoute("/spot/x?heat=y")).toBe("screens/spotter.md");
    expect(pageForRoute("/org/events/x/schedule")).toBe("screens/organiser-run-order.md");
    expect(pageForRoute("/org/events/x")).toBe("screens/organiser-go-live.md");
    expect(pageForRoute("/admin/ask")).toBe("ask-sendbook.md");
    expect(pageForRoute("/somewhere")).toBeNull();
  });
  it("goes first among the picked pages, after the core pages", () => {
    const files = pickPages(manual, "zzzz", { route: "/judge/x" }).map((p) => p.file);
    expect(files).toEqual(["dependencies.md", "errors.md", "troubleshooting.md", "screens/judge.md"]);
  });
});

describe("questionWords", () => {
  it("drops small words and keeps the ones that mean something", () => {
    expect(questionWords("Why is the Hold button grey?")).toEqual(["hold", "button", "grey"]);
  });
});
