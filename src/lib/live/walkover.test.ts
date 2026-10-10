// Console – Walkover and absent riders: the small pure helpers (which heat is a walkover, how a rider who did not ride reads, the audit sentence).
import { describe, expect, it } from "vitest";
import { copy } from "@/lib/ui-copy";
import { runLine } from "./run-line";
import { didNotStartBreakdown, heatShortTitle, isWalkoverHeat, meaningfulReason, noRideText, noRideWord, walkoverBreakdown, walkoverSentence } from "./walkover";

const T = "2026-10-09T12:00:00Z";

describe("a walkover heat is told by its times", () => {
  it("published and started = ended at one instant", () => {
    expect(isWalkoverHeat({ status: "published", started_at: T, ended_at: T })).toBe(true);
  });
  it("a ridden heat has a length", () => {
    expect(isWalkoverHeat({ status: "published", started_at: T, ended_at: "2026-10-09T12:10:00Z" })).toBe(false);
  });
  it("a heat that has not started, or is not published, is not one", () => {
    expect(isWalkoverHeat({ status: "scheduled", started_at: null, ended_at: null })).toBe(false);
    expect(isWalkoverHeat({ status: "ended", started_at: T, ended_at: T })).toBe(false);
  });
});

describe("how a rider who did not ride reads", () => {
  it("Walkover, Did not start and Out of the event come from the stored status", () => {
    expect(noRideText(noRideWord(walkoverBreakdown())!)).toBe("Walkover");
    expect(noRideText(noRideWord(didNotStartBreakdown(false))!)).toBe("Did not start");
    expect(noRideText(noRideWord(didNotStartBreakdown(true))!)).toBe("Out of the event");
  });
  it("a rider with a score has no such word", () => {
    expect(noRideWord({ status: "ok" })).toBeNull();
    expect(noRideWord(null)).toBeNull();
  });
});

describe("the audit sentence", () => {
  it("names who, the heat, who goes through and who did not start, with the reason", () => {
    expect(walkoverSentence({ who: "head", heat: heatShortTitle("R3", 11), winner: "Adam Arrow", others: [{ name: "Mariam Graff", outOfEvent: false, reason: "injured" }] })).toBe(
      "Head judge gave a walkover in R3 · H11: Adam Arrow goes through; Mariam Graff did not start (injured)",
    );
  });
  it("an organiser, a rider out of the event, no reason", () => {
    expect(walkoverSentence({ who: "organiser", heat: "R2 · H5", winner: "Sam", others: [{ name: "Lee", outOfEvent: true, reason: null }] })).toBe("Organiser gave a walkover in R2 · H5: Sam goes through; Lee is out of the event");
  });
  it("nobody left", () => {
    expect(walkoverSentence({ who: "head", heat: "R2 · H5", winner: null, others: [{ name: "Sam", outOfEvent: false, reason: null }, { name: "Lee", outOfEvent: true, reason: "Withdrew" }] })).toBe("Head judge finished R2 · H5 with no rider: Sam did not start; Lee is out of the event (Withdrew)");
  });
  it("'no reason given' is not a reason", () => {
    expect(meaningfulReason("no reason given")).toBeNull();
    expect(meaningfulReason("  Injured ")).toBe("Injured");
  });
});

describe("the run order line", () => {
  const heat = { name: null, number: 11, number_suffix: null, started_at: T };
  it("a walkover reads 'Walkover' with the time it was given", () => {
    expect(runLine({ round: { name: "Round 3", short_name: "R3" }, heat, startedHhmm: "14:05", estimatedHhmm: null, held: false, statusWord: "Published", walkover: true })).toBe("R3 · H11 · Walkover · 14:05");
  });
  it("a heat that was ridden reads as before", () => {
    expect(runLine({ round: { name: "Round 3", short_name: "R3" }, heat, startedHhmm: "14:05", estimatedHhmm: null, held: false, statusWord: "Published" })).toBe("R3 · H11 · started 14:05 · Published");
  });
  it("uses only words from the copy file", () => {
    expect(copy.walkover.runOrder("14:05")).toBe("Walkover · 14:05");
  });
});
