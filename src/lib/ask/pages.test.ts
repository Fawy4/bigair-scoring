import { describe, expect, it } from "vitest";
import { loadManual } from "@/lib/manual/load";
import { CORE_PAGES, pickPages, questionWords } from "./pages";

// Ask Sendbook: which manual pages go with a question. The /help search index decides; the dependency map and the errors page always go.
const manual = loadManual();

describe("pickPages", () => {
  it("always includes the two core pages, first", () => {
    for (const q of ["why is Hold grey", "how do I print the start list", "", "zzzz qqqq", "PIN"]) {
      const files = pickPages(manual, q).map((p) => p.file);
      expect(files.slice(0, 2)).toEqual([...CORE_PAGES]);
    }
  });

  it("adds at most 5 other pages, never a core page twice", () => {
    const files = pickPages(manual, "judge score heat publish rider PIN hold draw").map((p) => p.file);
    expect(files.length).toBeLessThanOrEqual(7);
    expect(new Set(files).size).toBe(files.length);
  });

  it("finds the console page for a question about the Hold button", () => {
    const files = pickPages(manual, "why is Hold grey").map((p) => p.file);
    expect(files).toContain("dependencies.md");
    expect(files.some((f) => f.startsWith("screens/console") || f === "event-day.md")).toBe(true);
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
    const extra = pages.slice(2).reduce((n, p) => n + p.source.length, 0);
    expect(extra).toBeLessThanOrEqual(20_000);
    expect(pages.slice(0, 2).map((p) => p.file)).toEqual([...CORE_PAGES]);
  });
});

describe("questionWords", () => {
  it("drops small words and keeps the ones that mean something", () => {
    expect(questionWords("Why is the Hold button grey?")).toEqual(["hold", "button", "grey"]);
  });
});
