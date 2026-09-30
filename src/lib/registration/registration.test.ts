import { describe, expect, it } from "vitest";
import { builtInSchemes } from "@/lib/schemas/identification";
import { fitWithin } from "./image";
import { askedIdentifiers, parseRegistration, RegistrationFormSchema } from "./form";

const scheme = (id: string) => builtInSchemes().find((s) => s.id === id)!;
const base = { divisionId: "11111111-1111-4111-8111-111111111111", first: "Ana", last: "Test", email: "Ana@Example.com", phone: "+20100", nationality: "EG", sponsor: "", wooId: "", consent: true, website: "" };

describe("which identifiers the registration page asks for", () => {
  it("name call-out: nothing extra", () => expect(askedIdentifiers(scheme("name-callout"))).toEqual({ kite: [], rashguard: false, photo: false }));
  it("lycra per heat: nothing extra (the organiser hands the lycras out)", () => expect(askedIdentifiers(scheme("vests-per-heat"))).toEqual({ kite: [], rashguard: false, photo: false }));
  it("kite scheme: the four kite fields and the rash guard colour", () => expect(askedIdentifiers(scheme("kites-no-vests"))).toEqual({ kite: ["brand", "model", "size", "colours"], rashguard: true, photo: false }));
  it("brand launch: kite size and colours, rash guard colour, photo", () => {
    const a = askedIdentifiers(scheme("brand-launch-same-kites"));
    expect(a.photo).toBe(true);
    expect(a.rashguard).toBe(true);
    expect(a.kite.length).toBeGreaterThan(0);
  });
  it("bib numbers: the kite fields the scheme lists", () => expect(askedIdentifiers(scheme("bib-numbers")).kite).toEqual(["brand", "model", "size", "colours"]));
});

describe("registration form", () => {
  it("accepts a good form and lowercases the email", () => {
    const r = parseRegistration(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.email).toBe("ana@example.com");
  });
  it("needs a division, a name, an email and the consent tick", () => {
    expect(parseRegistration({ ...base, divisionId: "" }).ok).toBe(false);
    expect(parseRegistration({ ...base, first: " " }).ok).toBe(false);
    expect(parseRegistration({ ...base, email: "nope" }).ok).toBe(false);
    expect(parseRegistration({ ...base, consent: false }).ok).toBe(false);
  });
  it("the hidden honeypot field must stay empty", () => {
    const r = parseRegistration({ ...base, website: "http://spam.test" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.spam).toBe(true);
  });
  it("names the field that is wrong in plain words", () => {
    const r = parseRegistration({ ...base, email: "nope" });
    expect(!r.ok && r.fields.email).toBeTruthy();
  });
  it("limits the length of free text", () => {
    expect(RegistrationFormSchema.safeParse({ ...base, sponsor: "x".repeat(200) }).success).toBe(false);
  });
});

describe("photo size: resized on the phone, 2 MB limit", () => {
  it("shrinks a big photo to fit inside 1200 px and keeps the shape", () => {
    expect(fitWithin(4000, 3000, 1200)).toEqual({ width: 1200, height: 900 });
    expect(fitWithin(3000, 4000, 1200)).toEqual({ width: 900, height: 1200 });
  });
  it("never enlarges a small photo", () => {
    expect(fitWithin(800, 600, 1200)).toEqual({ width: 800, height: 600 });
  });
});
