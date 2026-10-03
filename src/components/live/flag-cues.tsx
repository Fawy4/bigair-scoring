"use client";

import { useEffect, useRef, useState } from "react";
import { FlagStrip, type FlagStripModel } from "./flag-strip";
import { cueFor, type FlagState } from "@/lib/live/flags";
import { utcToLocalHHMM } from "@/lib/engine/schedule";
import { copy } from "@/lib/ui-copy";

interface Cue {
  id: number;
  at: number;
  text: string;
}

/** The text cue for each change of the flags, newest first ("Yellow — one minute to the start of Heat 5"). Nothing after a reload (there is no change to announce). */
export function useFlagCues(model: FlagStripModel | null, nowMs: number): Cue[] {
  const [cues, setCues] = useState<Cue[]>([]);
  const prev = useRef<FlagState | null>(null);
  const n = useRef(0);
  const state = model?.state ?? null;
  const name = model?.heatShort ?? "";
  useEffect(() => {
    const text = cueFor(prev.current, state, name || copy.flags.cue.thisHeat);
    prev.current = state;
    if (text) setCues((l) => [{ id: ++n.current, at: nowMs, text }, ...l].slice(0, 12));
  }, [state?.kind, state?.why]); // eslint-disable-line react-hooks/exhaustive-deps
  return cues;
}

/** The announcer's flags: the strip and, under it, what to say for each change. */
export function AnnouncerFlags({ model, nowMs, timezone }: { model: FlagStripModel | null; nowMs: number; timezone: string }) {
  const cues = useFlagCues(model, nowMs);
  if (!model) return null;
  return (
    <section data-testid="announcer-flags" aria-label={copy.flags.announcerHeading} className="flex flex-col gap-1 px-3 pt-2">
      <div className="flex">
        <FlagStrip model={model} />
      </div>
      <ul data-testid="flag-cues" className="flex flex-col gap-0.5">
        {cues.map((c) => (
          <li key={c.id} data-testid="flag-cue" className="text-small font-semibold">
            <span className="tabular-nums text-beach-muted">{utcToLocalHHMM(new Date(c.at).toISOString(), timezone)}</span> {c.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
