"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseError } from "@/lib/live/errors";
import { createIdbStore } from "@/lib/live/queue-idb";
import { SendQueue, type QueueEntry, type QueueKind, type SendResult } from "@/lib/live/queue";

/** One failed answer from the server, sorted into: sent, try again later, refused for good, or failed. */
export function classify(res: { error: { message: string } | null; status?: number }): SendResult {
  if (!res.error) return { ok: true };
  const { code } = parseError(res.error.message);
  if (code) return { ok: false, code, message: res.error.message };
  if (res.status === 0 || /fetch|network|failed to load|timeout|load failed/i.test(res.error.message)) return { ok: false, network: true };
  if ((res.status ?? 0) >= 500) return { ok: false, status: res.status };
  return { ok: false, status: res.status, message: res.error.message };
}

/** What the server answered to a send that worked: the saved row, so the screen can show it before the stream delivers it. */
export type SavedRow = { id: string; heat_id?: string; updated_at?: string } & Record<string, unknown>;

async function send(supabase: SupabaseClient, item: QueueEntry, onSaved?: (kind: QueueKind, row: SavedRow) => void): Promise<SendResult> {
  const p = item.payload as Record<string, unknown>;
  const done = (r: { data: unknown; error: { message: string } | null; status?: number }): SendResult => {
    const result = classify(r);
    if (result.ok && r.data && typeof r.data === "object") onSaved?.(item.kind, r.data as SavedRow);
    return result;
  };
  switch (item.kind) {
    case "attempt": {
      const r = await supabase.rpc("add_attempt", {
        p_heat: p.heatId,
        p_entry: p.entryId,
        p_client_key: item.clientKey,
        p_status: p.status,
        p_direction: p.direction ?? null,
        p_category_key: p.categoryKey ?? null,
        p_trick_name: p.trickName ?? null,
        p_trick_parts: p.trickParts ?? {},
        p_input_method: p.inputMethod ?? "builder",
        p_raw_text: p.rawText ?? null,
      });
      return done(r);
    }
    case "trick_score":
      return done(
        await supabase.rpc("submit_trick_score", {
          p_attempt: p.attemptId,
          p_criteria: p.criteria ?? {},
          p_score: p.missed ? null : p.score,
          p_missed: Boolean(p.missed),
          p_flag: null,
          p_client_key: item.clientKey,
          p_client_rev: item.clientRev,
        }),
      );
    case "impression":
      return done(await supabase.rpc("submit_impression", { p_heat: p.heatId, p_entry: p.entryId, p_value: p.value, p_client_key: item.clientKey, p_client_rev: item.clientRev }));
    case "line_score":
      // a score typed on a Rider sheet line: the server keeps it as a pending note, or (when the attempt has been logged meanwhile) gives it to that attempt
      return done(await supabase.rpc("set_line_score", { p_heat: p.heatId, p_entry: p.entryId, p_line: p.line, p_score: p.score, p_client_key: item.clientKey, p_client_rev: item.clientRev }));
    case "line_clear": {
      const r = await supabase.rpc("clear_line_score", { p_heat: p.heatId, p_entry: p.entryId, p_line: p.line });
      return classify(r);
    }
    case "flag":
      return done(await supabase.rpc("submit_flag", { p_attempt: p.attemptId, p_kind: p.kind, p_note: p.note ?? null, p_client_key: item.clientKey }));
  }
}

const uuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`);

/**
 * The phone's send queue (docs/08 §1G-7): every attempt, score, impression and flag is saved on the phone first (IndexedDB, so a reload loses nothing)
 * and sent in order with retries and an idempotency key. `badge` is the "Synced / Pending n / Offline / Failed" pill.
 */
export function useSendQueue(supabase: SupabaseClient, now: () => number, storeName: string, online: boolean, onSaved?: (kind: QueueKind, row: SavedRow) => void) {
  const [version, setVersion] = useState(0);
  const [memoryOnly, setMemoryOnly] = useState(false);
  const nowRef = useRef(now);
  nowRef.current = now;
  const savedRef = useRef(onSaved);
  savedRef.current = onSaved;
  const queue = useMemo(
    () =>
      new SendQueue({
        store: createIdbStore(storeName, () => setMemoryOnly(true)),
        send: (item) => send(supabase, item, (k, row) => savedRef.current?.(k, row)),
        now: () => nowRef.current(),
        newKey: uuid,
      }),
    [supabase, storeName],
  );
  useEffect(() => {
    let live = true;
    const unsub = queue.subscribe(() => live && setVersion((v) => v + 1));
    void queue.restore().then(() => queue.flush());
    const tick = setInterval(() => {
      if (queue.nextDueIn() === 0) void queue.flush();
    }, 1000);
    const again = () => void queue.flush();
    window.addEventListener("online", again);
    return () => {
      live = false;
      unsub();
      clearInterval(tick);
      window.removeEventListener("online", again);
    };
  }, [queue]);
  const enqueue = useCallback(
    (kind: QueueKind, key: string, payload: Record<string, unknown>, clientKey?: string) => {
      const e = queue.enqueue({ kind, key, payload, clientKey });
      void queue.flush();
      return e;
    },
    [queue],
  );
  const items = useMemo(() => queue.list(), [queue, version]); // eslint-disable-line react-hooks/exhaustive-deps
  return { queue, items, enqueue, badge: queue.badge(online), memoryOnly, uuid };
}
