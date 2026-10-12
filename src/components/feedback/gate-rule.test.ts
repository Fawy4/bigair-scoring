import { describe, expect, it } from "vitest";
import { noteButtonHidden } from "./gate-rule";

describe("the Note button is never on an officials' screen", () => {
  it("hidden on the spotter, judge, head judge, observer and join screens, and on the big screens, whoever is signed in", () => {
    for (const path of ["/spot/abc", "/judge/abc", "/head/abc", "/observe/abc", "/observe/abc/screen", "/seat", "/seat/abc", "/screen/e2e-live"]) expect(noteButtonHidden(path), path).toBe(true);
  });
  it("kept on the organiser's own pages and on the simulator", () => {
    for (const path of ["/org/events/abc", "/org/events/abc/simulate", "/org/events/abc/simulate/view", "/admin", "/org", "/", "/e/slug"]) expect(noteButtonHidden(path), path).toBe(false);
  });
  it("a page that only starts with the same letters is not an official screen", () => {
    expect(noteButtonHidden("/spotlight")).toBe(false);
    expect(noteButtonHidden("/heading")).toBe(false);
  });
});
