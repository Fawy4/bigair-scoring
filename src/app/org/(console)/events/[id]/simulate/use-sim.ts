"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SimStatus } from "@/lib/simulator/types";
import { getSimStatus, tick } from "./actions";

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
  useBeat(() => void refresh(), 3000, !playing);

  /** Runs an action, shows its answer, refreshes the status. */
  const act = useCallback(
    async <R extends { ok: boolean }>(run: () => Promise<R>, okText?: (r: Extract<R, { ok: true }>) => string | null): Promise<R> => {
      setPending(true);
      setMessage(null);
      try {
        const r = await run();
        if (!r.ok) setMessage({ ok: false, text: (r as unknown as { message: string }).message });
        else {
          const text = okText?.(r as Extract<R, { ok: true }>);
          if (text) setMessage({ ok: true, text });
        }
        await refresh();
        return r;
      } finally {
        setPending(false);
      }
    },
    [refresh],
  );

  return { status, line, message, pending, act, refresh, setMessage };
}
