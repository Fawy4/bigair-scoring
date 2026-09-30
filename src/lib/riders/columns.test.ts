import { describe, expect, it } from "vitest";
import { builtInSchemes } from "@/lib/schemas/identification";
import { identifierColumns } from "./columns";

const s = (id: string) => builtInSchemes().find((x) => x.id === id)!;

describe("identifier columns per scheme", () => {
  it("name call-out: none", () => expect(identifierColumns(s("name-callout"))).toEqual({ lycra: false, bib: false, kite: [], rashguard: false, helmet: false, photo: false }));
  it("lycra per heat: none (the colour is given at the draw)", () => expect(identifierColumns(s("vests-per-heat")).lycra).toBe(false));
  it("one lycra per rider: the lycra colour and the bib", () => {
    const c = identifierColumns(s("fixed-lycra-per-rider"));
    expect(c.lycra).toBe(true);
    expect(c.bib).toBe(true);
  });
  it("bib numbers: the bib and the kite fields the scheme lists", () => {
    const c = identifierColumns(s("bib-numbers"));
    expect(c.bib).toBe(true);
    expect(c.kite).toEqual(["brand", "model", "size", "colours"]);
  });
  it("kites: the four kite fields and the rash guard colour", () => {
    const c = identifierColumns(s("kites-no-vests"));
    expect(c.kite).toHaveLength(4);
    expect(c.rashguard).toBe(true);
  });
  it("brand launch: rash guard colour and the photo", () => {
    const c = identifierColumns(s("brand-launch-same-kites"));
    expect(c.rashguard).toBe(true);
    expect(c.photo).toBe(true);
  });
  it("show every column turns them all on", () => {
    const c = identifierColumns(s("name-callout"), true);
    expect(c).toMatchObject({ lycra: true, bib: true, rashguard: true, helmet: true, photo: true });
    expect(c.kite).toHaveLength(4);
  });
});
