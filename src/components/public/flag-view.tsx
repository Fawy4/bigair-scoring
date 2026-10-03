"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { RiderLabel } from "@/components/rider-label";
import { useFlagHorns } from "@/components/live/live-hooks";
import { unlockSound } from "@/lib/live/beep";
import { textOn } from "@/lib/live/flags";
import { formatClock } from "@/lib/live/timer";
import { holdScreenAwake } from "@/lib/live/wake-lock";
import { publicFlagAt } from "@/lib/public/flag-data";
import type { FlagViewPayload } from "@/lib/public/flag-view";
import { copy } from "@/lib/ui-copy";

const V = copy.flags.view;
/** The flag screen asks every second, and a screen that has heard nothing for ten seconds stops showing a colour (a stale green must never be shown). */
export const POLL_MS = 1000;
export const STALE_MS = 10_000;
const GREY = "#4B5563";

/**
 * The Flag view: the whole screen is the flag. The state's colour fills it, the state's word and the countdown fill the middle (black on yellow, white on green and
 * red, readable from 20 m), under them the heat and its riders with their Lycra colours. A tap on "Sound on" lets it sound the horns on every change (the iPhone
 * rule); the screen stays awake while the page is open. If the page has had no contact with the server for 10 seconds the whole screen turns grey and says so.
 */
export function FlagView({ slug, initial, pollMs = POLL_MS, staleMs = STALE_MS }: { slug: string; initial: FlagViewPayload; pollMs?: number; staleMs?: number }) {
  const [payload, setPayload] = useState<FlagViewPayload>(initial);
  // the server's clock minus this device's, from the last answer; the contact time is on this device's clock only to measure silence
  const offset = useRef(initial.data ? Date.parse(initial.data.serverNow) - Date.now() : 0);
  const lastContact = useRef(Date.now());
  const [now, setNow] = useState(() => (initial.data ? Date.parse(initial.data.serverNow) : Date.now()));
  const [stale, setStale] = useState(false);
  const [soundOn, setSoundOn] = useState(false);

  const poll = useCallback(async () => {
    const sent = Date.now();
    try {
      const res = await fetch(`/e/${encodeURIComponent(slug)}/flag/data`, { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as FlagViewPayload & { found?: boolean };
      if (body.found === false) return;
      const received = Date.now();
      if (body.data) offset.current = Date.parse(body.data.serverNow) - (sent + received) / 2;
      lastContact.current = received;
      setPayload(body);
    } catch {
      /* no contact: the silence counter keeps running */
    }
  }, [slug]);

  useEffect(() => {
    void poll();
    const p = setInterval(() => void poll(), pollMs);
    const onVisible = () => document.visibilityState === "visible" && void poll();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      clearInterval(p);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [poll, pollMs]);

  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now() + offset.current);
      setStale(Date.now() - lastContact.current > staleMs);
    }, 250);
    return () => clearInterval(t);
  }, [staleMs]);

  useEffect(() => holdScreenAwake(), []);

  const at = payload.data && !stale ? publicFlagAt(payload.data, now) : null;
  useFlagHorns(at?.state ?? null, soundOn);

  const colour = stale ? GREY : (at?.state.colour ?? GREY);
  const ink = stale ? "#FFFFFF" : textOn(colour);
  const state = at?.state ?? null;

  return (
    <main
      data-testid="flag-view"
      data-flag={stale ? "stale" : (state?.kind ?? (payload.flagsOff ? "off" : "none"))}
      data-why={state?.why ?? ""}
      style={{ backgroundColor: colour, color: ink }}
      className="fixed inset-0 flex flex-col overflow-hidden px-[4vw] py-[3vh]"
    >
      <header className="flex items-center justify-between gap-3 text-[clamp(1rem,2.4vw,1.6rem)] font-semibold">
        <span data-testid="flag-event" className="min-w-0 truncate">
          {payload.eventName}
        </span>
        <button
          type="button"
          data-testid="flag-sound"
          aria-pressed={soundOn}
          onClick={() => {
            unlockSound();
            setSoundOn((v) => !v);
          }}
          style={{ borderColor: ink }}
          className="inline-flex min-h-[56px] shrink-0 items-center gap-2 rounded-xl border-2 px-4 text-[clamp(1rem,2.2vw,1.4rem)] font-bold"
        >
          {soundOn ? <Volume2 aria-hidden className="size-6" /> : <VolumeX aria-hidden className="size-6" />}
          {soundOn ? V.soundOn : V.soundOff}
        </button>
      </header>

      <section aria-live="polite" className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
        {stale ? (
          <p data-testid="flag-label" className="text-[clamp(2.5rem,9vw,7rem)] font-extrabold leading-none">
            {V.noConnection}
          </p>
        ) : payload.flagsOff ? (
          <p data-testid="flag-label" className="text-[clamp(2rem,7vw,5rem)] font-extrabold leading-tight">
            {V.flagsOff}
          </p>
        ) : state ? (
          <>
            <p data-testid="flag-label" className="max-w-full text-[clamp(2.5rem,11vw,9rem)] font-extrabold leading-none">
              {state.label}
            </p>
            {state.countdownMs !== null ? (
              <p data-testid="flag-countdown" className="mt-[1vh] text-[clamp(5rem,30vw,22rem)] font-extrabold leading-none tabular-nums">
                {formatClock(state.countdownMs)}
              </p>
            ) : null}
            {at?.words && state.kind === "stopped" && at.words !== state.label ? (
              <p data-testid="flag-words" className="mt-[1vh] max-w-full text-[clamp(1.25rem,3.6vw,2.6rem)] font-bold">
                {at.words}
              </p>
            ) : null}
          </>
        ) : null}
      </section>

      {!stale && payload.data?.heatName ? (
        <footer className="rounded-2xl bg-white p-3 text-black">
          <p data-testid="flag-heat" className="truncate text-[clamp(1.25rem,3vw,2.2rem)] font-bold">
            {payload.data.heatName}
          </p>
          <ul data-testid="flag-riders" className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {payload.riders.map((r) => (
              <li key={r.key} data-testid="flag-rider" className="min-w-0">
                {r.label ? <RiderLabel model={r.label} variant="live" bare /> : <span className="text-name font-semibold">{r.text}</span>}
              </li>
            ))}
          </ul>
        </footer>
      ) : null}
    </main>
  );
}
