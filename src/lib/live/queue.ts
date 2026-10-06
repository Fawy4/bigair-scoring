/**
 * The send queue of the official phones (docs/08 §1G-7). Pure: storage and the network are passed in, the tests use an in-memory store.
 * Every score and attempt is saved on the phone first and sent in order; a newer edit of the same score replaces an older one that is still waiting.
 */
export type QueueKind = "attempt" | "trick_score" | "impression" | "flag" | "line_score" | "line_clear";
export type ItemState = "pending" | "synced" | "failed" | "refused";

export interface QueueEntry {
  clientKey: string;
  /** Newer edits win on the server: it ignores a revision that is not newer than the one it holds. */
  clientRev: number;
  kind: QueueKind;
  /** Same key = same thing being edited (a score of one attempt). Attempts are never replaced: their key is their own client key. */
  key: string;
  payload: Record<string, unknown>;
  state: ItemState;
  tries: number;
  nextAt: number;
  code?: string;
  message?: string;
}

export type SendResult = { ok: true } | { ok: false; network?: boolean; status?: number; code?: string; message?: string };

/** Named refusals: the server said no on purpose, so the item is never sent again. */
export const REFUSALS: ReadonlySet<string> = new Set([
  "ATTEMPT_CAP_REACHED",
  "NOT_ALLOWED",
  "SHEET_LOCKED",
  "HEAT_NOT_RUNNING",
  "NOT_SCORABLE",
  "RIDER_NOT_IN_HEAT",
  "RIDER_NOT_RIDING",
  "ATTEMPT_NOT_FOUND",
  "HEAT_NOT_FOUND",
  "CLIENT_KEY_REUSED",
  "ENTRY_NOT_IN_DIVISION",
  "LINE_PAST_CAP",
  "LINE_SCORE_NOT_AVAILABLE",
]);

/** 1, 2, 4, 8 and 16 seconds, then 30 seconds every time. */
export function backoffMs(tries: number): number {
  return tries >= 6 ? 30_000 : 1000 * 2 ** Math.max(0, tries - 1);
}

export interface QueueStore {
  load(): Promise<QueueEntry[]>;
  save(items: QueueEntry[]): Promise<void>;
}

export class MemoryStore implements QueueStore {
  private data: QueueEntry[] = [];
  async load() {
    return structuredClone(this.data);
  }
  async save(items: QueueEntry[]) {
    this.data = structuredClone(items);
  }
}

export type BadgeStatus = "synced" | "pending" | "offline" | "failed";

export interface QueueOptions {
  store: QueueStore;
  send: (item: QueueEntry) => Promise<SendResult>;
  /** Server-offset clock, in milliseconds. */
  now: () => number;
  newKey: () => string;
}

export class SendQueue {
  private items: QueueEntry[] = [];
  private inFlight = new Set<string>();
  private lastRev = new Map<string, number>();
  private flushing: Promise<void> | null = null;
  private again = false;
  private listeners = new Set<() => void>();

  constructor(private o: QueueOptions) {}

  /** Loads what an earlier visit left unsent; whatever was being sent when the page closed is simply sent again (the server ignores a repeat). */
  async restore(): Promise<void> {
    const saved = await this.o.store.load();
    this.items = saved.filter((i) => i.state !== "synced").map((i) => ({ ...i, nextAt: 0 }));
    for (const i of this.items) this.lastRev.set(i.key, Math.max(this.lastRev.get(i.key) ?? 0, i.clientRev));
    this.changed();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  list(): QueueEntry[] {
    return this.items.map((i) => ({ ...i }));
  }

  /** A new thing to send. For a score, flag or impression a newer edit of the same key replaces one that is still waiting. */
  enqueue(input: { kind: QueueKind; key: string; payload: Record<string, unknown>; clientKey?: string }): QueueEntry {
    const clientKey = input.clientKey ?? this.o.newKey();
    const rev = Math.max(Math.round(this.o.now()), (this.lastRev.get(input.key) ?? 0) + 1);
    this.lastRev.set(input.key, rev);
    const waiting = input.kind === "attempt" ? undefined : this.items.find((i) => i.key === input.key && i.state === "pending" && !this.inFlight.has(i.clientKey));
    let entry: QueueEntry;
    if (waiting) {
      waiting.payload = input.payload;
      waiting.clientKey = clientKey;
      waiting.clientRev = rev;
      entry = waiting;
    } else {
      entry = { clientKey, clientRev: rev, kind: input.kind, key: input.key, payload: input.payload, state: "pending", tries: 0, nextAt: 0 };
      this.items.push(entry);
    }
    this.changed();
    return { ...entry };
  }

  /** Sends everything that is due, in order. A failure of the network stops the round (later items would fail too) and schedules the retry. */
  flush(): Promise<void> {
    if (this.flushing) {
      this.again = true;
      return this.flushing;
    }
    this.flushing = (async () => {
      try {
        do {
          this.again = false;
          await this.round();
        } while (this.again);
      } finally {
        this.flushing = null;
      }
    })();
    return this.flushing;
  }

  private async round(): Promise<void> {
    for (const item of [...this.items]) {
      if (item.state !== "pending" || item.nextAt > this.o.now()) continue;
      this.inFlight.add(item.clientKey);
      const sentKey = item.clientKey;
      const sentRev = item.clientRev;
      let result: SendResult;
      try {
        result = await this.o.send({ ...item });
      } catch {
        result = { ok: false, network: true };
      }
      this.inFlight.delete(sentKey);
      const current = this.items.find((i) => i === item);
      if (!current) continue;
      if (result.ok) {
        // a newer edit may have been made while this one was in the air: it is still waiting and goes out next
        if (current.clientRev === sentRev) this.items = this.items.filter((i) => i !== current);
        else current.tries = 0;
      } else if (result.code && REFUSALS.has(result.code)) {
        current.state = "refused";
        current.code = result.code;
        current.message = result.message;
      } else if (result.network || (result.status !== undefined && result.status >= 500)) {
        current.tries += 1;
        current.nextAt = this.o.now() + backoffMs(current.tries);
        this.changed();
        break;
      } else {
        current.state = "failed";
        current.code = result.code;
        current.message = result.message;
      }
      this.changed();
    }
  }

  /** Milliseconds until the next item is due (null when nothing waits). */
  nextDueIn(): number | null {
    const waiting = this.items.filter((i) => i.state === "pending");
    if (!waiting.length) return null;
    return Math.max(0, Math.min(...waiting.map((i) => i.nextAt)) - this.o.now());
  }

  /** Takes an item back before it has been sent (Undo on a spotter's phone that has not reached the server yet). False when it already left. */
  cancel(clientKey: string): boolean {
    const item = this.items.find((i) => i.clientKey === clientKey);
    if (!item || item.state === "synced" || this.inFlight.has(clientKey)) return false;
    this.items = this.items.filter((i) => i !== item);
    this.changed();
    return true;
  }

  /** "Failed — tap to retry". */
  retryFailed(): void {
    for (const i of this.items) if (i.state === "failed") Object.assign(i, { state: "pending", tries: 0, nextAt: 0 });
    this.changed();
  }

  /** The screen has told the person about a refusal; the item goes away. */
  clearRefused(clientKey: string): void {
    this.items = this.items.filter((i) => !(i.clientKey === clientKey && i.state === "refused"));
    this.changed();
  }

  counts(): { pending: number; failed: number; refused: number } {
    const n = (s: ItemState) => this.items.filter((i) => i.state === s).length;
    return { pending: n("pending"), failed: n("failed"), refused: n("refused") };
  }

  /** The sync pill: failed first, then Pending n, then Offline, else Synced. Refusals are shown by their own message, not by the pill. */
  badge(online: boolean): { status: BadgeStatus; pending: number } {
    const c = this.counts();
    if (c.failed > 0) return { status: "failed", pending: c.pending };
    if (c.pending > 0) return { status: "pending", pending: c.pending };
    return { status: online ? "synced" : "offline", pending: 0 };
  }

  private changed(): void {
    void this.o.store.save(this.items);
    for (const fn of this.listeners) fn();
  }
}
