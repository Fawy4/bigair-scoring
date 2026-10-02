import { describe, expect, it } from "vitest";
import { eventDatesInWords } from "./event-dates";

describe("event dates in words", () => {
  it("same month", () => expect(eventDatesInWords("2026-10-10", "2026-10-12")).toBe("10–12 Oct 2026"));
  it("one day", () => expect(eventDatesInWords("2026-10-10", "2026-10-10")).toBe("10 Oct 2026"));
  it("across months and years", () => {
    expect(eventDatesInWords("2026-10-30", "2026-11-02")).toBe("30 Oct – 2 Nov 2026");
    expect(eventDatesInWords("2026-12-30", "2027-01-02")).toBe("30 Dec 2026 – 2 Jan 2027");
  });
  it("missing dates say so", () => {
    expect(eventDatesInWords(null, null)).toBe("Dates not set");
    expect(eventDatesInWords("2026-10-10", null)).toBe("10 Oct 2026");
  });
});
