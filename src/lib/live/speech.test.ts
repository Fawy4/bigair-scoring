import { afterEach, describe, expect, it } from "vitest";
import { abortSpeech, failureOf, listenOnce, NO_ANSWER_MS, type Recognition, type RecognitionCtor, type SpeechEnd } from "./speech";
import { beep } from "./beep";

/** A stand-in for the browser's speech engine: the test decides what it does and when. */
class Fake implements Recognition {
  static made: Fake[] = [];
  lang = "";
  interimResults = true;
  maxAlternatives = 5;
  continuous = true;
  onresult: Recognition["onresult"] = null;
  onerror: Recognition["onerror"] = null;
  onend: Recognition["onend"] = null;
  started = 0;
  stopped = 0;
  aborted = 0;
  constructor() {
    Fake.made.push(this);
  }
  start() {
    this.started++;
  }
  stop() {
    this.stopped++;
  }
  abort() {
    this.aborted++;
  }
  say(text: string) {
    this.onresult?.({ results: [[{ transcript: text, confidence: 0.9 }]] });
  }
}
const Engine = Fake as unknown as RecognitionCtor;

/** Timers the test moves by hand. */
const clock = () => {
  const jobs: Array<{ id: number; at: number; fn: () => void }> = [];
  let now = 0;
  let next = 1;
  return {
    set: (fn: () => void, ms: number) => {
      jobs.push({ id: next, at: now + ms, fn });
      return next++;
    },
    clear: (id: unknown) => {
      const i = jobs.findIndex((j) => j.id === id);
      if (i >= 0) jobs.splice(i, 1);
    },
    advance: (ms: number) => {
      now += ms;
      for (const j of jobs.filter((x) => x.at <= now)) {
        jobs.splice(jobs.indexOf(j), 1);
        j.fn();
      }
    },
  };
};

const listen = (t = clock()) => {
  const words: string[] = [];
  const ends: Array<SpeechEnd | null> = [];
  const stop = listenOnce({ engine: Engine, timers: t, onText: (x) => words.push(x), onEnd: (e) => ends.push(e) });
  return { t, words, ends, stop, engine: Fake.made.at(-1)! };
};

afterEach(() => {
  abortSpeech();
  Fake.made = [];
});

describe("listening", () => {
  it("starts straight away with en-US, one answer, no interim words, and nothing is reported until it ends", () => {
    const l = listen();
    expect(l.engine.started).toBe(1);
    expect(l.engine).toMatchObject({ lang: "en-US", continuous: false, interimResults: false, maxAlternatives: 1 });
    expect(l.ends).toEqual([]);
  });

  it("the words heard are handed over once, then it ends well", () => {
    const l = listen();
    l.engine.say("  6 front rolls ");
    l.engine.say("second guess");
    l.engine.onend?.();
    expect(l.words).toEqual(["6 front rolls"]);
    expect(l.ends).toEqual([{ ok: true }]);
  });

  it("a second tap while listening stops it: the browser is asked to stop, and what it heard still counts", () => {
    const l = listen();
    l.stop();
    expect(l.engine.stopped).toBe(1);
    l.engine.say("left backroll");
    l.engine.onend?.();
    expect(l.words).toEqual(["left backroll"]);
    expect(l.ends).toEqual([{ ok: true }]);
  });

  it("every tap gets a new recognition object, and starting one aborts the one still running", () => {
    const first = listen();
    const second = listen(first.t);
    expect(Fake.made).toHaveLength(2);
    expect(second.engine).not.toBe(first.engine);
    expect(first.engine.aborted).toBe(1);
    expect(first.ends).toEqual([null]);
    second.engine.say("x");
    second.engine.onend?.();
    const third = listen(first.t);
    expect(third.engine).not.toBe(second.engine);
    expect(Fake.made).toHaveLength(3);
  });
});

describe("never silent: each ending has one named reason and the browser's own word", () => {
  const cases: Array<[string | undefined, string, string | null]> = [
    ["not-allowed", "blocked", "not-allowed"],
    ["service-not-allowed", "blocked", "service-not-allowed"],
    ["no-speech", "nothing", "no-speech"],
    ["audio-capture", "unavailable", "audio-capture"],
    ["network", "unavailable", "network"],
    ["language-not-supported", "unavailable", "language-not-supported"],
    ["something-new", "unavailable", "something-new"],
    [undefined, "nothing", null], // it ended with no words and no error
  ];
  for (const [error, reason, code] of cases) {
    it(`${error ?? "ended with nothing"} → ${reason}`, () => {
      const l = listen();
      if (error) l.engine.onerror?.({ error });
      l.engine.onend?.();
      expect(l.ends).toEqual([{ ok: false, reason, code }]);
      expect(l.words).toEqual([]);
    });
  }

  it("no answer after 8 seconds: stopped and reported, with no browser word", () => {
    const l = listen();
    l.t.advance(NO_ANSWER_MS - 1);
    expect(l.ends).toEqual([]);
    l.t.advance(1);
    expect(l.ends).toEqual([{ ok: false, reason: "timeout", code: null }]);
    expect(l.engine.aborted).toBe(1);
    l.engine.onend?.(); // a late end changes nothing
    expect(l.ends).toHaveLength(1);
  });

  it("an answer in time cancels the time-out", () => {
    const l = listen();
    l.t.advance(3000);
    l.engine.say("kiteloop");
    l.engine.onend?.();
    l.t.advance(20_000);
    expect(l.ends).toEqual([{ ok: true }]);
  });

  it("a browser without speech recognition says so at once; a start() that throws is reported too", () => {
    const ends: Array<SpeechEnd | null> = [];
    listenOnce({ engine: null, onText: () => {}, onEnd: (e) => ends.push(e) });
    expect(ends).toEqual([{ ok: false, reason: "unavailable", code: "unsupported" }]);
    class Throws extends Fake {
      start() {
        throw new DOMException("already started", "InvalidStateError");
      }
    }
    listenOnce({ engine: Throws as unknown as RecognitionCtor, timers: clock(), onText: () => {}, onEnd: (e) => ends.push(e) });
    expect(ends[1]).toEqual({ ok: false, reason: "unavailable", code: "InvalidStateError" });
  });

  it("failureOf: our own abort says nothing", () => {
    expect(failureOf("aborted")).toBeNull();
  });
});

describe("aborting before an app sound, and when the line, rider or view changes", () => {
  it("abortSpeech stops the running one without a message", () => {
    const l = listen();
    abortSpeech();
    expect(l.engine.aborted).toBe(1);
    expect(l.ends).toEqual([null]);
    l.engine.say("late words");
    l.engine.onend?.();
    expect(l.words).toEqual([]);
    expect(l.ends).toHaveLength(1);
  });

  it("the timer's beep aborts a running microphone first", () => {
    const l = listen();
    beep(1);
    expect(l.engine.aborted).toBe(1);
    expect(l.ends).toEqual([null]);
  });
});
