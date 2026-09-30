import type { PaletteColour } from "@/lib/schemas/identification";
import { copy } from "@/lib/ui-copy";

/** One record of a CSV file: the cells and the line of the file where it starts (line 1 = the header). */
export interface CsvRecord {
  line: number;
  cells: string[];
}

export type Delimiter = "," | ";" | "\t";
const MAX_ROWS = 500;

/** Excel in many countries saves with semicolons; some tools use tabs. Counts outside quotes on the first real line. */
export function detectDelimiter(text: string): Delimiter {
  const lines = text.replace(/^﻿/, "").split(/\r\n|\n|\r/);
  const first = lines.find((l, i) => l.trim() !== "" && !(i === 0 && /^sep=.$/i.test(l.trim()))) ?? "";
  const counts: Record<Delimiter, number> = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (const ch of first) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in counts) counts[ch as Delimiter]++;
  }
  if (counts[";"] > counts[","] && counts[";"] >= counts["\t"]) return ";";
  if (counts["\t"] > counts[","]) return "\t";
  return ",";
}

function cleanCell(raw: string): string {
  const t = raw.trim();
  const formula = t.match(/^="(.*)"$/); // Excel's way of keeping leading zeros: ="007"
  return (formula ? formula[1] : t).trim();
}

/**
 * A small, forgiving CSV reader: quotes and doubled quotes, line breaks inside quotes, Windows line endings, a byte-order mark,
 * Excel's "sep=;" line, blank lines (skipped, but the line numbers stay true to the file) and spaces around cells.
 * Never throws; an unterminated quote simply runs to the end of the file.
 */
export function parseCsvRecords(input: string, delimiter?: Delimiter): CsvRecord[] {
  let text = input.replace(/^﻿/, "");
  let lineOffset = 0;
  const sep = text.match(/^sep=(.)[ \t]*(\r\n|\n|\r)/i);
  if (sep) {
    delimiter = delimiter ?? (sep[1] as Delimiter);
    text = text.slice(sep[0].length);
    lineOffset = 1;
  }
  const d = delimiter ?? detectDelimiter(text);
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let atFieldStart = true;
  let line = 1 + lineOffset;
  let startLine = line;

  const endCell = () => {
    cells.push(cleanCell(cell));
    cell = "";
    atFieldStart = true;
  };
  const endRecord = () => {
    endCell();
    if (cells.some((c) => c !== "")) records.push({ line: startLine, cells });
    cells = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else {
        if (ch === "\n") line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && atFieldStart) {
      quoted = true;
      atFieldStart = false;
    } else if (ch === d) endCell();
    else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRecord();
      line++;
      startLine = line;
    } else {
      cell += ch;
      atFieldStart = false;
    }
  }
  if (cell !== "" || cells.length > 0) endRecord();
  return records;
}

// ---------------------------------------------------------------------------------------------------- riders

export const RIDER_COLUMNS = [
  { key: "first", header: "First", aliases: ["first", "firstname", "givenname", "forename"] },
  { key: "last", header: "Last", aliases: ["last", "lastname", "surname", "familyname"] },
  { key: "nationality", header: "Nationality", aliases: ["nationality", "country", "nat"] },
  { key: "email", header: "Email", aliases: ["email", "emailaddress", "mail"] },
  { key: "phone", header: "Phone", aliases: ["phone", "mobile", "whatsapp", "phonenumber", "tel"] },
  { key: "sponsor", header: "Sponsor", aliases: ["sponsor", "sponsors"] },
  { key: "seed", header: "Seed", aliases: ["seed", "seeding", "rank"] },
  { key: "bib", header: "Bib", aliases: ["bib", "bibnumber", "sailnumber", "number"] },
  { key: "lycra", header: "Lycra colour", aliases: ["lycracolour", "lycracolor", "lycra", "fixedlycra"] },
  { key: "kiteBrand", header: "Kite brand", aliases: ["kitebrand", "brand"] },
  { key: "kiteModel", header: "Kite model", aliases: ["kitemodel", "model"] },
  { key: "kiteSize", header: "Kite size", aliases: ["kitesize", "size"] },
  { key: "kiteColours", header: "Kite colours", aliases: ["kitecolours", "kitecolors", "kitecolour", "kitecolor"] },
  { key: "rashguard", header: "Rash guard colour", aliases: ["rashguardcolour", "rashguardcolor", "rashguard", "wetsuitcolour"] },
  { key: "photo", header: "Photo URL", aliases: ["photourl", "photo", "picture", "photolink"] },
] as const;
type ColumnKey = (typeof RIDER_COLUMNS)[number]["key"];

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** A rider as the preview and the import use it. */
export interface ImportedRider {
  first: string;
  last: string;
  nationality: string | null;
  email: string | null;
  phone: string | null;
  sponsor: string | null;
  seed: number | null;
  photoUrl: string | null;
  identifiers: {
    vest_colour?: string;
    bib?: string;
    kite?: { brand?: string; model?: string; size?: string; colours?: string };
    rashguard_colour?: string;
  };
}

export interface ImportRow {
  /** Line of the file (1 = the header). */
  line: number;
  /** Null when the row has a problem: it is listed in the preview and is not imported. */
  rider: ImportedRider | null;
  problems: string[];
  /** Information, not a problem (for example "already in this organisation"). */
  notes: string[];
}

export interface CsvReadResult {
  rows: ImportRow[];
  unknownColumns: string[];
  /** Whole-file problems: nothing can be imported. */
  fatal?: string;
  /** Things to look at that do not stop a row (repeated seeds or bibs). */
  warnings: string[];
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const T = copy.riders.csv;

/** Turns CSV text into a preview: one entry per data row, with every problem written as a plain sentence. */
export function readRiderCsv(text: string, options: { palette: PaletteColour[]; existingEmails?: string[] }): CsvReadResult {
  const records = parseCsvRecords(text);
  const none: CsvReadResult = { rows: [], unknownColumns: [], warnings: [] };
  if (records.length === 0) return { ...none, fatal: T.empty };

  const header = records[0].cells;
  const columnIndex = new Map<ColumnKey, number>();
  const unknownColumns: string[] = [];
  header.forEach((h, i) => {
    if (h === "") return;
    const col = RIDER_COLUMNS.find((c) => (c.aliases as readonly string[]).includes(squash(h)));
    if (col && !columnIndex.has(col.key)) columnIndex.set(col.key, i);
    else unknownColumns.push(h);
  });
  if (!columnIndex.has("first") || !columnIndex.has("last")) return { ...none, unknownColumns, fatal: T.noNameColumns(header.filter(Boolean).join(", ")) };

  const data = records.slice(1);
  if (data.length === 0) return { ...none, unknownColumns, fatal: T.noRows };
  if (data.length > MAX_ROWS) return { ...none, unknownColumns, fatal: T.tooMany(MAX_ROWS) };

  const known = new Set((options.existingEmails ?? []).map((e) => e.toLowerCase()));
  const paletteNames = options.palette.map((c) => c.label).join(", ");
  const findColour = (value: string) => options.palette.find((c) => c.key.toLowerCase() === value.toLowerCase() || c.label.toLowerCase() === value.toLowerCase());
  const seenEmail = new Map<string, number>();
  const rows: ImportRow[] = [];

  for (const rec of data) {
    const get = (k: ColumnKey) => {
      const i = columnIndex.get(k);
      return i === undefined ? "" : (rec.cells[i] ?? "");
    };
    const problems: string[] = [];
    const notes: string[] = [];

    const extra = rec.cells.slice(header.length).filter((c) => c !== "").length;
    if (extra > 0) problems.push(T.tooManyValues(rec.cells.length, header.length));

    const first = get("first");
    const last = get("last");
    if (!first) problems.push(T.firstMissing);
    if (!last) problems.push(T.lastMissing);

    const email = get("email").toLowerCase();
    if (email) {
      if (email.length > 254 || !EMAIL.test(email)) problems.push(T.badEmail(get("email")));
      else if (seenEmail.has(email)) problems.push(T.repeatedEmail(email, seenEmail.get(email)!));
      else {
        seenEmail.set(email, rec.line);
        if (known.has(email)) notes.push(T.alreadyInOrganisation);
      }
    }

    const seedText = get("seed");
    let seed: number | null = null;
    if (seedText) {
      if (/^\d{1,4}$/.test(seedText) && Number(seedText) >= 1) seed = Number(seedText);
      else problems.push(T.badSeed(seedText));
    }

    const identifiers: ImportedRider["identifiers"] = {};
    const lycra = get("lycra");
    if (lycra) {
      const c = findColour(lycra);
      if (c) identifiers.vest_colour = c.key;
      else problems.push(T.badColour(copy.riders.csvColumnNames.lycra, lycra, paletteNames));
    }
    const rash = get("rashguard");
    if (rash) {
      const c = findColour(rash);
      if (c) identifiers.rashguard_colour = c.key;
      else problems.push(T.badColour(copy.riders.csvColumnNames.rashguard, rash, paletteNames));
    }
    const bib = get("bib");
    if (bib) {
      if (bib.length > 20) problems.push(T.badBib(bib));
      else identifiers.bib = bib;
    }
    const kite: NonNullable<ImportedRider["identifiers"]["kite"]> = {};
    if (get("kiteBrand")) kite.brand = get("kiteBrand").slice(0, 60);
    if (get("kiteModel")) kite.model = get("kiteModel").slice(0, 60);
    if (get("kiteColours")) kite.colours = get("kiteColours").slice(0, 60);
    const size = get("kiteSize").replace(/\s*m$/i, "").replace(",", ".");
    if (size) {
      if (/^\d{1,2}(\.\d)?$/.test(size)) kite.size = size;
      else problems.push(T.badKiteSize(get("kiteSize")));
    }
    if (Object.keys(kite).length) identifiers.kite = kite;

    const photo = get("photo");
    if (photo && (!/^https?:\/\/\S+$/i.test(photo) || photo.length > 500)) problems.push(T.badPhoto(photo));

    const textLimit = (value: string, max: number, name: string) => {
      if (value.length > max) problems.push(T.tooLong(name, max));
    };
    textLimit(first, 60, copy.riders.csvColumnNames.first);
    textLimit(last, 60, copy.riders.csvColumnNames.last);
    textLimit(get("nationality"), 60, copy.riders.csvColumnNames.nationality);
    textLimit(get("phone"), 30, copy.riders.csvColumnNames.phone);
    textLimit(get("sponsor"), 100, copy.riders.csvColumnNames.sponsor);

    rows.push({
      line: rec.line,
      problems,
      notes,
      rider: problems.length
        ? null
        : {
            first,
            last,
            nationality: get("nationality") || null,
            email: email || null,
            phone: get("phone") || null,
            sponsor: get("sponsor") || null,
            seed,
            photoUrl: photo || null,
            identifiers,
          },
    });
  }

  // things that are worth a look but never stop a row
  const warnings: string[] = [];
  const good = rows.filter((r) => r.rider);
  const group = (pick: (r: ImportedRider) => string | number | null | undefined) => {
    const map = new Map<string, string[]>();
    for (const r of good) {
      const v = pick(r.rider!);
      if (v === null || v === undefined || v === "") continue;
      map.set(String(v), [...(map.get(String(v)) ?? []), `${r.rider!.first} ${r.rider!.last}`]);
    }
    return [...map.entries()].filter(([, names]) => names.length > 1);
  };
  for (const [seed, names] of group((r) => r.seed)) warnings.push(T.repeatedSeed(seed, names.join(", ")));
  for (const [bib, names] of group((r) => r.identifiers.bib)) warnings.push(T.repeatedBib(bib, names.join(", ")));

  return { rows, unknownColumns, warnings };
}
