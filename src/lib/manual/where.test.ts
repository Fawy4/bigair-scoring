import { describe, expect, it } from "vitest";
import { help, HELP_WHERE } from "@/lib/ui-copy";
import { settingHelps, settingWhere, whereOfKey } from "./settings-lookup";

// Polish 2, item 9: every "?" ends with one sentence on where the setting shows and what it changes.
describe("the last sentence of every “?”", () => {
  it("every “?” of the product has one (its own, or the nearest setting above it)", () => {
    const missing = settingHelps().filter((h) => !whereOfKey(h.key)).map((h) => h.key);
    expect(missing).toEqual([]);
  });
  it("each is one sentence that says where it shows or what it changes", () => {
    for (const [key, s] of Object.entries(HELP_WHERE)) {
      expect(s, key).toMatch(/^[A-Z].*\.$/);
      expect(s.split(/\. [A-Z]/).length, key).toBe(1);
      expect(s, key).toMatch(/\b(Shown|Changes|Adds|Hides|Used|Opens)\b/);
    }
  });
  it("the words of a “?” find their sentence: the number pad for the trick scale, the public pages for the sponsors", () => {
    expect(settingWhere(help["scoring.scale"].text)).toBe("Changes the number pad on the judges' phones and every trick score.");
    expect(settingWhere(help["event.sponsors"].text)).toBe("Shown in the sponsor strip of the public pages and on the big screen.");
    expect(whereOfKey("scoring.trick.scale.min")).toBe(HELP_WHERE["scoring.trick.scale"]);
    expect(settingWhere("words that are no setting")).toBeUndefined();
  });
});
