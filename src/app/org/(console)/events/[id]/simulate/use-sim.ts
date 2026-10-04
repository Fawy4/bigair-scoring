"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SimStatus } from "@/lib/simulator/types";
import { createClient } from "@/lib/supabase/browser";
import { simErrorSentence } from "@/lib/simulator/errors";
import { getSimStatus, noteStateChange, tick } from "./actions";

/**
 * A steady beat that keeps its rhythm in a background tab: a tab's own timers are slowed to once a minute after a few minutes in the background, and the owner will be
 * watching the public page in another tab. A worker's timer is not slowed that way. Falls back to a plain interval where workers are not available.
 */
function useBeat(onBeat: () => void, ms: number, on: boolean) {
  const handler = useRef(onBeat);
  handler.current = onBeat;
  useEffect(() => {
    if (!on) return;
    let worker: Worker | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    try {
      const url = URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${ms});`], { type: "text/javascript" }));
      worker = new Worker(url);
      URL.revokeObjectURL(url);
      worker.onmessage = () => handler.current();
    } catch {
      timer = setInterval(() => handler.current(), ms);
    }
    handler.current();
    return () => {
      worker?.terminate();
      if (timer) clearInterval(timer);
    };
  }, [ms, on]);
}

/** The panel's state: the latest status from the server, the auto-play beat while playing, and one place to run a button's action. */
export function useSim(eventId: string, initial: SimStatus) {
  const [status, setStatus] = useState(initial);
  const [line, setLine] = useState(initial.line);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const refreshing = useRef(false);

  const again = useRef(false);
  const refresh = useCallback(async () => {
    // a refresh already on its way started before whatever just happened, so it may carry the old state: ask for one more when it is done
    if (refreshing.current) {
      again.current = true;
      return;
    }
    refreshing.current = true;
    try {
      do {
        again.current = false;
        const r = await getSimStatus(eventId);
        if (r.kind === "ok") {
          setStatus(r.status);
          setLine((old) => (r.status.control.state === "playing" ? old : r.status.line));
        }
      } while (again.current);
    } finally {
      refreshing.current = false;
    }
  }, [eventId]);

  const playing = status.control.state === "playing";
  const ticking = useRef(false);
  useBeat(
    () => {
      if (ticking.current) return;
      ticking.current = true;
      void tick(eventId)
        .then((r) => {
          if (r.ok) setLine(r.line);
          else setMessage({ ok: false, text: r.message });
        })
        .finally(() => {
          ticking.current = false;
          void refresh();
        });
    },
    2000,
    playing,
  );
  // one pause state: the console's Pause or Resume changes the simulator's state in the database, so the panel looks every second (Polish 2b, item 1)
  useBeat(() => void refresh(), 1000, true);
  // server actions of one tab run one after another, so a refresh can wait behind a tick: the state word is also read straight from the database (the organiser may
  // read it), once a second, so a Pause or Resume pressed on the console shows here at once
  const stateRef = useRef(status.control.state);
  stateRef.current = status.control.state;
  useBeat(
    () => {
      void createClient()
        .from("sim_control")
        .select("state")
        .eq("event_id", eventId)
        .maybeSingle()
        .then(({ data }) => {
          const next = data?.state;
          if (next && next !== stateRef.current && (next === "playing" || next === "paused" || next === "stopped")) {
            stateRef.current = next;
            setStatus((old) => ({ ...old, control: { ...old.control, state: next } }));
            void refresh();
          }
        });
    },
    1000,
    true,
  );

  /**
   * Runs an action and shows its answer. With `guess` the screen changes at once (the button that was pressed looks pressed before the server has heard of it) and goes
   * back if the server refuses; the status is read again in the background to confirm, and the buttons are free again as soon as the server has answered.
   */
  const statusNow = useRef(status);
  statusNow.current = status;
  const act = useCallback(
    async <R extends { ok: boolean }>(run: () => Promise<R>, okText?: (r: Extract<R, { ok: true }>) => string | null, guess?: (s: SimStatus) => SimStatus): Promise<R> => {
      setPending(true);
      setMessage(null);
      const before = statusNow.current;
      if (guess) setStatus(guess(before));
      try {
        const r = await run();
        if (!r.ok) {
          setMessage({ ok: false, text: (r as unknown as { message: string }).message });
          if (guess) setStatus((now) => (JSON.stringify(now.control) === JSON.stringify(guess(before).control) ? before : now));
        } else {
          const text = okText?.(r as Extract<R, { ok: true }>);
          if (text) setMessage({ ok: true, text });
        }
        void refresh();
        return r;
      } finally {
        setPending(false);
      }
    },
    [refresh],
  );

  // The state and speed are also followed on the realtime channel: a Pause or Resume pressed on the head judge's console shows here the moment it is written, not at
  // the next look (the once-a-second look above stays as the safety net).
  useEffect(() => {
    const db = createClient();
    const ch = db
      .channel(`sim-control-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sim_control", filter: `event_id=eq.${eventId}` }, (p) => {
        const row = p.new as { state?: string; speed?: number } | undefined;
        if (!row) return;
        const state = row.state === "playing" || row.state === "paused" || row.state === "stopped" ? row.state : null;
        if (state) stateRef.current = state;
        setStatus((old) => ({ ...old, control: { ...old.control, ...(state ? { state } : {}), ...(typeof row.speed === "number" ? { speed: row.speed } : {}) } }));
        void refresh();
      })
      .subscribe();
    return () => void db.removeChannel(ch);
  }, [eventId, refresh]);

  /**
   * Pause and Resume go straight to the database from this browser (server actions of one tab wait for each other, so behind a tick they could take seconds):
   * the simulator's state and the heats' clocks change together, the virtual officials stop at their next look, and the screen says so at once.
   */
  const playDirect = useCallback(
    async (next: "paused" | "playing") => {
      setPending(true);
      setMessage(null);
      try {
        const db = createClient();
        const set = await db.rpc("sim_set", { p_event: eventId, p_patch: { state: next } });
        if (set.error) return setMessage({ ok: false, text: simErrorSentence(set.error.message) });
        stateRef.current = next;
        setStatus((old) => ({ ...old, control: { ...old.control, state: next } }));
        const heats = await db.rpc(next === "paused" ? "sim_pause_heats" : "sim_resume_heats", { p_event: eventId });
        if (heats.error) return setMessage({ ok: false, text: simErrorSentence(heats.error.message) });
        void noteStateChange(eventId, next, heats.data ?? 0);
        void refresh();
      } finally {
        setPending(false);
      }
    },
    [eventId, refresh],
  );

  return { status, line, message, pending, act, refresh, setMessage, playDirect };
}
