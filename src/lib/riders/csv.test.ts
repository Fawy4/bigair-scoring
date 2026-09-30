import { describe, expect, it } from "vitest";
import { builtInSchemes } from "@/lib/schemas/identification";
import { detectDelimiter, parseCsvRecords, readRiderCsv } from "./csv";

const palette = builtInSchemes()[0].palette;
const read = (text: string, existingEmails: string[] = []) => readRiderCsv(text, { palette, existingEmails });

describe("parseCsvRecords: messy input", () => {
  it("handles commas, quotes, doubled quotes and a quoted comma", () => {
    const r = parseCsvRecords('a,b,c\n"x, y","say ""hi""",z\n');
    expect(r.map((x) => x.cells)).toEqual([["a", "b", "c"], ["x, y", 'say "hi"', "z"]]);
  });
  it("handles Windows line endings, a BOM and blank lines, and keeps file line numbers", () => {
    const r = parseCsvRecords("﻿a,b\r\n\r\n1,2\r\n   \r\n3,4");
    expect(r.map((x) => [x.line, x.cells])).toEqual([[1, ["a", "b"]], [3, ["1", "2"]], [5, ["3", "4"]]]);
  });
  it("keeps a quoted line break inside one cell and counts the lines it used", () => {
    const r = parseCsvRecords('a,b\n"one\ntwo",2\n3,4');
    expect(r[1].cells[0]).toBe("one\ntwo");
    expect(r[2].line).toBe(4);
  });
  it("trims trailing spaces and non-breaking spaces around cells", () => {
    expect(parseCsvRecords("a , b  \n 1 ,2  ")[1].cells).toEqual(["1", "2"]);
  });
  it("reads an Excel text formula such as =\"007\" as 007", () => {
    expect(parseCsvRecords('bib\n="007"\n')[1].cells).toEqual(["007"]);
  });
  it("skips Excel's sep= hint line", () => {
    const r = parseCsvRecords("sep=;\nFirst;Last\nAna;Test");
    expect(r[0].cells).toEqual(["First", "Last"]);
  });
  it("detects semicolons and tabs", () => {
    expect(detectDelimiter("First;Last;Email\nA;B;c")).toBe(";");
    expect(detectDelimiter("First\tLast\nA\tB")).toBe("\t");
    expect(detectDelimiter("First,Last")).toBe(",");
    expect(detectDelimiter('"a;b",c\n1,2')).toBe(",");
  });
  it("never throws on an unterminated quote", () => {
    expect(() => parseCsvRecords('a,b\n"open,1\n')).not.toThrow();
  });
});

describe("readRiderCsv", () => {
  const header = "First,Last,Nationality,Email,Phone,Sponsor,Seed,Bib,Lycra colour,Kite brand,Kite model,Kite size,Kite colours,Rash guard colour,Photo URL";

  it("reads every column by header name, in any order, ignoring case and spaces", () => {
    const r = read("last name , FIRST,lycra COLOUR,Kite size\nTest,Ana,Red,9m");
    expect(r.fatal).toBeUndefined();
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].problems).toEqual([]);
    expect(r.rows[0].rider).toMatchObject({ first: "Ana", last: "Test", identifiers: { vest_colour: "red", kite: { size: "9" } } });
  });

  it("maps all 15 documented columns", () => {
    const r = read(`${header}\nAna,Test,EG,ANA@Example.com,+20 100 000,Acme,3,14,Blue,North,Orbit,9,blue/white,Green,https://x.test/a.jpg`);
    const rider = r.rows[0].rider!;
    expect(r.rows[0].problems).toEqual([]);
    expect(rider).toMatchObject({ first: "Ana", last: "Test", nationality: "EG", email: "ana@example.com", phone: "+20 100 000", sponsor: "Acme", seed: 3, photoUrl: "https://x.test/a.jpg" });
    expect(rider.identifiers).toEqual({ vest_colour: "blue", bib: "14", kite: { brand: "North", model: "Orbit", size: "9", colours: "blue/white" }, rashguard_colour: "green" });
  });

  it("copes with an Excel export: semicolons, quotes, blank lines, trailing spaces", () => {
    const text = '﻿"First";"Last";"Email"; \r\n"Ana ";"Test";"ana@example.com";\r\n;;;\r\n\r\n"Ben";"Tester";"";\r\n';
    const r = read(text);
    expect(r.fatal).toBeUndefined();
    expect(r.rows.map((x) => x.rider?.first)).toEqual(["Ana", "Ben"]);
  });

  it("never drops a bad row silently: each problem is one line with its file line number", () => {
    const text = `${header}\nAna,Test,EG,ana@example.com,,,1,,,,,,,,\n,Nobody,EG,,,,,,,,,,,,\nBen,Test,EG,not-an-email,,,x,,Teal,,,,,,ftp://nope\nCy,Test,,,,,,,,,,,,,`;
    const r = read(text);
    expect(r.rows).toHaveLength(4);
    expect(r.rows.filter((x) => x.problems.length).map((x) => x.line)).toEqual([3, 4]);
    const lines = r.rows.flatMap((x) => x.problems.map((p) => `Line ${x.line}: ${p}`));
    expect(lines.some((l) => /Line 3: .*First/i.test(l))).toBe(true);
    expect(lines.some((l) => /Line 4: .*email/i.test(l))).toBe(true);
    expect(lines.some((l) => /Line 4: .*Seed/i.test(l))).toBe(true);
    expect(lines.some((l) => /Line 4: .*Teal/i.test(l))).toBe(true);
    expect(lines.some((l) => /Line 4: .*Photo/i.test(l))).toBe(true);
    expect(r.rows[0].rider).not.toBeNull();
    expect(r.rows[2].rider).toBeNull(); // a row with a problem is not imported, and is listed
    expect(r.rows[3].rider).not.toBeNull();
  });

  it("10 riders with one bad row: 9 importable, 1 problem line", () => {
    const rows = Array.from({ length: 10 }, (_, i) => `Rider${i},Test${i},EG,r${i}@example.com`);
    rows[6] = "Broken,Row,EG,nope";
    const r = read(`First,Last,Nationality,Email\n${rows.join("\n")}`);
    expect(r.rows.filter((x) => x.rider)).toHaveLength(9);
    expect(r.rows.flatMap((x) => x.problems)).toHaveLength(1);
  });

  it("flags a repeated email inside the file on the second row", () => {
    const r = read("First,Last,Email\nAna,A,a@x.com\nAna,B,A@X.com");
    expect(r.rows[0].problems).toEqual([]);
    expect(r.rows[1].problems.join(" ")).toMatch(/email/i);
  });

  it("notes (as information, not a problem) a rider already in the organisation", () => {
    const r = read("First,Last,Email\nAna,A,a@x.com", ["a@x.com"]);
    expect(r.rows[0].problems).toEqual([]);
    expect(r.rows[0].notes.join(" ")).toMatch(/already/i);
    expect(r.rows[0].rider).not.toBeNull();
  });

  it("warns, never blocks, about repeated seeds and bibs", () => {
    const r = read("First,Last,Seed,Bib\nA,A,1,7\nB,B,1,7");
    expect(r.rows.every((x) => x.rider)).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/seed/i);
    expect(r.warnings.join(" ")).toMatch(/bib/i);
  });

  it("says plainly when there is no First or Last column", () => {
    const r = read("Name,Email\nAna Test,a@x.com");
    expect(r.fatal).toMatch(/First/);
    expect(r.fatal).toMatch(/Name, Email/);
  });

  it("a row with more values than the header is a problem, not a silent cut", () => {
    const r = read("First,Last\nAna,Test,extra,more");
    expect(r.rows[0].problems.join(" ")).toMatch(/values/);
  });

  it("an empty file or only a header is explained", () => {
    expect(read("").fatal).toBeTruthy();
    expect(read("First,Last\n").fatal).toBeTruthy();
  });

  it("refuses more than 500 rows with a readable sentence", () => {
    const text = "First,Last\n" + Array.from({ length: 501 }, (_, i) => `A${i},B`).join("\n");
    expect(read(text).fatal).toMatch(/500/);
  });

  it("lists unknown columns instead of ignoring them silently", () => {
    const r = read("First,Last,Favourite food\nAna,Test,pizza");
    expect(r.unknownColumns).toEqual(["Favourite food"]);
  });

  it("accepts the colour by palette label or key, in any case", () => {
    const r = read("First,Last,Lycra colour,Rash guard colour\nA,A,RED,yellow");
    expect(r.rows[0].rider?.identifiers).toMatchObject({ vest_colour: "red", rashguard_colour: "yellow" });
  });

  it("strips a trailing m from the kite size", () => {
    expect(read("First,Last,Kite size\nA,A,12 m").rows[0].rider?.identifiers?.kite?.size).toBe("12");
  });
});
