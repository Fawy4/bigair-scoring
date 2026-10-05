import { describe, expect, it } from "vitest";
import { parseBreak } from "./break-input";

describe("the break typed under Other…", () => {
  it("minutes and seconds, or whole minutes", () => {
    expect(parseBreak("2:30")).toEqual({ ok: true, sec: 150 });
    expect(parseBreak(" 3 ")).toEqual({ ok: true, sec: 180 });
    expect(parseBreak("0:45")).toEqual({ ok: true, sec: 45 });
    expect(parseBreak("120")).toEqual({ ok: true, sec: 7200 });
  });
  it("refuses anything else, in a sentence the screen shows", () => {
    for (const bad of ["", "abc", "2:75", "2,5", "121", "-1", "1:2"]) expect(parseBreak(bad), bad).toEqual({ ok: false });
  });
});
