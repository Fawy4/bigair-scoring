"use client";

import { useEffect, useState } from "react";
import { FlagStrip } from "@/components/live/flag-strip";
import { publicFlagAt, type PublicFlagData } from "@/lib/public/flag-data";
import { textOn } from "@/lib/live/flags";
import { formatClock } from "@/lib/live/timer";
import { cn } from "@/lib/utils";

/** The server's time on this page: the server's clock at the moment it sent the data, kept going by this phone's clock (so a wrong phone clock does not matter). */
export function useServerNow(serverNow: string, everyMs = 250): number {
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.parse(serverNow));
  useEffect(() => {
    const off = Date.parse(serverNow) - Date.now();
    setOffset(off);
    setNow(Date.now() + off);
  }, [serverNow]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset), everyMs);
    return () => clearInterval(t);
  }, [offset, everyMs]);
  return now;
}

/** The flag strip on the public live tab and the home page: same strip as the officials' screens, drawn from the heat's time stamps. */
export function PublicFlagStrip({ data }: { data: PublicFlagData }) {
  const now = useServerNow(data.serverNow);
  const at = publicFlagAt(data, now);
  if (!at) return null;
  return (
    <div data-testid="public-flag" className="flex">
      <FlagStrip model={{ state: at.state, words: at.words, heatName: data.heatName, heatShort: data.heatShort }} />
    </div>
  );
}

/**
 * The big screen's flag: a coloured frame around the whole screen in the state's colour, and in the header the state's word and countdown, large. The frame
 * ignores taps (the Day / Dark control keeps working) and shows in both modes.
 */
export function BigScreenFlag({ data }: { data: PublicFlagData }) {
  const now = useServerNow(data.serverNow);
  const at = publicFlagAt(data, now);
  if (!at) return null;
  const { state, words } = at;
  return (
    <>
      <div data-testid="screen-flag-frame" data-flag={state.kind} aria-hidden className="pointer-events-none absolute inset-0 z-20 border-[1.4vw]" style={{ borderColor: state.colour }} />
      <p
        data-testid="screen-flag"
        data-flag={state.kind}
        data-why={state.why ?? ""}
        role="status"
        className={cn("ml-auto flex max-w-[64vw] shrink-0 flex-wrap items-baseline gap-x-[1.5vw] rounded-[1vw] px-[2vw] py-[0.4vw]")}
        style={{ backgroundColor: state.colour, color: textOn(state.colour) }}
      >
        <span data-testid="screen-flag-word" className="min-w-0 break-words text-[3.4vw] font-bold">
          {words}
        </span>
        {state.countdownMs !== null ? (
          <span data-testid="screen-flag-countdown" className="text-[6vw] font-bold leading-none tabular-nums">
            {formatClock(state.countdownMs)}
          </span>
        ) : null}
      </p>
    </>
  );
}
