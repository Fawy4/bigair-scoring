"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { enabledIdsOf } from "./attempt-logger";
import { Chip } from "./chip";
import { practiceAdd } from "@/lib/live/head-actions";
import { practiceAttempt } from "@/lib/live/practice";
import { trickKit } from "@/lib/live/screen-model";
import type { AttemptRow, HeatRow, LiveContext, LiveDivisionContext } from "@/lib/live/types";
import type { Json } from "@/lib/supabase/database.types";
import { copy } from "@/lib/ui-copy";

const H = copy.headLive;

/**
 * The Practice heat (docs/PLAN-phase-5, owner decision 11): on a simulation event the organiser plays a made-up spotter feed into the running heat so one person can
 * score a whole heat alone on a judge phone. It runs in this browser tab only and stops when the heat ends or the tab closes; the database checks that the event is a
 * simulation and that the person is an organiser, and the attempt cap still applies.
 */
export function PracticePanel({ ctx, heat, division, attempts, riderIds }: { ctx: LiveContext; heat: HeatRow | null; division: LiveDivisionContext | undefined; attempts: AttemptRow[]; riderIds: string[] }) {
  const [every, setEvery] = useState(20);
  const [running, setRunning] = useState(false);
  const [played, setPlayed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const kit = useMemo(() => trickKit(ctx), [ctx]);
  const latest = useRef({ attempts, riderIds, heat, division, kit });
  latest.current = { attempts, riderIds, heat, division, kit };
  const live = heat?.status === "running";

  useEffect(() => {
    if (!running) return;
    if (!live) {
      setRunning(false);
      return;
    }
    let busy = false;
    const tick = async () => {
      const { attempts: att, riderIds: ids, heat: h, division: d, kit: k } = latest.current;
      if (busy || !h || !d || !k) return;
      busy = true;
      try {
        const used = ids.map((entryId) => ({ entryId, used: att.filter((a) => a.entry_id === entryId && !a.deleted_at).length }));
        const next = practiceAttempt(Math.floor(Math.random() * 1_000_000_000), k.vocab, [...enabledIdsOf(k.viewFor(d))], used, d.model.heat.maxAttemptsPerRider);
        if (!next) {
          setRunning(false);
          return;
        }
        const r = await practiceAdd({ heatId: h.id, entryId: next.entryId, trickName: next.trickName, direction: next.direction, category: next.categoryKey, parts: next.parts as unknown as Json, status: next.status });
        if (r.ok) {
          setPlayed((n) => n + 1);
          setError(null);
        } else setError(r.message);
      } finally {
        busy = false;
      }
    };
    void tick();
    const t = setInterval(() => void tick(), Math.max(3, every) * 1000);
    return () => clearInterval(t);
  }, [running, live, every]);

  if (!ctx.event.isSimulation) return null;
  return (
    <section data-testid="practice" aria-label={H.practiceHeading} className="flex flex-col gap-1.5 rounded-card border border-beach-line bg-beach-surface p-2">
      <h2 className="text-heading font-semibold text-beach-muted">{H.practiceHeading}</h2>
      <p className="text-small font-medium">{H.practiceNote}</p>
      <label className="flex items-center justify-between gap-2 text-body font-medium">
        {H.practiceEvery}
        <input data-testid="practice-seconds" type="number" min={3} max={120} value={every} disabled={running} onChange={(e) => setEvery(Number(e.target.value) || 20)} className="min-h-tap w-20 rounded-xl border border-beach-border bg-beach-bg px-2 text-body text-beach-ink" />
      </label>
      <div className="flex items-center gap-2">
        {running ? (
          <Chip data-testid="practice-stop" onClick={() => setRunning(false)}>
            {H.practiceStop}
          </Chip>
        ) : (
          <Chip data-testid="practice-start" variant={live ? "accent" : "muted"} disabled={!live} onClick={() => { setPlayed(0); setError(null); setRunning(true); }}>
            {H.practiceStart}
          </Chip>
        )}
        <span data-testid="practice-status" className="text-small font-medium">
          {running ? H.practiceRunning(played) : live ? H.practiceStopped : H.practiceNoHeat}
        </span>
      </div>
      {error ? (
        <p role="alert" className="text-small font-semibold">
          {error}
        </p>
      ) : null}
    </section>
  );
}
