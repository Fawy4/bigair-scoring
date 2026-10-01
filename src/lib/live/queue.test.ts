// docs/08 §1G-7: the send queue.
import { describe, expect, it } from "vitest";
import { backoffMs, MemoryStore, SendQueue, type QueueEntry, type SendResult } from "./queue";

function make(send: (i: QueueEntry) => SendResult | Promise<SendResult>, store = new MemoryStore()) {
  const clock = { t: 1_000_000 };
  let n = 0;
  const q = new SendQueue({ store, send: async (i) => send(i), now: () => clock.t, newKey: () => `k${++n}` });
  return { q, clock, store };
}

describe("the send queue", () => {
  it("20 s offline, three edits of one score and one of another → exactly 2 sends, the newest value wins, then Synced", async () => {
    let online = false;
    const sent: QueueEntry[] = [];
    const { q, clock } = make((i) => {
      if (!online) return { ok: false, network: true };
      sent.push(i);
      return { ok: true };
    });
    q.enqueue({ kind: "trick_score", key: "score:a1", payload: { score: 7.0 } });
    q.enqueue({ kind: "trick_score", key: "score:a1", payload: { score: 7.5 } });
    q.enqueue({ kind: "trick_score", key: "score:a2", payload: { score: 6.0 } });
    q.enqueue({ kind: "trick_score", key: "score:a1", payload: { score: 8.0 } });
    await q.flush();
    expect(q.badge(false)).toEqual({ status: "pending", pending: 2 });
    for (let s = 0; s < 20; s++) {
      clock.t += 1000;
      await q.flush();
    }
    expect(sent).toHaveLength(0);
    expect(q.badge(false)).toEqual({ status: "pending", pending: 2 });
    online = true;
    clock.t += 30_000;
    await q.flush();
    expect(sent.map((i) => [i.key, i.payload.score])).toEqual([["score:a1", 8.0], ["score:a2", 6.0]]);
    expect(q.badge(true)).toEqual({ status: "synced", pending: 0 });
    expect(q.list()).toHaveLength(0);
  });

  it("backoff after a network failure: 1, 2, 4, 8, 16 s, then 30 s every time", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(backoffMs)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });

  it("an item is not tried again before its backoff has passed", async () => {
    let calls = 0;
    const { q, clock } = make(() => {
      calls++;
      return { ok: false, network: true };
    });
    q.enqueue({ kind: "impression", key: "imp:a", payload: {} });
    await q.flush();
    await q.flush();
    expect(calls).toBe(1);
    clock.t += 999;
    await q.flush();
    expect(calls).toBe(1);
    clock.t += 1;
    await q.flush();
    expect(calls).toBe(2);
    expect(q.nextDueIn()).toBe(2000);
  });

  it("a named refusal is never sent again and does not make the pill red", async () => {
    let calls = 0;
    const { q, clock } = make(() => {
      calls++;
      return { ok: false, code: "ATTEMPT_CAP_REACHED" };
    });
    const e = q.enqueue({ kind: "attempt", key: "k", clientKey: "attempt-1", payload: { entry: "red" } });
    await q.flush();
    clock.t += 120_000;
    await q.flush();
    expect(calls).toBe(1);
    expect(q.list()[0]).toMatchObject({ clientKey: e.clientKey, state: "refused", code: "ATTEMPT_CAP_REACHED" });
    expect(q.badge(true).status).toBe("synced");
    expect(q.counts().refused).toBe(1);
    q.clearRefused("attempt-1");
    expect(q.list()).toHaveLength(0);
  });

  it("a server error stays pending; an unknown error is failed until the person taps retry", async () => {
    let mode: SendResult = { ok: false, status: 503 };
    const { q, clock } = make(() => mode);
    q.enqueue({ kind: "flag", key: "flag:a", payload: {} });
    await q.flush();
    expect(q.list()[0].state).toBe("pending");
    mode = { ok: false, status: 400, code: "SOMETHING_ODD" };
    clock.t += 2000;
    await q.flush();
    expect(q.list()[0].state).toBe("failed");
    expect(q.badge(true).status).toBe("failed");
    mode = { ok: true };
    q.retryFailed();
    await q.flush();
    expect(q.list()).toHaveLength(0);
  });

  it("an edit made while an older one is in the air is sent next, never lost; revisions only go up", async () => {
    const sent: Array<[number, unknown]> = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    let first = true;
    const { q } = make(async (i) => {
      sent.push([i.clientRev, i.payload.score]);
      if (first) {
        first = false;
        await gate;
      }
      return { ok: true };
    });
    q.enqueue({ kind: "trick_score", key: "score:a1", payload: { score: 7.0 } });
    const flushing = q.flush();
    await Promise.resolve();
    q.enqueue({ kind: "trick_score", key: "score:a1", payload: { score: 7.5 } });
    release();
    await flushing;
    await q.flush();
    expect(sent.map((s) => s[1])).toEqual([7.0, 7.5]);
    expect(sent[1][0]).toBeGreaterThan(sent[0][0]);
    expect(q.list()).toHaveLength(0);
  });

  it("unsent items survive a reload", async () => {
    const store = new MemoryStore();
    const a = make(() => ({ ok: false, network: true }), store);
    a.q.enqueue({ kind: "trick_score", key: "score:a1", payload: { score: 7.5 } });
    a.q.enqueue({ kind: "attempt", key: "k9", clientKey: "k9", payload: { entry: "blue" } });
    await a.q.flush();
    await Promise.resolve();
    const sent: string[] = [];
    const b = make((i) => {
      sent.push(i.key);
      return { ok: true };
    }, store);
    await b.q.restore();
    expect(b.q.list()).toHaveLength(2);
    await b.q.flush();
    expect(sent).toEqual(["score:a1", "k9"]);
  });

  it("attempts are never merged: two taps are two attempts", () => {
    const { q } = make(() => ({ ok: true }));
    q.enqueue({ kind: "attempt", key: "x1", clientKey: "x1", payload: {} });
    q.enqueue({ kind: "attempt", key: "x2", clientKey: "x2", payload: {} });
    expect(q.list()).toHaveLength(2);
  });
});
