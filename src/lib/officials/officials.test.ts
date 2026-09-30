import { describe, expect, it } from "vitest";
import { decryptPin, encryptPin, seatPinKey } from "./pin-crypto";
import { panelShortfalls } from "./panel-check";
import { joinAddress, shareLink, shareText } from "./share";
import { heartbeatState } from "./last-seen";

const key = seatPinKey({ SUPABASE_SERVICE_ROLE_KEY: "service-key-for-tests" });

describe("PIN encryption (so 'Show PIN' and 'Print cards' can work)", () => {
  it("round-trips a PIN", () => {
    expect(decryptPin(encryptPin("048213", key), key)).toBe("048213");
  });
  it("uses a new random value every time, so equal PINs do not look equal in the database", () => {
    expect(encryptPin("111111", key)).not.toBe(encryptPin("111111", key));
  });
  it("does not contain the PIN in the stored text", () => {
    expect(encryptPin("482913", key)).not.toContain("482913");
  });
  it("a wrong key or a damaged value gives null, never a wrong PIN", () => {
    const blob = encryptPin("123456", key);
    expect(decryptPin(blob, seatPinKey({ SUPABASE_SERVICE_ROLE_KEY: "another" }))).toBeNull();
    expect(decryptPin(blob.slice(0, -4) + "AAAA", key)).toBeNull();
    expect(decryptPin("not base64 at all", key)).toBeNull();
    expect(decryptPin("", key)).toBeNull();
  });
  it("the key comes from SEAT_PIN_KEY when it is set, else from the service key, and fails loudly with neither", () => {
    expect(seatPinKey({ SEAT_PIN_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "b" }).equals(seatPinKey({ SEAT_PIN_KEY: "a" }))).toBe(true);
    expect(seatPinKey({ SEAT_PIN_KEY: "a" }).equals(seatPinKey({ SUPABASE_SERVICE_ROLE_KEY: "a" }))).toBe(false);
    expect(() => seatPinKey({})).toThrow();
  });
  it("refuses a PIN that is not six digits", () => {
    expect(() => encryptPin("12345", key)).toThrow();
  });
});

describe("panel check (warn, never block)", () => {
  it("says which division is short and by how many", () => {
    expect(panelShortfalls([{ name: "Pro Men", minJudges: 3, assigned: 2 }])).toEqual(["Pro Men needs 3 judges, 2 assigned"]);
  });
  it("is silent when the division has enough judges or more", () => {
    expect(panelShortfalls([{ name: "Pro Men", minJudges: 3, assigned: 3 }, { name: "Women", minJudges: 3, assigned: 5 }])).toEqual([]);
  });
  it("uses singular words for one judge", () => {
    expect(panelShortfalls([{ name: "U16", minJudges: 1, assigned: 0 }])).toEqual(["U16 needs 1 judge, 0 assigned"]);
  });
  it("reports every short division, in order", () => {
    expect(panelShortfalls([{ name: "A", minJudges: 3, assigned: 0 }, { name: "B", minJudges: 2, assigned: 2 }, { name: "C", minJudges: 4, assigned: 1 }])).toHaveLength(2);
  });
});

describe("share link for WhatsApp", () => {
  it("the join address is the event's join page", () => {
    expect(joinAddress("https://app.test/", "arrow")).toBe("https://app.test/e/arrow/join");
  });
  it("the message holds the event, the join address and the PIN", () => {
    const t = shareText({ eventName: "Arrow Big Air", seatName: "Judge 1", joinUrl: "https://app.test/e/arrow/join", pin: "482913" });
    expect(t).toContain("Arrow Big Air");
    expect(t).toContain("https://app.test/e/arrow/join");
    expect(t).toContain("482913");
  });
  it("the share link is a wa.me link with the message encoded", () => {
    const link = shareLink("Hello 482913 & more");
    expect(link.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(link.slice("https://wa.me/?text=".length))).toBe("Hello 482913 & more");
  });
});

describe("last seen", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  it("never joined, seen just now, seen a while ago", () => {
    expect(heartbeatState(null, now)).toEqual({ kind: "never" });
    expect(heartbeatState("2026-10-01T11:59:40Z", now)).toMatchObject({ kind: "recent" });
    expect(heartbeatState("2026-10-01T11:40:00Z", now)).toMatchObject({ kind: "earlier", minutes: 20 });
    expect(heartbeatState("2026-09-29T12:00:00Z", now)).toMatchObject({ kind: "earlier" });
  });
});

import { minJudgesFor } from "./panels";

describe("how many judges a division needs", () => {
  it("reads the scoring model's minimum", () => expect(minJudgesFor({ panel: { minJudges: 3, maxJudges: 7 } }, {})).toBe(3));
  it("a division's own change wins", () => expect(minJudgesFor({ panel: { minJudges: 3, maxJudges: 7 } }, { panel: { minJudges: 5 } })).toBe(5));
  it("never less than one, and copes with nothing", () => {
    expect(minJudgesFor({}, {})).toBe(1);
    expect(minJudgesFor(null, null)).toBe(1);
    expect(minJudgesFor({ panel: { minJudges: 0 } }, {})).toBe(1);
  });
});
