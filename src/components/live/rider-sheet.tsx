"use client";

import { useEffect, useState } from "react";
import { Check, Flag, Flame } from "lucide-react";
import { Chip } from "./chip";
import type { ConnectionStatus } from "./connection-badge";
import type { FlagStripModel } from "./flag-strip";
import type { TimerState } from "./heat-timer";
import { Pill } from "./pill";
import { RiderTile } from "./rider-tile";
import { ScreenHeader } from "./screen-header";
import { LearnMore } from "@/components/manual/learn-more";
import { errorSentence } from "@/lib/live/errors";
import { activeLine, lineTypable, missedSwitch, needsScore, pulseLine, rangesOf, skipLines, type SheetLine } from "@/lib/live/rider-sheet";
import { formatPadValue, padRefusal, parsePadInput } from "@/lib/live/score-pad";
import type { LiveRider } from "@/lib/live/view-types";
import type { Scale } from "@/lib/schemas/scoring-model";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const T = copy.riderSheet;
const dirWord = (d: "left" | "right" | null) => (d === "left" ? copy.live.summary.left : d === "right" ? copy.live.summary.right : "");

/** The switch "Queue / Rider sheet". Remembered per device by the parent. */
export function ViewSwitch({ view, onChange }: { view: "queue" | "sheet"; onChange: (v: "queue" | "sheet") => void }) {
  return (
    <div role="group" aria-label={T.switchLabel} data-testid="view-switch" className="flex items-center gap-1.5">
      <Chip data-testid="view-queue" pressed={view === "queue"} onClick={() => onChange("queue")}>
        {T.queue}
      </Chip>
      <Chip data-testid="view-sheet" pressed={view === "sheet"} onClick={() => onChange("sheet")}>
        {T.sheet}
      </Chip>
    </div>
  );
}

/** The flag kinds offered for a line: what the judge saw differently from what the spotter logged (the same as the Queue's Flag). */
const flagKindsFor = (line: SheetLine): Array<"crash" | "landed" | "wrong_rider" | "duplicate" | "other"> =>
  line.kind === "crash" ? ["landed", "wrong_rider", "duplicate", "other"] : ["crash", "wrong_rider", "duplicate", "other"];

/**
 * One numbered line of a rider's sheet: the attempt number, the trick (empty until the spotter logs it), a crash word when it was a crash, a Missed switch with a
 * Flag under it, and a typed score box. A valid score is saved the moment it is typed (nothing to press); a score the scale does not allow is refused with the
 * pad's own sentence and is not saved. On an empty line the score is the judge's private note ("pending"); a crash line is greyed and takes none. The box stays
 * empty until there is a score: Missed is shown by its own switch, never by text in the box.
 *
 * A line that needs this judge's score (a logged attempt with none from him) has a slim teal bar and a "Needs your score" tag; only the line he types on next
 * (`pulse`) also has the pulsing dot and the glow on its score box.
 */
function LineRow({
  line,
  scale,
  locked,
  ended,
  typable,
  askable,
  pulse,
  flagged,
  note,
  ask,
  flagSheet,
  onAsk,
  onClosed,
  onFlagOpen,
  onScore,
  onMissed,
  onClear,
}: {
  line: SheetLine;
  scale: Scale;
  locked: boolean;
  ended: boolean;
  /** Line by line: only the first line with no score yet (and the ones above it) take typing. */
  typable: boolean;
  /** A line below the first one with no score: tapping it asks once whether to set the lines above to Missed. */
  askable: boolean;
  /** The line he types on next, and it needs his score: the dot pulses and the score box glows. */
  pulse: boolean;
  /** This judge has flagged the attempt. */
  flagged: boolean;
  /** A one-line message under the line (a closed line was tapped). */
  note: string | null;
  /** The question, when it is open on this line. */
  ask: { text: string; onConfirm: () => void; onCancel: () => void } | null;
  /** The Flag choices, when they are open on this line. */
  flagSheet: { onPick: (kind: string) => void; onClose: () => void } | null;
  onAsk: (line: SheetLine) => void;
  onClosed: (line: SheetLine) => void;
  onFlagOpen: (line: SheetLine) => void;
  onScore: (line: SheetLine, value: number) => void;
  onMissed: (line: SheetLine) => void;
  onClear: (line: SheetLine) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const stored = line.kind === "attempt" ? line.mine : line.kind === "empty" ? line.pending : null;
  const isMissed = stored === "missed";
  const closed = !line.open && line.kind === "empty";
  const waits = !typable && line.kind !== "crash";
  const tappable = waits && (askable || closed);
  const needs = needsScore(line);
  const storedText = typeof stored === "number" ? formatPadValue(stored, scale) : "";
  const text = draft ?? storedText;
  const refusal = draft !== null ? padRefusal(draft, scale) : null;
  const crash = line.kind === "crash";
  const orphan = ended && line.kind === "empty" && line.pending !== null;
  const change = (value: string) => {
    setDraft(value);
    const parsed = parsePadInput(value, scale);
    if (parsed.ok) onScore(line, parsed.value); // a score typed on a Missed line turns Missed off by itself
    else if (parsed.reason === "empty" && line.kind === "empty" && line.pending !== null && !isMissed) onClear(line);
  };
  const tap = () => (closed ? onClosed(line) : onAsk(line));
  return (
    <li
      data-testid="sheet-line"
      data-line={line.n}
      data-kind={line.kind}
      data-waits={waits ? "true" : undefined}
      data-needs-score={needs ? "true" : undefined}
      data-pulse={pulse ? "true" : undefined}
      className={cn("relative flex scroll-mt-20 flex-col gap-0.5 px-2 py-1.5", crash && "bg-beach-surface text-beach-muted", line.kind === "empty" && "bg-beach-bg")}
    >
      {needs ? <span aria-hidden data-testid="line-needs-bar" className="absolute bottom-1.5 left-0 top-1.5 w-1.5 rounded-r-full bg-beach-accent" /> : null}
      <div className="flex items-center gap-1.5">
        <span data-testid="line-number" className="w-5 shrink-0 text-center text-name font-bold tabular-nums">
          {line.n}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          {line.kind === "empty" ? (
            <span data-testid="line-trick" className="text-body font-medium leading-tight text-beach-muted">
              {orphan ? T.noAttempt : T.waitingTrick}
            </span>
          ) : (
            <span data-testid="line-trick" className={cn("flex flex-wrap items-baseline gap-x-1.5 text-body font-bold", crash && "line-through")}>
              <span>{line.trickName || "—"}</span>
              {line.direction ? <span className="text-small font-medium text-beach-muted">{dirWord(line.direction)}</span> : null}
            </span>
          )}
          {needs ? (
            <span
              data-testid="line-needs-score"
              className="mt-0.5 inline-flex w-fit items-center gap-1.5 rounded-full border border-beach-accent bg-[color-mix(in_srgb,var(--beach-accent)_9%,transparent)] px-2 py-0.5 text-small font-bold text-beach-ink"
            >
              <span aria-hidden data-testid="line-needs-dot" className={cn("size-2 rounded-full bg-beach-accent", pulse && "motion-safe:animate-pulse")} />
              {T.needsScore}
            </span>
          ) : null}
          {line.kind === "empty" && line.pending !== null && !orphan && !isMissed ? (
            <span data-testid="line-pending" className="text-small font-medium text-beach-muted">
              {T.pendingNote}
            </span>
          ) : null}
        </span>
        {crash ? (
          <span data-testid="line-crash" className="flex shrink-0 items-center gap-1.5">
            <Pill icon={Flame} tone="crash">
              {T.crash}
            </Pill>
            <Chip data-testid="line-flag" aria-label={T.flagAria(line.n)} title={T.flag} icon={Flag} pressed={flagged} disabled={locked} onClick={() => onFlagOpen(line)} className="size-11 px-0" />
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1.5">
            {line.kind === "empty" && line.pending !== null && !isMissed ? <Pill tone="pending">{T.pendingTag}</Pill> : null}
            <Chip data-testid="line-missed" aria-label={T.missedAria(line.n)} aria-pressed={isMissed} pressed={isMissed} disabled={locked || (waits && !tappable)} onClick={() => (waits ? tap() : onMissed(line))} className="h-11 px-2.5">
              {isMissed ? <Check aria-hidden className="size-4 shrink-0" strokeWidth={3} /> : null}
              {T.missed}
            </Chip>
            <Chip data-testid="line-flag" aria-label={T.flagAria(line.n)} title={T.flag} icon={Flag} pressed={flagged} disabled={locked || line.kind === "empty"} onClick={() => onFlagOpen(line)} className="size-11 px-0" />
            <input
              data-testid="line-score"
              inputMode="decimal"
              enterKeyHint="done"
              autoComplete="off"
              aria-label={waits ? T.waitsAria(line.n) : T.scoreBox(line.n)}
              placeholder={T.placeholder}
              value={text}
              disabled={locked || (waits && !tappable)}
              readOnly={waits}
              onPointerDown={tappable ? (e) => { e.preventDefault(); tap(); } : undefined}
              onChange={(e) => change(e.target.value)}
              onFocus={tappable ? tap : undefined}
              onBlur={() => setDraft(null)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className={cn(
                "h-11 w-14 shrink-0 rounded-full border bg-beach-bg px-1 py-0 text-center text-digit font-bold leading-none text-beach-ink",
                refusal ? "border-beach-failed" : "border-beach-border",
                line.kind === "empty" && line.pending !== null && !isMissed && "border-dashed",
                pulse && !refusal && "border-2 border-beach-accent shadow-[0_0_0_3px_color-mix(in_srgb,var(--beach-accent)_35%,transparent)]",
              )}
            />
          </span>
        )}
      </div>
      {line.kind === "empty" && line.pending !== null && !isMissed ? (
        <div className="flex justify-end">
          <Chip data-testid="line-clear" aria-label={T.clearAria(line.n)} onClick={() => onClear(line)}>
            {T.clear}
          </Chip>
        </div>
      ) : null}
      {note ? (
        <p role="status" data-testid="line-closed-note" className="rounded-2xl bg-beach-surface px-3 py-1.5 text-body font-bold">
          {note}
        </p>
      ) : null}
      {ask ? (
        <div role="alert" data-testid="skip-ask" className="flex scroll-mb-3 scroll-mt-20 flex-col gap-1 rounded-lg border border-beach-border bg-beach-surface px-2 py-1">
          <p className="text-body font-semibold">{ask.text}</p>
          <div className="flex gap-1.5">
            <Chip variant="accent" data-testid="skip-confirm" onClick={ask.onConfirm}>
              {T.skipConfirm}
            </Chip>
            <Chip data-testid="skip-cancel" onClick={ask.onCancel}>
              {T.skipCancel}
            </Chip>
          </div>
        </div>
      ) : null}
      {flagSheet ? (
        <div role="dialog" aria-label={copy.judge.flag.title} data-testid="line-flag-sheet" className="flex scroll-mb-3 scroll-mt-20 flex-col gap-1 rounded-lg border border-beach-border bg-beach-surface p-1.5">
          <p className="text-small font-semibold">{copy.judge.flag.title}</p>
          <div className="flex flex-wrap gap-1">
            {flagKindsFor(line).map((k) => (
              <Chip key={k} data-flag={k} onClick={() => flagSheet.onPick(k)}>
                {copy.judge.flag.kinds[k]}
              </Chip>
            ))}
            <Chip onClick={flagSheet.onClose}>{copy.judge.flag.close}</Chip>
          </div>
        </div>
      ) : null}
      {crash ? (
        <p data-testid="line-crash-note" className="text-small font-medium">
          {T.crashNote}
        </p>
      ) : null}
      {refusal ? (
        <p role="alert" data-testid="line-refusal" data-no-learn-more className="text-small font-semibold text-beach-ink">
          {errorSentence(refusal.detail ? `${refusal.code}: ${refusal.detail}` : refusal.code)}
          <LearnMore href={copy.manual.href("ju-pad-step")} />
        </p>
      ) : null}
    </li>
  );
}

export interface RiderSheetViewProps {
  heatName: string;
  seat: string;
  remainingMs: number;
  timerState?: TimerState;
  connection?: ConnectionStatus;
  pendingCount?: number;
  onRetry?: () => void;
  clock?: { timezone: string; nowMs: number };
  flag?: FlagStripModel | null;
  /** The switch, drawn at the top of the body. */
  switcher: React.ReactNode;
  riders: LiveRider[];
  /** Each rider's lines for this judge (by rider id). */
  lines: Record<string, SheetLine[]>;
  scale: Scale;
  /** Why nothing can be typed (the sheet is locked), or null. Clear still works: a note must never trap a judge. */
  lockedMessage?: string | null;
  /** The heat has ended: only the lines that matter are listed, and a leftover note says so. */
  ended?: boolean;
  /** The screen's own settings (theme, size, sound). */
  settings?: React.ReactNode;
  /** No header of its own: the parent draws one (the heat-end screen). */
  bare?: boolean;
  /** Something the parent wants above the lines (a notice). */
  notice?: React.ReactNode;
  /** Attempts this judge has flagged (the Flag button on their lines reads as pressed). */
  flaggedIds?: ReadonlySet<string | number>;
  onScore: (riderId: string, line: SheetLine, value: number) => void;
  /** A tap on a line's Missed: the parent turns it on, or off when the line is already Missed (`missedSwitch`). */
  onMissed: (riderId: string, line: SheetLine) => void;
  onClear: (riderId: string, line: SheetLine) => void;
  /** Flag the attempt on a line for the head judge: the same as the Queue's Flag. */
  onFlag: (attemptId: string, kind: string) => void;
}

/**
 * The judge's Rider sheet: the heat's rider cards across the top (they stay in view when the sheet is scrolled) and, below, the sheet of the rider who was tapped: every
 * numbered line from the start (the division's attempt limit; with no limit 10, and a new line each time the last one is filled). Line by line: a judge types on the
 * first line with no score from him yet, whether or not the spotter has logged it (a crash line and a Missed line count as done); tapping a lower line asks once and one
 * tap sets the lines above to Missed. A line that has a score can be changed until Submit.
 */
export function RiderSheetView(p: RiderSheetViewProps) {
  const [picked, setPicked] = useState(p.riders[0]?.id ?? "");
  const rider = p.riders.find((r) => r.id === picked) ?? p.riders[0];
  const all = rider ? (p.lines[rider.id] ?? []) : [];
  const shown = p.ended ? all.filter((l) => l.kind !== "empty" || l.pending !== null) : all;
  const locked = Boolean(p.lockedMessage);
  const active = activeLine(all);
  const pulse = pulseLine(all);
  // the question "Lines 1–2 have no score from you. Set them to Missed and score line 3?", the note on a closed line and the Flag choices: open on one line at a time
  const [asking, setAsking] = useState<{ riderId: string; n: number } | null>(null);
  const [closedAt, setClosedAt] = useState<{ riderId: string; n: number } | null>(null);
  const [flagAt, setFlagAt] = useState<{ riderId: string; n: number } | null>(null);
  const [focusN, setFocusN] = useState<number | null>(null);
  const skip = asking && rider && asking.riderId === rider.id ? skipLines(all, asking.n) : [];
  const here = <T extends { riderId: string; n: number } | null>(x: T) => (x && rider && x.riderId === rider.id ? x : null);
  useEffect(() => {
    if (focusN === null) return;
    const el = document.querySelector<HTMLInputElement>(`[data-testid="sheet-line"][data-line="${focusN}"] [data-testid="line-score"]`);
    if (el && !el.disabled && !el.readOnly) {
      el.focus();
      setFocusN(null);
    }
  });
  useEffect(() => {
    if (focusN === null) return;
    const t = setTimeout(() => setFocusN(null), 4000);
    return () => clearTimeout(t);
  }, [focusN]);
  // whatever opens under a line (the question, the closed-line note, the Flag choices) is brought fully into view, below the rider cards
  const openKey = `${asking?.n ?? ""}|${closedAt?.n ?? ""}|${flagAt?.n ?? ""}`;
  useEffect(() => {
    if (openKey === "||") return;
    const el = document.querySelector<HTMLElement>('[data-testid="skip-ask"], [data-testid="line-closed-note"], [data-testid="line-flag-sheet"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [openKey]);
  useEffect(() => {
    if (!closedAt) return;
    const t = setTimeout(() => setClosedAt(null), 5000);
    return () => clearTimeout(t);
  }, [closedAt]);
  const closeAll = () => {
    setAsking(null);
    setClosedAt(null);
    setFlagAt(null);
  };
  return (
    <>
      {p.bare ? null : <ScreenHeader heatName={p.heatName} seat={p.seat} remainingMs={p.remainingMs} timerState={p.timerState} connection={p.connection} pending={p.pendingCount} onRetry={p.onRetry} clock={p.clock} flag={p.flag} />}
      <div data-testid="screen-body" className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-1.5">
        <div className="flex flex-col gap-1.5 pt-1.5">
          {p.switcher}
          {p.notice}
          {p.lockedMessage ? (
            <p role="status" data-testid="sheet-locked" className="rounded-card border border-beach-border bg-beach-surface px-2 py-1 text-body font-semibold">
              {p.lockedMessage}
            </p>
          ) : null}
        </div>
        <div data-testid="rider-sheet" className="flex flex-col gap-1.5">
          <div role="group" aria-label={T.strip} data-testid="rider-strip" className="sticky top-0 z-10 -mx-2 grid gap-1 bg-beach-bg px-2 pb-1 pt-0.5" style={{ gridTemplateColumns: `repeat(${Math.max(1, p.riders.length)}, minmax(0, 1fr))` }}>
            {p.riders.map((r) => (
              <RiderTile key={r.id} compact label={r.label} attempts={r.attempts} max={r.max} selected={rider?.id === r.id} onSelect={() => { closeAll(); setPicked(r.id); }} />
            ))}
          </div>
          {rider ? (
            <>
              <h2 data-testid="sheet-heading" className="text-heading font-bold uppercase tracking-wide text-beach-muted">
                {T.sheetFor(rider.label.primary.text)}
              </h2>
              <ol data-testid="sheet-lines" data-active-line={active ?? undefined} aria-label={T.sheetFor(rider.label.primary.text)} className="flex flex-col divide-y divide-beach-line border-y border-beach-line">
                {shown.map((line) => {
                  const asked = here(asking);
                  const mine = (x: { riderId: string; n: number } | null) => x !== null && x.n === line.n;
                  return (
                    <LineRow
                      key={line.n}
                      line={line}
                      scale={p.scale}
                      locked={locked}
                      ended={Boolean(p.ended)}
                      typable={lineTypable(all, line.n)}
                      askable={skipLines(all, line.n).length > 0}
                      pulse={pulse === line.n}
                      flagged={Boolean(line.attemptId && p.flaggedIds?.has(line.attemptId))}
                      note={mine(here(closedAt)) ? T.closedLine(line.n) : null}
                      ask={mine(asked) && skip.length > 0 ? { text: T.skipAsk(rangesOf(skip), skip.length, line.n), onConfirm: () => { for (const n of skip) { const l = all.find((x) => x.n === n); if (l) p.onMissed(rider.id, l); } closeAll(); setFocusN(line.n); }, onCancel: closeAll } : null}
                      flagSheet={mine(here(flagAt)) && line.attemptId ? { onPick: (kind) => { p.onFlag(line.attemptId as string, kind); closeAll(); }, onClose: closeAll } : null}
                      onAsk={(l) => { closeAll(); setAsking({ riderId: rider.id, n: l.n }); }}
                      onClosed={(l) => { closeAll(); setClosedAt({ riderId: rider.id, n: l.n }); }}
                      onFlagOpen={(l) => { const open = mine(here(flagAt)); closeAll(); if (!open) setFlagAt({ riderId: rider.id, n: l.n }); }}
                      onScore={(l, v) => p.onScore(rider.id, l, v)}
                      onMissed={(l) => p.onMissed(rider.id, l)}
                      onClear={(l) => p.onClear(rider.id, l)}
                    />
                  );
                })}
              </ol>
            </>
          ) : (
            <p className="text-body font-medium text-beach-muted">{T.noRider}</p>
          )}
        </div>
        {p.settings}
      </div>
    </>
  );
}
