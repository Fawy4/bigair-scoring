import { describe, expect, it } from "vitest";
import { withTickLock, type LockRpc } from "./tick-lock";

// Polish 2, item 4b: one page asks for a step every 2 seconds; each step must give the lock back when it is done, so two consecutive steps both run.
// The fake below behaves like sim_tick_begin / sim_tick_end: a lock with a time limit and a token.
function fakeDb(clock: { now: number }): LockRpc & { holder: () => string | null } {
  let until = 0;
  let token: string | null = null;
  let n = 0;
  return {
    holder: () => (until > clock.now ? token : null),
    async begin(ms) {
      if (until > clock.now) return null;
      token = `t${++n}`;
      until = clock.now + ms;
      return token;
    },
    async end(t) {
      if (t !== token) return false;
      until = 0;
      token = null;
      return true;
    },
  };
}

describe("the tick lock", () => {
  it("two consecutive ticks from one page both run (2 s apart, each takes about a second)", async () => {
    const clock = { now: 0 };
    const db = fakeDb(clock);
    const ran: number[] = [];
    const step = async (i: number) => {
      clock.now += 1000;
      ran.push(i);
      return "ok";
    };
    const first = await withTickLock(db, () => step(1));
    clock.now += 1000;
    const second = await withTickLock(db, () => step(2));
    expect(first).toEqual({ busy: false, value: "ok" });
    expect(second).toEqual({ busy: false, value: "ok" });
    expect(ran).toEqual([1, 2]);
    expect(db.holder()).toBeNull();
  });
  it("a second tab asking while a step is still working is told it is busy (the only thing the lock is for)", async () => {
    const clock = { now: 0 };
    const db = fakeDb(clock);
    let inner: Awaited<ReturnType<typeof withTickLock<string>>> | null = null;
    await withTickLock(db, async () => {
      inner = await withTickLock(db, async () => "second tab");
      return "first tab";
    });
    expect(inner).toEqual({ busy: true });
  });
  it("a step that fails gives the lock back too", async () => {
    const clock = { now: 0 };
    const db = fakeDb(clock);
    await expect(withTickLock(db, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(db.holder()).toBeNull();
    expect(await withTickLock(db, async () => "next")).toEqual({ busy: false, value: "next" });
  });
});
