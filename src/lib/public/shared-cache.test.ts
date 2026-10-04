import { describe, expect, it } from "vitest";
import { createSharedCache, createValve } from "./shared-cache";

// Fix 2, item 1(a)/(b): 300 phones asking for the same page cost one read per ttl; a unavailable read is never kept; the valve admits at most N at once.
const clock = () => {
  let t = 1_000;
  return { now: () => t, tick: (ms: number) => (t += ms) };
};

describe("shared cache (the public answers, about 3 s)", () => {
  it("300 callers at the same moment cost one read, and the next 3 s cost none", async () => {
    const c = clock();
    const cache = createSharedCache({ ttlMs: 3000, now: c.now });
    let reads = 0;
    const load = async () => {
      reads++;
      await new Promise((r) => setTimeout(r, 5));
      return { n: reads };
    };
    const first = await Promise.all(Array.from({ length: 300 }, () => cache.get("site:a", load)));
    expect(reads).toBe(1);
    expect(new Set(first.map((x) => x.n))).toEqual(new Set([1]));
    c.tick(2999);
    await cache.get("site:a", load);
    expect(reads).toBe(1);
    c.tick(2);
    expect((await cache.get("site:a", load)).n).toBe(2);
    expect(reads).toBe(2);
  });

  it("publish shows within one ttl: the answer after the ttl is the new one", async () => {
    const c = clock();
    const cache = createSharedCache({ ttlMs: 3000, now: c.now });
    let published = false;
    const load = async () => ({ published });
    expect((await cache.get("results", load)).published).toBe(false);
    published = true;
    c.tick(3000);
    expect((await cache.get("results", load)).published).toBe(true);
  });

  it("different keys are different answers (event, page, heat)", async () => {
    const cache = createSharedCache({ ttlMs: 3000, now: clock().now });
    expect(await cache.get("a", async () => 1)).toBe(1);
    expect(await cache.get("b", async () => 2)).toBe(2);
  });

  it("a failed read is not kept: the next caller reads again", async () => {
    const cache = createSharedCache({ ttlMs: 3000, now: clock().now });
    let n = 0;
    const load = async () => {
      if (++n === 1) throw new Error("down");
      return "ok";
    };
    await expect(cache.get("k", load)).rejects.toThrow("down");
    expect(await cache.get("k", load)).toBe("ok");
  });

  it("ttl 0 only joins reads that are in flight (the Flag view: never older than the read itself)", async () => {
    const c = clock();
    const cache = createSharedCache({ ttlMs: 3000, now: c.now });
    let reads = 0;
    const load = async () => {
      reads++;
      await new Promise((r) => setTimeout(r, 5));
      return reads;
    };
    const together = await Promise.all([cache.get("flag", load, 0), cache.get("flag", load, 0), cache.get("flag", load, 0)]);
    expect(together).toEqual([1, 1, 1]);
    c.tick(1);
    expect(await cache.get("flag", load, 0)).toBe(2);
  });

  it("stays small: old keys are dropped", async () => {
    const c = clock();
    const cache = createSharedCache({ ttlMs: 3000, now: c.now, maxKeys: 10 });
    for (let i = 0; i < 50; i++) {
      await cache.get(`k${i}`, async () => i);
      c.tick(10);
    }
    expect(cache.size()).toBeLessThanOrEqual(10);
  });
});

describe("valve (more than N public requests in flight → a calm Updating page)", () => {
  it("admits N, refuses the next, admits again after one leaves", () => {
    const v = createValve(3);
    const a = v.enter(), b = v.enter(), c = v.enter();
    expect([a, b, c].every(Boolean)).toBe(true);
    expect(v.enter()).toBeNull();
    a!();
    expect(v.inFlight()).toBe(2);
    expect(v.enter()).not.toBeNull();
  });
  it("leaving twice does not free a second place", () => {
    const v = createValve(1);
    const a = v.enter()!;
    a();
    a();
    expect(v.inFlight()).toBe(0);
    v.enter();
    expect(v.enter()).toBeNull();
  });
});
