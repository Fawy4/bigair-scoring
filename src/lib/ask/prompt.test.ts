import { describe, expect, it } from "vitest";
import { buildAskPrompt, lastTurns, requestParams } from "./prompt";
import { decodeLines, encodeEvent, findCitation } from "./stream";

// Ask Sendbook: the prompt is (a) instructions, (b) manual pages, (c) live context, (d) the last 6 turns, (e) the question — stable parts cached.
const page = (file: string, source: string) => ({ file, title: file, anchor: `page-${file.replace(".md", "")}`, source });

describe("buildAskPrompt", () => {
  const p = buildAskPrompt({
    instructions: "You are Sendbook's support agent.",
    pages: [page("dependencies.md", "DEPS"), page("errors.md", "ERRORS"), page("screens/console-laptop.md", "CONSOLE")],
    corePages: 2,
    context: "Route: /head/x",
    history: [
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
    ],
    question: "why is Hold grey",
  });

  it("puts the parts in order: instructions, core pages, picked pages, live context", () => {
    const texts = p.system.map((b) => b.text);
    expect(texts[0]).toBe("You are Sendbook's support agent.");
    expect(texts[1]).toContain("DEPS");
    expect(texts[1]).toContain("ERRORS");
    expect(texts[1].indexOf("DEPS")).toBeLessThan(texts[1].indexOf("ERRORS"));
    expect(texts[2]).toContain("CONSOLE");
    expect(texts[3]).toContain("Route: /head/x");
  });

  it("caches the stable parts and never the live context", () => {
    expect(p.system[0].cache_control).toBeUndefined();
    expect(p.system[1].cache_control).toEqual({ type: "ephemeral" });
    expect(p.system[2].cache_control).toEqual({ type: "ephemeral" });
    expect(p.system[3].cache_control).toBeUndefined();
  });

  it("names each page with its /help link so the answer can cite it", () => {
    expect(p.system[1].text).toContain("/help#page-dependencies");
  });

  it("ends with the conversation, then the question", () => {
    expect(p.messages).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "why is Hold grey" },
    ]);
  });
});

describe("lastTurns", () => {
  const turns = Array.from({ length: 10 }, (_, i) => ({ role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant", content: `m${i}` }));
  it("keeps the last 6 turns and starts with a question", () => {
    const kept = lastTurns(turns);
    expect(kept.length).toBeLessThanOrEqual(6);
    expect(kept[0].role).toBe("user");
    expect(kept.at(-1)?.content).toBe("m9");
  });
  it("drops empty answers (a stream that failed) and a trailing question with no answer", () => {
    expect(lastTurns([{ role: "user", content: "q" }, { role: "assistant", content: "" }, { role: "user", content: "q2" }])).toEqual([]);
  });
  it("caps each turn's length", () => {
    expect(lastTurns([{ role: "user", content: "x".repeat(10_000) }, { role: "assistant", content: "ok" }])[0].content.length).toBeLessThanOrEqual(4000);
  });
});

describe("requestParams", () => {
  it("asks Sonnet for a quick answer (low effort)", () => {
    expect(requestParams("claude-sonnet-5-5")).toMatchObject({ output_config: { effort: "low" } });
  });
  it("sends no effort to Haiku 4.5 (it refuses the field)", () => {
    expect(requestParams("claude-haiku-4-5")).not.toHaveProperty("output_config");
  });
});

describe("stream lines", () => {
  it("encodes and decodes events, one JSON object per line, across chunk borders", () => {
    const wire = encodeEvent({ type: "text", text: "Hold is " }) + encodeEvent({ type: "text", text: "grey." }) + encodeEvent({ type: "done", logId: "abc", cite: null, model: "m" });
    const first = decodeLines("", wire.slice(0, 10));
    const second = decodeLines(first.rest, wire.slice(10));
    expect([...first.events, ...second.events]).toEqual([
      { type: "text", text: "Hold is " },
      { type: "text", text: "grey." },
      { type: "done", logId: "abc", cite: null, model: "m" },
    ]);
    expect(second.rest).toBe("");
  });
  it("skips a line that is not valid JSON", () => {
    expect(decodeLines("", "nonsense\n").events).toEqual([]);
  });
});

describe("findCitation", () => {
  const anchors = new Map([
    ["dep-hold", "Hold (wind hold)"],
    ["page-dependencies", "Dependency map"],
  ]);
  it("finds the first /help link the answer gives that the manual knows", () => {
    expect(findCitation("See [Unknown](/help#nope) and [Hold](/help#dep-hold).", anchors)).toEqual({ href: "/help#dep-hold", title: "Hold (wind hold)" });
  });
  it("accepts a full address too", () => {
    expect(findCitation("Manual: https://x.vercel.app/help#page-dependencies", anchors)).toEqual({ href: "/help#page-dependencies", title: "Dependency map" });
  });
  it("reads the instructions' form “(Manual: Page › Section)” against the real manual", async () => {
    const { askManual } = await import("./manual");
    const m = askManual();
    expect(findCitation("…and press Activate this plan.\n(Manual: Dependency map › Hold)", m)).toEqual({ href: "/help#dep-hold", title: expect.stringMatching(/^Dependency map › Hold/) });
    expect(findCitation("(Manual: Dependency map › Start heat)", m)?.href).toBe("/help#dep-start-heat");
    expect(findCitation("(Manual: Head judge console on a laptop)", m)?.href).toBe("/help#page-screens-console-laptop");
    expect(findCitation("(Manual: Troubleshooting › Something that is not there)", m)?.href).toBe("/help#page-troubleshooting");
    expect(findCitation("(Manual: A page that does not exist › Hold)", m)).toBeNull();
  });
  it("is null when nothing is cited", () => {
    expect(findCitation("No link here.", anchors)).toBeNull();
  });
});
