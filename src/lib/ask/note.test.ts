import { describe, expect, it } from "vitest";
import { askNoteBody, noteRole } from "./note";

describe("askNoteBody", () => {
  it("says the verdict, then the question, the answer and the context", () => {
    const body = askNoteBody("down", "why is Hold grey", "Because no run order is active.", "Route: /head/x");
    expect(body.split("\n")).toEqual(["Ask Sendbook — not right", "Question: why is Hold grey", "Answer: Because no run order is active.", "Context: Route: /head/x"]);
  });
  it("stays within a note's 4 000 characters, shortening the answer", () => {
    const body = askNoteBody("up", "q".repeat(3000), "a".repeat(9000), "c".repeat(3000));
    expect(body.length).toBeLessThanOrEqual(4000);
    expect(body).toContain("…");
    expect(body.startsWith("Ask Sendbook — right")).toBe(true);
  });
});

describe("noteRole", () => {
  it("keeps a login's role and makes every seat an official", () => {
    expect(noteRole("organiser")).toBe("organiser");
    expect(noteRole("owner")).toBe("owner");
    expect(noteRole("judge")).toBe("official");
    expect(noteRole("head")).toBe("official");
  });
});
