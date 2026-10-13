import { describe, expect, it } from "vitest";
import { buildTrickVocab, type VocabularyInput } from "@/lib/engine/tricks";
import vocabularyJson from "../../../presets/tricks/big-air-vocabulary.json";
import {
  OPEN_LINES,
  applySuggestion,
  commitDecision,
  lineTotal,
  readTrick,
  spotterLines,
  spotterViewPreference,
  suggestionsFor,
  toggleDirection,
  type LoggedAttemptRow,
} from "./spotter-sheet";
import { capitaliseName, splitCount } from "./trick-text";

// The spotter's Rider sheet: one numbered line per attempt, and a line logs itself. These tests state the line rules in plain cases.
const vocab = buildTrickVocab(vocabularyJson as unknown as VocabularyInput);
const enabled = new Set(vocab.blocks.map((b) => b.id));
const att = (seq: number, over: Partial<LoggedAttemptRow> = {}): LoggedAttemptRow => ({ id: `a${seq}`, seq, clientKey: `k${seq}`, status: "landed", trickName: `Trick ${seq}`, direction: "left", mine: true, deleted: false, ...over });

describe("how many lines the sheet has", () => {
  it("as many lines as the division's attempt limit (7 for Arrow)", () => {
    expect(lineTotal({ logged: 0, cap: 7, added: 0 })).toBe(7);
    expect(spotterLines({ attempts: [], cap: 7, added: 0, queued: [] }).map((l) => l.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("with no limit: 10 lines from the start, and each Add attempt adds exactly one", () => {
    expect(OPEN_LINES).toBe(10);
    expect(lineTotal({ logged: 0, cap: null, added: 0 })).toBe(10);
    expect(lineTotal({ logged: 0, cap: null, added: 1 })).toBe(11);
    expect(lineTotal({ logged: 0, cap: null, added: 3 })).toBe(13);
  });

  it("never fewer lines than attempts already logged (by anyone), with or without a limit", () => {
    expect(lineTotal({ logged: 9, cap: 7, added: 0 })).toBe(9);
    expect(lineTotal({ logged: 12, cap: null, added: 0 })).toBe(12);
  });
});

describe("which line takes typing", () => {
  it("only the first empty line is active; the lines below wait", () => {
    const lines = spotterLines({ attempts: [], cap: 7, added: 0, queued: [] });
    expect(lines.map((l) => l.state)).toEqual(["active", "waiting", "waiting", "waiting", "waiting", "waiting", "waiting"]);
  });

  it("logged lines come first, in order, and the next empty line is the next attempt", () => {
    const lines = spotterLines({ attempts: [att(1), att(2, { status: "crashed" })], cap: 7, added: 0, queued: [] });
    expect(lines.map((l) => l.state)).toEqual(["logged", "logged", "active", "waiting", "waiting", "waiting", "waiting"]);
    expect(lines[1].crash).toBe(true);
    expect(lines[2].n).toBe(3);
  });

  it("an attempt logged by somebody else (a second spotter, the head judge) fills its line and cannot be changed from this seat", () => {
    const lines = spotterLines({ attempts: [att(1, { mine: false }), att(2)], cap: 7, added: 0, queued: [] });
    expect(lines[0]).toMatchObject({ state: "logged", editable: false });
    expect(lines[1]).toMatchObject({ state: "logged", editable: true });
  });

  it("a deleted attempt takes no line: the lines renumber", () => {
    const lines = spotterLines({ attempts: [att(1), att(2, { deleted: true }), att(3)], cap: 7, added: 0, queued: [] });
    expect(lines.filter((l) => l.state === "logged").map((l) => l.trickName)).toEqual(["Trick 1", "Trick 3"]);
    expect(lines[2].state).toBe("active");
  });

  it("an attempt still waiting on the phone shows as Saving… and already takes its line", () => {
    const lines = spotterLines({ attempts: [att(1)], cap: 7, added: 0, queued: [{ clientKey: "q1", status: "landed", trickName: "Backroll", direction: "right" }] });
    expect(lines.map((l) => l.state).slice(0, 3)).toEqual(["logged", "saving", "active"]);
    expect(lines[1]).toMatchObject({ trickName: "Backroll", direction: "right", clientKey: "q1", editable: true });
  });

  it("a logged line with a change still on its way shows Saving…", () => {
    const lines = spotterLines({ attempts: [att(1)], cap: 7, added: 0, queued: [], changing: new Set(["k1"]) });
    expect(lines[0].state).toBe("saving");
  });

  it("the sheet shows the same attempts as the sheet of a second spotter would (what is logged is what is shown)", () => {
    const all = [att(1, { mine: false }), att(2, { mine: false })];
    expect(spotterLines({ attempts: all, cap: null, added: 0, queued: [] }).filter((l) => l.state === "logged")).toHaveLength(2);
    expect(spotterLines({ attempts: all, cap: null, added: 0, queued: [] })[2].state).toBe("active");
  });
});

describe("Left and Right", () => {
  it("only one can be on; tapping the other switches", () => {
    expect(toggleDirection(null, "left")).toBe("left");
    expect(toggleDirection("left", "right")).toBe("right");
    expect(toggleDirection("right", "left")).toBe("left");
  });
  it("tapping the one that is on keeps it on (a logged attempt never goes back to no direction)", () => {
    expect(toggleDirection("left", "left")).toBe("left");
  });
});

describe("when a line logs itself", () => {
  const base = { crash: false, picked: false, quietMs: 0, hasOpenSuggestions: false };
  it("a tapped suggestion logs at once", () => {
    expect(commitDecision({ ...base, text: "Backroll", picked: true })).toEqual({ log: true, why: "picked" });
  });
  it("free text that matches no suggestion logs after about 2 seconds of quiet, not before", () => {
    expect(commitDecision({ ...base, text: "megaflip", quietMs: 1500 })).toEqual({ log: false, waitMs: 500 });
    expect(commitDecision({ ...base, text: "megaflip", quietMs: 2000 })).toEqual({ log: true, why: "paused" });
  });
  it("text that still shows suggestions waits for a tap, however long the pause", () => {
    expect(commitDecision({ ...base, text: "back", quietMs: 10_000, hasOpenSuggestions: true })).toEqual({ log: false, waitMs: null });
  });
  it("Crash on logs at once, with or without a trick", () => {
    expect(commitDecision({ ...base, text: "front", crash: true })).toEqual({ log: true, why: "crash" });
    expect(commitDecision({ ...base, text: "", crash: true })).toEqual({ log: true, why: "crash" });
  });
  it("an empty line without Crash never logs (L or R alone is not an attempt)", () => {
    expect(commitDecision({ ...base, text: "", quietMs: 30_000 })).toEqual({ log: false, waitMs: null });
    expect(commitDecision({ ...base, text: "   ", picked: true })).toEqual({ log: false, waitMs: null });
  });
});

describe("what the box becomes", () => {
  it("'front' is read as Frontroll (the same vocabulary matching as the Trick list)", () => {
    const r = readTrick(vocab, enabled, "front", null);
    expect(r.trickName).toBe("Frontroll");
    expect(r.needsReview).toBe(false);
    expect(r.categoryKey).not.toBeNull();
  });
  it("the L / R button gives the direction, and the name carries it like the Trick list's names do", () => {
    const r = readTrick(vocab, enabled, "back", "left");
    expect(r.direction).toBe("left");
    expect(r.trickName).toBe("Left Backroll");
  });
  it("a direction word typed in the box counts when no button is on", () => {
    expect(readTrick(vocab, enabled, "left back", null).direction).toBe("left");
    expect(readTrick(vocab, enabled, "left back", "right").direction).toBe("right");
  });
  it("words that match nothing stay free text and are flagged for the head judge", () => {
    const r = readTrick(vocab, enabled, "zzzflip", null);
    expect(r.trickName).toBe("Zzzflip"); // names start with a capital
    expect(r.needsReview).toBe(true);
    expect(r.trickParts.freeText).toBe("zzzflip");
  });
  it("an empty box has no trick (a crash may log without one)", () => {
    const r = readTrick(vocab, enabled, "  ", null);
    expect(r.trickName).toBeNull();
    expect(r.trickParts.items).toEqual([]);
  });
  it("Crash keeps the typed trick", () => {
    const r = readTrick(vocab, enabled, "front", "right");
    expect(r.trickName).toBe("Right Frontroll");
  });
});

describe("tidy trick names", () => {
  const name = (text: string, dir: "left" | "right" | null = null) => readTrick(vocab, enabled, text, dir).trickName;

  it("the first letter is a capital", () => {
    expect(name("backroll")).toBe("Backroll");
    expect(name("zzzflip")).toBe("Zzzflip");
    expect(name("front")).toBe("Frontroll");
  });

  it("a one- or two-digit number at the start becomes a count in front of the trick, in the vocabulary's spelling and in the singular", () => {
    expect(name("6 front rolls")).toBe("6x Frontroll");
    expect(name("2 backrolls")).toBe("2x Backroll");
    expect(name("3x kiteloop")).toBe("3x Kiteloop");
    expect(name("3 x kiteloop")).toBe("3x Kiteloop");
    expect(name("12 kite loops")).toBe("12x Kiteloop");
    expect(name("2×backroll")).toBe("2x Backroll");
  });

  it("the direction keeps its place at the front: 'Left 6x Frontroll'", () => {
    expect(name("6 front rolls", "left")).toBe("Left 6x Frontroll");
  });

  it("a number of three digits is not a count: '720' stays '720'", () => {
    expect(name("720")).toBe("720");
    expect(name("360")).toBe("360");
  });

  it("if the rest matches no trick, the count still goes in front of the free text (and it is flagged for the head judge)", () => {
    const r = readTrick(vocab, enabled, "6 zzzflip", null);
    expect(r.trickName).toBe("6x Zzzflip");
    expect(r.needsReview).toBe(true);
    expect(r.trickParts.count).toBe(6);
  });

  it("the count is kept in the trick parts, and a number with nothing after it is not a count", () => {
    expect(readTrick(vocab, enabled, "3x backroll", null).trickParts.count).toBe(3);
    expect(readTrick(vocab, enabled, "backroll", null).trickParts.count).toBeUndefined();
    expect(splitCount("6")).toEqual({ count: null, rest: "6" });
    expect(splitCount("6 front rolls")).toEqual({ count: 6, rest: "front rolls" });
    expect(splitCount("3x kiteloop")).toEqual({ count: 3, rest: "kiteloop" });
    expect(splitCount("1080 backroll")).toEqual({ count: null, rest: "1080 backroll" });
  });

  it("capitalName leaves a name that already starts with a capital or a count alone", () => {
    expect(capitaliseName("left backroll")).toBe("Left backroll");
    expect(capitaliseName("6x zzz")).toBe("6x Zzz");
    expect(capitaliseName("Backroll")).toBe("Backroll");
    expect(capitaliseName("")).toBe("");
  });
});

describe("suggestions under the box", () => {
  it("typing 'back' offers Backroll", () => {
    expect(suggestionsFor(vocab, enabled, "back").map((s) => s.label)).toContain("Backroll");
  });
  it("matches the start of a name or of a nickname, ignoring case", () => {
    expect(suggestionsFor(vocab, enabled, "FRO").map((s) => s.label)).toContain("Frontroll");
    expect(suggestionsFor(vocab, enabled, "mega").map((s) => s.label)).toContain("Megaloop");
  });
  it("nothing for text that matches nothing, for an empty box and for a box that ends in a space", () => {
    expect(suggestionsFor(vocab, enabled, "zzzflip")).toEqual([]);
    expect(suggestionsFor(vocab, enabled, "")).toEqual([]);
    expect(suggestionsFor(vocab, enabled, "backroll ")).toEqual([]);
  });
  it("only the blocks the division has switched on are offered", () => {
    const off = new Set([...enabled].filter((id) => id !== "base:backroll"));
    expect(suggestionsFor(vocab, off, "back").map((s) => s.label)).not.toContain("Backroll");
  });
  it("the directions are not suggested (L and R are buttons)", () => {
    expect(suggestionsFor(vocab, enabled, "lef").map((s) => s.label)).not.toContain("Left");
  });
  it("Board-off is offered for \"board\", \"board off\" and \"boardoff\" (spelled differently from its name), and a tap on it replaces the words typed", () => {
    for (const typed of ["board", "board off", "boardoff", "Board off", "BOARD OFF"]) {
      const open = suggestionsFor(vocab, enabled, typed).filter((s) => !s.exact);
      expect(open.map((s) => s.label), typed).toContain("Board-off");
    }
    const s = suggestionsFor(vocab, enabled, "double frontroll board off").find((x) => x.label === "Board-off")!;
    expect(applySuggestion("double frontroll board off", s)).toBe("double frontroll Board-off");
    expect(applySuggestion("double fro", suggestionsFor(vocab, enabled, "double fro")[0])).toBe("double Frontroll");
  });
  it("only a word spelled exactly like the name is exact (capitals aside): Board-off typed as Board-off needs no tap", () => {
    expect(suggestionsFor(vocab, enabled, "board-off").filter((s) => !s.exact).map((s) => s.label)).not.toContain("Board-off");
    expect(suggestionsFor(vocab, enabled, "Board-Off").filter((s) => !s.exact).map((s) => s.label)).not.toContain("Board-off");
  });
  it("after a tapped suggestion the box ends with a space, so no suggestion is open and the usual 2-second pause logs the line", () => {
    expect(suggestionsFor(vocab, enabled, "double Frontroll ")).toEqual([]);
    expect(commitDecision({ text: "double Frontroll ", crash: false, picked: false, quietMs: 100, hasOpenSuggestions: false })).toEqual({ log: false, waitMs: 1900 });
    expect(commitDecision({ text: "double Frontroll ", crash: false, picked: false, quietMs: 2000, hasOpenSuggestions: false })).toEqual({ log: true, why: "paused" });
    // a last word that is still unfinished waits for a tap (or for the box to be left)
    expect(commitDecision({ text: "double fro", crash: false, picked: false, quietMs: 5000, hasOpenSuggestions: true })).toEqual({ log: false, waitMs: null });
  });
  it("a suggestion that is exactly what has been typed is not 'open': the pause may log it", () => {
    const open = suggestionsFor(vocab, enabled, "Backroll").filter((s) => !s.exact);
    expect(open).toEqual([]);
    expect(suggestionsFor(vocab, enabled, "back").filter((s) => !s.exact).length).toBeGreaterThan(0);
  });
  it("taking a suggestion replaces the word being typed and keeps the words before it", () => {
    const s = suggestionsFor(vocab, enabled, "back").find((x) => x.label === "Backroll")!;
    expect(applySuggestion("back", s)).toBe("Backroll");
    const t = suggestionsFor(vocab, enabled, "backroll tic").find((x) => x.label.toLowerCase().includes("tic"));
    if (t) expect(applySuggestion("backroll tic", t).startsWith("backroll ")).toBe(true);
  });
});

describe("the spotter's view choice", () => {
  it("the Rider sheet unless this phone chose the Trick list; kept apart from the judge's choice", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(spotterViewPreference.read(storage)).toBe("sheet");
    spotterViewPreference.write("list", storage);
    expect(spotterViewPreference.read(storage)).toBe("list");
    spotterViewPreference.write("sheet", storage);
    expect(spotterViewPreference.read(storage)).toBe("sheet");
    store.set(spotterViewPreference.key, "nonsense");
    expect(spotterViewPreference.read(storage)).toBe("sheet");
    expect(spotterViewPreference.read(null)).toBe("sheet");
    expect(spotterViewPreference.read({ getItem: () => { throw new Error("blocked"); } })).toBe("sheet");
    expect(spotterViewPreference.key).not.toBe("bigair.judgeView");
  });
});
