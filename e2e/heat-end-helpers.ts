import type { Browser, BrowserContext, Page } from "@playwright/test";
import { installSupabaseProxy } from "./base";
import type { LiveWorld, SeatKey } from "./live-world";

/** Shared by the HE1 browser tests (heat-end*.spec.ts): a phone with its own login, and the database doing the part of the heat that is not under test. */
export const laptop = { width: 1500, height: 1000 };
export const phoneSize = { width: 390, height: 844 };

export async function phone(w: LiveWorld, contexts: BrowserContext[], browser: Browser, key: SeatKey, path: string, size: { width: number; height: number } = phoneSize): Promise<Page> {
  const context = await browser.newContext({ viewport: size });
  contexts.push(context);
  await installSupabaseProxy(context, { officialsOnly: true }); // exactly what an official's phone is on the live site: the Rider sheet only
  const page = await context.newPage();
  await w.signInAs(page, key, path);
  return page;
}

/** A heat that has ended (not yet published): one landed line for each of the first `riders` riders (all four by default, so no two totals tie), ended `endedAgoSec` seconds ago. */
export async function endedHeat(w: LiveWorld, heat: string, o: { riders?: number; endedAgoSec?: number } = {}): Promise<string[]> {
  const ago = (sec: number) => new Date(Date.now() - sec * 1000).toISOString();
  await w.db.from("heats").update({ status: "ended", started_at: ago((o.endedAgoSec ?? 60) + 600), ended_at: ago(o.endedAgoSec ?? 60) }).eq("id", heat);
  const ids: string[] = [];
  for (const [i, entry] of w.entries.slice(0, o.riders ?? 4).entries()) {
    // logged a few minutes ago: the spotter is not "still logging" unless a test makes him so
    const then = ago((o.endedAgoSec ?? 60) + 300);
    const a = await w.db.from("trick_attempts").insert({ heat_id: heat, entry_id: entry, seq: 1, status: "landed", trick_name: "Backroll", direction: "left", client_key: crypto.randomUUID(), created_by_seat: w.seats.spotter.id, created_at: then, updated_at: then }).select("id").single();
    ids.push(a.data!.id);
    void i;
  }
  return ids;
}

/** Every judge has scored every landed line (the first rider's best, so no two totals tie), given a Variety score to every rider, and submitted (as the database sees it). */
export async function judgesFinish(w: LiveWorld, heat: string, keys: SeatKey[] = ["j1", "j2", "j3"]) {
  const rows = (await w.db.from("trick_attempts").select("id, status").eq("heat_id", heat).is("deleted_at", null)).data ?? [];
  for (const key of keys) {
    for (const [i, a] of rows.filter((x) => x.status === "landed").entries()) await w.db.from("trick_scores").upsert({ attempt_id: a.id, heat_id: heat, event_id: w.eventId, judge_seat_id: w.seats[key].id, score: 8 - i * 0.5, client_key: crypto.randomUUID(), client_rev: 1 }, { onConflict: "attempt_id,judge_seat_id" });
    for (const e of w.entries) await w.db.from("impression_scores").upsert({ heat_id: heat, entry_id: e, judge_seat_id: w.seats[key].id, event_id: w.eventId, value: 6, client_key: crypto.randomUUID(), client_rev: 1 }, { onConflict: "heat_id,entry_id,judge_seat_id" });
    await w.db.from("judge_sheets").upsert({ event_id: w.eventId, heat_id: heat, judge_seat_id: w.seats[key].id, submitted_at: new Date().toISOString() }, { onConflict: "heat_id,judge_seat_id" });
  }
}

/** Settings of the event written by the test (the Event step's own fields, merged into what is there). */
export async function eventSettings(w: LiveWorld, patch: Record<string, unknown>) {
  const { data } = await w.db.from("events").select("settings").eq("id", w.eventId).single();
  await w.db.from("events").update({ settings: { ...((data?.settings ?? {}) as object), ...patch } as never }).eq("id", w.eventId);
}
