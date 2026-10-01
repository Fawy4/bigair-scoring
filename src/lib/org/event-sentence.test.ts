import { describe, expect, it } from "vitest";
import { eventSentence } from "./event-sentence";

describe("the Event step's sentence", () => {
  const base = { name: "Arrow Big Air", start: "2026-10-02", end: "2026-10-04", location: "El Gouna, Egypt", timezone: "Africa/Cairo", lycras: true, live: false, results: false };
  it("says what the event is, when, where, the time zone, lycras and what the public sees", () => {
    expect(eventSentence(base)).toBe("Arrow Big Air · 2–4 Oct 2026 · El Gouna, Egypt · times in Africa/Cairo · coloured lycras · nothing public until the head judge publishes");
  });
  it("names the public choices that are on", () => {
    expect(eventSentence({ ...base, lycras: false, live: true, results: true })).toContain("riders called by name");
    expect(eventSentence({ ...base, live: true })).toContain("live scores shown during heats");
    expect(eventSentence({ ...base, results: true })).toContain("results shown when a heat is published");
    expect(eventSentence({ ...base, live: true, results: true })).toContain("live scores shown during heats and results shown when a heat is published");
  });
  it("leaves out what is not filled in yet", () => {
    expect(eventSentence({ ...base, name: "", location: "", start: "", end: "" })).toBe("New event · dates not set · times in Africa/Cairo · coloured lycras · nothing public until the head judge publishes");
  });
});
