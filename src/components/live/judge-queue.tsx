"use client";

import { useMemo, useState } from "react";
import { ChevronRight, EyeOff, Flag, Repeat } from "lucide-react";
import { Chip } from "./chip";
import { CriteriaRows, type CriterionRow } from "./criteria-rows";
import type { ConnectionStatus } from "./connection-badge";
import type { TimerState } from "./heat-timer";
import { Pill } from "./pill";
import { RiderDetail } from "./rider-detail";
import { RiderTile } from "./rider-tile";
import { ScorePad } from "./score-pad";
import { ScreenHeader } from "./screen-header";
import type { FlagStripModel } from "./flag-strip";
import { RiderLabel } from "@/components/rider-label";
import type { LabelModel } from "@/lib/identification/rider-label";
import { judgeQueue, KOTA } from "@/lib/live/design-fixtures";
import { formatCell } from "@/lib/live/matrix-model";
import { queueView, type QueueItem } from "@/lib/live/queue-model";
import { formatPadValue } from "@/lib/live/score-pad";
import type { LiveRider, RiderSheetModel } from "@/lib/live/view-types";
import type { Scale } from "@/lib/schemas/scoring-model";
import { copy } from "@/lib/ui-copy";

const T = copy.live;
const dirWord = (d: "left" | "right" | null) => (d === "left" ? T.summary.left : d === "right" ? T.summary.right : "");

export type FlagKind = "crash" | "landed" | "wrong_rider" | "duplicate" | "other";

/** One attempt in the judge's queue: the rider, the trick as the spotter logged it, and what this judge has given so far. */
export interface JudgeCard extends QueueItem {
  label: LabelModel;
  /** The rider's own attempt number. */
  seq: number;
  trick: string;
  direction: "left" | "right" | null;
  repeat?: { nth: string; previous: string | null };
  /** The criteria values already given (when an attempt is brought back to be corrected). */
  criteria?: Record<string, number> | null;
  /** Saved on this phone, not yet on the server. */
  pending?: boolean;
}

export interface JudgeQueueViewProps {
  heatName: string;
  seat: string;
  remainingMs: number;
  timerState?: TimerState;
  connection?: ConnectionStatus;
  pendingCount?: number;
  onRetry?: () => void;
  clock?: { timezone: string; nowMs: number };
  /** The flag strip (Flags), or none when the event has flags off. */
  flag?: FlagStripModel | null;
  /** The screen's own settings (theme, size, sound), shown at the top of the Details view. */
  settings?: React.ReactNode;
  items: JudgeCard[];
  scale: Scale;
  /** Scoring by criteria: one tab per criterion and one pad. */
  criteria?: CriterionRow[] | null;
  /** The trick score worked out from the criteria given so far, or null until every criterion is set. */
  computeCriteria?: (values: Record<string, number | undefined>) => number | null;
  onScore: (id: string | number, score: number | "missed", criteria?: Record<string, number>) => void;
  onFlag: (id: string | number, kind: FlagKind) => void;
  /** Attempts this judge has flagged, so the card says so. */
  flaggedIds?: ReadonlySet<string | number>;
  /** The persistent "Saved 7.5 — RED — attempt 6" line (it stays until the next action). */
  saved: string | null;
  riders: LiveRider[];
  sheets: Record<string, RiderSheetModel>;
  /** Why nothing can be changed (the sheet is locked), or null. */
  lockedMessage?: string | null;
  startDetails?: boolean;
  /** No header of its own: the parent draws one (the heat-end screen). A small Details toggle sits in the body instead. */
  bare?: boolean;
  /** Under the rider's sheet in the Details view (e.g. "Log an attempt" when judges may). */
  detailsExtra?: (riderId: string) => React.ReactNode;
}

/**
 * The judge's phone as a scoring queue (owner, round 3). Default view: a slim header, the attempt in front of the judge with its pad, and a thin history.
 * Everything else (rider cards, every attempt, the counters) is behind the Details toggle, where the judge picks a rider. The rider is never chosen to
 * score: each attempt the spotter logs comes in as the next card. A crashed attempt never enters the queue: its history row only offers "That was a landing".
 * Controlled by its parent: it draws what it is given and reports what the judge does.
 */
export function JudgeQueueView(p: JudgeQueueViewProps) {
  const [editing, setEditing] = useState<string | number | null>(null);
  const [details, setDetails] = useState(Boolean(p.startDetails));
  const [picked, setPicked] = useState(p.riders[0]?.id ?? "");
  const [flagFor, setFlagFor] = useState<{ id: string | number; status: "landed" | "crashed" } | null>(null);
  const [draft, setDraft] = useState<{ id: string | number; values: Record<string, number | undefined> } | null>(null);
  const view = queueView(p.items, editing);
  const cur = view.current;
  const locked = Boolean(p.lockedMessage);
  const criteria = p.criteria && p.criteria.length ? p.criteria : null;
  const values: Record<string, number | undefined> = cur ? (draft?.id === cur.id ? draft.values : (cur.criteria ?? {})) : {};
  const computed = criteria && p.computeCriteria ? p.computeCriteria(values) : null;

  const done = (id: string | number, score: number | "missed", crit?: Record<string, number>) => {
    setEditing(null);
    setFlagFor(null);
    setDraft(null);
    p.onScore(id, score, crit);
  };
  const flagKinds: FlagKind[] = flagFor?.status === "landed" ? ["crash", "wrong_rider", "duplicate", "other"] : ["landed", "wrong_rider", "duplicate", "other"];
  const flagCopy = copy.judge.flag;

  return (
    <>
      {p.bare ? null : (
      <ScreenHeader
        heatName={p.heatName}
        seat={p.seat}
        remainingMs={p.remainingMs}
        timerState={p.timerState}
        connection={p.connection}
        pending={p.pendingCount}
        onRetry={p.onRetry}
        clock={p.clock}
        flag={p.flag}
        details={details}
        onToggleDetails={() => {
          setDetails((d) => !d);
          setEditing(null);
        }}
      />
      )}
      <div data-testid="screen-body" className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2 py-1.5">
        {p.bare ? (
          <Chip data-testid="review-details-toggle" pressed={details} onClick={() => { setDetails((d) => !d); setEditing(null); }} className="self-start">
            {details ? T.header.detailsOn : T.header.details}
          </Chip>
        ) : null}
        {p.lockedMessage ? (
          <p role="status" data-testid="sheet-locked" className="rounded-card border border-beach-border bg-beach-surface px-2 py-1 text-body font-semibold">
            {p.lockedMessage}
          </p>
        ) : null}
        {flagFor && !details ? (
          <div role="dialog" aria-label={flagCopy.title} data-testid="flag-sheet" className="flex flex-col gap-1 rounded-lg border border-beach-border bg-beach-surface p-1.5">
            <p className="text-small font-semibold">{flagCopy.title}</p>
            <div className="flex flex-wrap gap-1">
              {flagKinds.map((k) => (
                <Chip
                  key={k}
                  data-flag={k}
                  onClick={() => {
                    p.onFlag(flagFor.id, k);
                    setFlagFor(null);
                  }}
                >
                  {flagCopy.kinds[k]}
                </Chip>
              ))}
              <Chip onClick={() => setFlagFor(null)}>{flagCopy.close}</Chip>
            </div>
          </div>
        ) : null}
        {details ? (
          <div data-testid="details-view" className="flex flex-col gap-1.5">
            {p.settings}
            <div role="group" aria-label={T.tile.strip} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, p.riders.length)}, minmax(0, 1fr))` }}>
              {p.riders.map((r) => (
                <RiderTile key={r.id} compact label={r.label} attempts={r.attempts} max={r.max} selected={picked === r.id} onSelect={() => setPicked(r.id)} />
              ))}
            </div>
            {p.sheets[picked] ? (
              <RiderDetail
                sheet={p.sheets[picked]}
                onEdit={locked ? undefined : (id) => {
                  setDetails(false);
                  setEditing(id);
                }}
              />
            ) : null}
            {p.detailsExtra?.(picked)}
          </div>
        ) : (
          <>
            {cur ? (
              <article key={String(cur.id)} data-testid="queue-card" data-attempt={String(cur.id)} className="flex animate-in fade-in flex-col gap-1.5 rounded-card border border-beach-line bg-beach-surface p-1.5 duration-150">
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
                        {cur.repeat.previous ? T.attempt.repeat(cur.repeat.nth, cur.repeat.previous) : T.attempt.repeatShort(cur.repeat.nth)}
                      </Pill>
                    </span>
                  ) : null}
                  {p.flaggedIds?.has(cur.id) ? <Pill tone="outlier">{copy.judge.flag.sent}</Pill> : null}
                </p>
                {view.correcting ? (
                  <p className="flex items-center justify-between gap-2">
                    <Pill tone="outlier">{T.queue.correct(cur.seq)}</Pill>
                    <Chip onClick={() => setEditing(null)}>{T.queue.cancelCorrect}</Chip>
                  </p>
                ) : null}
                {criteria ? (
                  <>
                    <CriteriaRows
                      key={String(cur.id)}
                      criteria={criteria}
                      values={values}
                      onChange={(k, v) => setDraft({ id: cur.id, values: { ...values, [k]: v } })}
                      computedLabel={computed === null ? null : formatPadValue(computed, p.scale)}
                      caption={<span data-testid="pad-caption" className="block font-semibold text-beach-ink">{p.saved ?? T.saved.waiting}</span>}
                    />
                    <Chip variant={computed !== null && !locked ? "accent" : "muted"} data-testid="criteria-save" disabled={computed === null || locked} onClick={() => computed !== null && done(cur.id, computed, values as Record<string, number>)} className="self-end">
                      {copy.common.save}
                    </Chip>
                  </>
                ) : (
                  <ScorePad
                    key={String(cur.id)}
                    scale={p.scale}
                    value={typeof cur.score === "number" ? cur.score : null}
                    label={T.criteria.trickScore}
                    disabled={locked}
                    caption={<span data-testid="pad-caption" className="block font-semibold text-beach-ink">{p.saved ?? T.saved.waiting}</span>}
                    onChange={(v) => done(cur.id, v)}
                  />
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip icon={EyeOff} data-testid="missed-button" disabled={locked} onClick={() => done(cur.id, "missed")}>
                    {T.attempt.missed}
                  </Chip>
                  <Chip icon={Flag} data-testid="flag-button" pressed={flagFor?.id === cur.id} disabled={locked} onClick={() => setFlagFor(flagFor?.id === cur.id ? null : { id: cur.id, status: "landed" })}>
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
                  <li key={String(h.id)}>
                    <button type="button" data-testid="history-row" data-status="crashed" data-attempt={String(h.id)} aria-label={`${copy.judge.flag.title}: ${h.label.primary.text} ${h.seq}`} disabled={locked} onClick={() => setFlagFor({ id: h.id, status: "crashed" })} className="flex min-h-row w-full items-center justify-between gap-2 px-2 text-left">
                      {left}
                      <span className="flex shrink-0 items-center gap-1">
                        <Pill tone="crash">{right}</Pill>
                        <Flag aria-hidden className="size-4 text-beach-muted" />
                      </span>
                    </button>
                  </li>
                ) : (
                  <li key={String(h.id)}>
                    <button type="button" data-testid="history-row" data-attempt={String(h.id)} aria-label={`${T.queue.tapToCorrect}: ${h.label.primary.text} ${h.seq}`} disabled={locked} onClick={() => setEditing(h.id)} className="flex min-h-row w-full items-center justify-between gap-2 px-2 text-left">
                      {left}
                      <span className="flex shrink-0 items-center gap-1 text-body font-semibold tabular-nums">
                        {(h as JudgeCard).pending ? <Pill tone="pending">{copy.judge.pendingTag}</Pill> : null}
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

/** The /design page's version: the same view, filled from fixtures, with local state (nothing is saved anywhere). */
export function JudgeQueue({ startDetails = false }: { startDetails?: boolean }) {
  const q = useMemo(() => judgeQueue(), []);
  const [items, setItems] = useState(q.items as JudgeCard[]);
  const [saved, setSaved] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<Set<string | number>>(new Set());
  const scale = KOTA.trick.scale;
  return (
    <JudgeQueueView
      heatName={q.heatName}
      seat={q.seat}
      remainingMs={q.remainingMs}
      items={items}
      scale={scale}
      saved={saved}
      riders={q.riders}
      sheets={q.sheets}
      startDetails={startDetails}
      flaggedIds={flagged}
      onScore={(id, score) => {
        const card = items.find((i) => i.id === id)!;
        setSaved(score === "missed" ? T.saved.missed(card.label.primary.text, card.seq) : T.saved.line(formatPadValue(score, scale), card.label.primary.text, card.seq));
        setItems((all) => all.map((i) => (i.id === id ? { ...i, score } : i)));
      }}
      onFlag={(id) => setFlagged((f) => new Set(f).add(id))}
    />
  );
}
