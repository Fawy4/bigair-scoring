import { describe, expect, it } from "vitest";
import { contextText, sanitizeAskContext, scrubText } from "./context";

// Ask Sendbook: what the client collects about the screen. Whatever a page puts in, only the whitelisted fields leave the browser, and none of them may
// carry a PIN, an e-mail address or a score.
const EVENT = "11111111-1111-4111-8111-111111111111";
const HEAT = "22222222-2222-4222-8222-222222222222";

const dirty = {
  route: "/head/" + EVENT + "?pin=482913&email=a@b.com",
  role: "organiser",
  eventId: EVENT,
  eventName: "Arrow Big Air",
  divisionId: null,
  heatId: HEAT,
  heatStatus: "scheduled",
  checklist: [
    { label: "Pro Men: 12 riders", state: "done" },
    { label: "Seat Judge 2 has no PIN — write to judge2@example.com, PIN 482913", state: "attention", pin: "482913" },
  ],
  lastRefusal: "No active run order — create one in Run order & timetable.",
  refusals: ["The run order is already on hold.", "Ask ops@arrow.example for the PIN 774411"],
  productVersion: "0.9.1",
  // never allowed, whatever a page tries
  pin: "482913",
  pins: ["482913"],
  email: "owner@example.com",
  scores: [{ judge: "Judge 2", score: 7.5 }],
  otherJudgeScores: { j2: 8 },
  judges: [{ name: "Judge 2", email: "judge2@example.com" }],
  seat: { pin_hash: "x", qr_token_hash: "y" },
};

describe("sanitizeAskContext", () => {
  const ctx = sanitizeAskContext(dirty);
  const json = JSON.stringify(ctx);

  it("keeps only the whitelisted fields", () => {
    expect(Object.keys(ctx).sort()).toEqual(["checklist", "divisionId", "eventId", "eventName", "heatId", "heatStatus", "lastRefusal", "productVersion", "refusals", "role", "route"].sort());
    expect(ctx.checklist[1]).toEqual({ label: expect.any(String), state: "attention" });
  });

  it("never includes a PIN, an e-mail address or a score", () => {
    expect(json).not.toMatch(/482913|774411/);
    expect(json).not.toMatch(/@/);
    expect(json).not.toMatch(/score/i);
    expect(json).not.toMatch(/pin_hash|qr_token/);
  });

  it("keeps the address without its query", () => {
    expect(ctx.route).toBe(`/head/${EVENT}`);
  });

  it("keeps the sentences the person can see", () => {
    expect(ctx.lastRefusal).toBe("No active run order — create one in Run order & timetable.");
    expect(ctx.refusals).toContain("The run order is already on hold.");
  });

  it("drops ids that are not ids and states that are not states", () => {
    const c = sanitizeAskContext({ route: "/org", eventId: "'; drop table", heatId: 7, checklist: [{ label: "x", state: "hacked" }] });
    expect(c.eventId).toBeNull();
    expect(c.heatId).toBeNull();
    expect(c.checklist).toEqual([]);
  });

  it("accepts nothing at all", () => {
    const c = sanitizeAskContext(undefined);
    expect(c.route).toBe("/");
    expect(c.checklist).toEqual([]);
    expect(c.refusals).toEqual([]);
  });

  it("caps long lists and long sentences", () => {
    const c = sanitizeAskContext({ route: "/org", refusals: Array.from({ length: 50 }, (_, i) => `Sentence ${i} `.repeat(100)), checklist: Array.from({ length: 80 }, () => ({ label: "x", state: "done" })) });
    expect(c.refusals.length).toBeLessThanOrEqual(10);
    expect(c.refusals[0].length).toBeLessThanOrEqual(300);
    expect(c.checklist.length).toBeLessThanOrEqual(30);
  });
});

describe("scrubText", () => {
  it("removes e-mail addresses and six-digit numbers (PINs)", () => {
    expect(scrubText("Write to a.b+c@x.co.uk with PIN 123456")).toBe("Write to [e-mail removed] with PIN [number removed]");
  });
  it("keeps times, dates, heat numbers and the version", () => {
    expect(scrubText("Heat 12 at 16:05 on 8 October 2026, version 0.9.1")).toBe("Heat 12 at 16:05 on 8 October 2026, version 0.9.1");
  });
});

describe("contextText", () => {
  it("writes the context as plain lines for the prompt, with the server's names", () => {
    const text = contextText(sanitizeAskContext(dirty), { role: "organiser", eventName: "Demo Big Air", divisionName: null, heatLabel: "Heat 3", heatStatus: "scheduled" });
    expect(text).toContain("Role: organiser");
    expect(text).toContain("Event: Demo Big Air");
    expect(text).toContain("Heat: Heat 3 (scheduled)");
    expect(text).toContain("Last refusal sentence on this page: No active run order — create one in Run order & timetable.");
    expect(text).toContain("[attention] Seat Judge 2 has no PIN");
    expect(text).not.toMatch(/482913|@/);
  });
});
