"use client";

import { useMemo, useState } from "react";
import { ChevronRight, EyeOff, Flag, Repeat } from "lucide-react";
import { Chip } from "./chip";
import { Pill } from "./pill";
import { RiderDetail } from "./rider-detail";
import { RiderTile } from "./rider-tile";
import { ScorePad } from "./score-pad";
import { ScreenHeader } from "./screen-header";
import { RiderLabel } from "@/components/rider-label";
import { judgeQueue, KOTA, type QueueAttempt } from "@/lib/live/design-fixtures";
import { formatCell } from "@/lib/live/matrix-model";
import { queueView } from "@/lib/live/queue-model";
import { formatPadValue } from "@/lib/live/score-pad";
import { copy } from "@/lib/ui-copy";

const T = copy.live;
const dirWord = (d: QueueAttempt["direction"]) => (d === "left" ? T.summary.left : d === "right" ? T.summary.right : "");

/**
 * The judge's phone as a scoring queue (owner, round 3). Default view: a slim header, the attempt in front of the judge with its pad, and a thin history.
 * Everything else (rider cards, every attempt, the counters) is behind the Details toggle, where the judge picks a rider.
 * The rider is never chosen to score: each attempt the spotter logs comes in as the next card.
 */
export function JudgeQueue({ startDetails = false }: { startDetails?: boolean }) {
  const q = useMemo(() => judgeQueue(), []);
  const [items, setItems] = useState<QueueAttempt[]>(q.items);
  const [editing, setEditing] = useState<number | null>(null);
  const [details, setDetails] = useState(startDetails);
  const [picked, setPicked] = useState("red");
  const [saved, setSaved] = useState<string | null>(null);
  const [flagged, setFlagged] = useState(false);
  const scale = KOTA.trick.scale;
  const view = queueView(items, editing);
  const cur = view.current;

  const setScore = (id: number, score: number | "missed") => {
    setItems((all) => all.map((i) => (i.id === id ? { ...i, score } : i)));
    setEditing(null);
    setFlagged(false);
  };

  return (
    <>
      <ScreenHeader
        heatName={q.heatName}
        seat={q.seat}
        remainingMs={q.remainingMs}
        details={details}
        onToggleDetails={() => {
          setDetails((d) => !d);
          setEditing(null);
        }}
      />
      <div data-testid="screen-body" className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2 py-1.5">
        {details ? (
          <div data-testid="details-view" className="flex flex-col gap-1.5">
            <div role="group" aria-label={T.tile.strip} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${q.riders.length}, minmax(0, 1fr))` }}>
              {q.riders.map((r) => (
                <RiderTile key={r.id} compact label={r.label} attempts={r.attempts} max={r.max} selected={picked === r.id} onSelect={() => setPicked(r.id)} />
              ))}
            </div>
            <RiderDetail sheet={q.sheets[picked]} />
          </div>
        ) : (
          <>
            {cur ? (
              <article key={cur.id} data-testid="queue-card" data-attempt={cur.id} className="flex animate-in fade-in flex-col gap-1.5 rounded-card border border-beach-line bg-beach-surface p-1.5 duration-150">
                <div className="flex items-center justify-between gap-2">
                  <RiderLabel model={cur.label} variant="live" bare />
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="text-small font-semibold text-beach-muted">{T.attempt.number(cur.seq)}</span>
                    {view.waiting > 0 ? (
                      <span data-testid="waiting-pill">
                        <Pill tone="pending">{T.queue.waiting(view.waiting)}</Pill>
                      </span>
                    ) : null}
                  </span>
                </div>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-name font-semibold">
                  <span data-testid="queue-trick">{cur.trick}</span>
                  {cur.direction ? <span className="text-body font-medium text-beach-muted">{dirWord(cur.direction)}</span> : null}
                  {cur.repeat ? (
                    <span data-testid="repeat-badge">
                      <Pill icon={Repeat} tone="pending">
                        {T.attempt.repeat(cur.repeat.nth, cur.repeat.previous)}
                      </Pill>
                    </span>
                  ) : null}
                </p>
                {view.correcting ? (
                  <p className="flex items-center justify-between gap-2">
                    <Pill tone="outlier">{T.queue.correct(cur.seq)}</Pill>
                    <Chip onClick={() => setEditing(null)}>{T.queue.cancelCorrect}</Chip>
                  </p>
                ) : null}
                <ScorePad
                  key={cur.id}
                  scale={scale}
                  value={typeof cur.score === "number" ? cur.score : null}
                  label={T.criteria.trickScore}
                  caption={<span data-testid="pad-caption" className="block font-semibold text-beach-ink">{saved ?? T.saved.waiting}</span>}
                  onChange={(v) => {
                    setSaved(T.saved.line(formatPadValue(v, scale), cur.label.primary.text, cur.seq));
                    setScore(cur.id, v);
                  }}
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip
                    icon={EyeOff}
                    data-testid="missed-button"
                    onClick={() => {
                      setSaved(T.saved.missed(cur.label.primary.text, cur.seq));
                      setScore(cur.id, "missed");
                    }}
                  >
                    {T.attempt.missed}
                  </Chip>
                  <Chip icon={Flag} data-testid="flag-button" pressed={flagged} onClick={() => setFlagged((f) => !f)}>
                    {T.attempt.flag}
                  </Chip>
                </div>
                <p data-testid="queue-help" className="text-small font-medium leading-snug text-beach-muted">
                  <span className="font-semibold text-beach-ink">{T.attempt.missed}</span>: {T.attempt.missedHelp} · <span className="font-semibold text-beach-ink">{T.attempt.flag}</span>: {T.attempt.flagHelp}
                </p>
              </article>
            ) : (
              <p data-testid="all-scored" className="rounded-card border border-dashed border-beach-line p-3 text-body font-medium text-beach-muted">
                {T.queue.allCaughtUp}
              </p>
            )}
            <ol data-testid="history" aria-label={T.queue.history} className="flex flex-col divide-y divide-beach-line rounded-xl border border-beach-line bg-beach-bg">
              {view.history.slice(0, 3).map((h) => {
                const crashed = h.status === "crashed";
                const right = crashed ? T.queue.crashedRow : h.score === "missed" ? T.queue.missedRow : formatCell(h.score as number);
                const left = (
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span className="shrink-0 text-small font-semibold text-beach-muted">
                      {h.label.primary.text} {h.seq}
                    </span>
                    <span className="truncate text-body font-medium">{h.trick}</span>
                  </span>
                );
                return crashed ? (
                  <li key={h.id} data-testid="history-row" data-status="crashed" className="flex min-h-row items-center justify-between gap-2 px-2">
                    {left}
                    <Pill tone="crash">{right}</Pill>
                  </li>
                ) : (
                  <li key={h.id}>
                    <button type="button" data-testid="history-row" data-attempt={h.id} aria-label={`${T.queue.tapToCorrect}: ${h.label.primary.text} ${h.seq}`} onClick={() => setEditing(h.id)} className="flex min-h-row w-full items-center justify-between gap-2 px-2 text-left">
                      {left}
                      <span className="flex shrink-0 items-center gap-1 text-body font-semibold tabular-nums">
                        {right}
                        <ChevronRight aria-hidden className="size-4 text-beach-muted" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </>
  );
}
