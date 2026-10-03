import { describe, expect, it } from "vitest";
import { heldByOf, heldWords, simLeaveHref } from "./view-hold";

// Polish 2, item 2: the panel says who holds each seat.
const ME = "me";
const SIM = "sim-login";
describe("who holds a seat", () => {
  it("a virtual seat bound to the simulator's login, or to nobody yet, is the simulator's", () => {
    expect(heldByOf({ mode: "virtual", boundUser: SIM, virtualUser: SIM }, ME)).toBe("simulator");
    expect(heldByOf({ mode: "virtual", boundUser: null, virtualUser: SIM }, ME)).toBe("simulator");
  });
  it("your own sign-in through View as is 'you', on a virtual or a real seat", () => {
    expect(heldByOf({ mode: "virtual", boundUser: ME, virtualUser: SIM }, ME)).toBe("you");
    expect(heldByOf({ mode: "real", boundUser: ME, virtualUser: SIM }, ME)).toBe("you");
  });
  it("another login (a phone that joined with the PIN) is 'phone'; a real seat with nobody is waiting", () => {
    expect(heldByOf({ mode: "virtual", boundUser: "pin-phone", virtualUser: SIM }, ME)).toBe("phone");
    expect(heldByOf({ mode: "real", boundUser: "pin-phone", virtualUser: SIM }, ME)).toBe("phone");
    expect(heldByOf({ mode: "real", boundUser: null, virtualUser: SIM }, ME)).toBe("nobody");
  });
  it("in words: 'Simulator', 'You (View as) · seen 4 s ago', 'A phone (PIN) has this seat', 'Waiting for a phone'", () => {
    expect(heldWords({ heldBy: "simulator", viewSeenSec: null })).toBe("Simulator");
    expect(heldWords({ heldBy: "you", viewSeenSec: 4 })).toBe("You (View as) · seen 4 s ago");
    expect(heldWords({ heldBy: "you", viewSeenSec: null })).toBe("You (View as)");
    expect(heldWords({ heldBy: "phone", viewSeenSec: null })).toBe("A phone (PIN) has this seat");
    expect(heldWords({ heldBy: "nobody", viewSeenSec: null })).toBe("Waiting for a phone");
  });
  it("the beacon goes to the event's own leave address", () => {
    expect(simLeaveHref("e1")).toBe("/org/events/e1/simulate/leave");
  });
});
