"use client";

import { useState } from "react";
import { Flame } from "lucide-react";
import { Chip } from "./chip";
import type { ConnectionStatus } from "./connection-badge";
import type { FlagStripModel } from "./flag-strip";
import type { TimerState } from "./heat-timer";
import { Pill } from "./pill";
import { RiderTile } from "./rider-tile";
import { ScreenHeader } from "./screen-header";
import { LearnMore } from "@/components/manual/learn-more";
import { errorSentence } from "@/lib/live/errors";
import type { SheetLine } from "@/lib/live/rider-sheet";
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

/**
 * One numbered line of a rider's sheet: the attempt number, the trick (empty until the spotter logs it), a crash word when it was a crash, and a typed score
 * box. A valid score is saved the moment it is typed (nothing to press); a score the scale does not allow is refused with the pad's own sentence and is not
 * saved. On an empty line the score is the judge's private note ("pending"); a crash line is greyed and takes none.
 */
function LineRow({ line, scale, locked, ended, onScore, onClear }: { line: SheetLine; scale: Scale; locked: boolean; ended: boolean; onScore: (line: SheetLine, value: number) => void; onClear: (line: SheetLine) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const stored = line.kind === "attempt" ? line.mine : line.kind === "empty" ? line.pending : null;
  const storedText = typeof stored === "number" ? formatPadValue(stored, scale) : stored === "missed" ? copy.live.queue.missedRow : "";
  const text = draft ?? storedText;
  const refusal = draft !== null ? padRefusal(draft, scale) : null;
  const crash = line.kind === "crash";
  const orphan = ended && line.kind === "empty" && line.pending !== null;
  const change = (value: string) => {
    setDraft(value);
    const parsed = parsePadInput(value, scale);
    if (parsed.ok) onScore(line, parsed.value);
    else if (parsed.reason === "empty" && line.kind === "empty" && line.pending !== null) onClear(line);
  };
  return (
    <li
      data-testid="sheet-line"
      data-line={line.n}
      data-kind={line.kind}
      className={cn("flex flex-col gap-0.5 px-2 py-1", crash && "bg-beach-surface text-beach-muted", line.kind === "empty" && "bg-beach-bg")}
    >
      <div className="flex min-h-row items-center gap-2">
        <span data-testid="line-number" className="w-6 shrink-0 text-center text-name font-semibold tabular-nums">
          {line.n}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          {line.kind === "empty" ? (
            <span data-testid="line-trick" className="truncate text-body font-medium text-beach-muted">
              {orphan ? T.noAttempt : T.waitingTrick}
            </span>
          ) : (
            <span data-testid="line-trick" className={cn("flex flex-wrap items-baseline gap-x-1.5 text-body font-semibold", crash && "line-through")}>
              <span>{line.trickName || "—"}</span>
              {line.direction ? <span className="text-small font-medium text-beach-muted">{dirWord(line.direction)}</span> : null}
            </span>
          )}
          {line.kind === "empty" && line.pending !== null && !orphan ? (
            <span data-testid="line-pending" className="text-small font-medium text-beach-muted">
              {T.pendingNote}
            </span>
          ) : null}
        </span>
        {crash ? (
          <span data-testid="line-crash" className="flex shrink-0 items-center gap-1">
            <Pill icon={Flame} tone="crash">
              {T.crash}
            </Pill>
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1">
            {line.kind === "empty" && line.pending !== null ? <Pill tone="pending">{T.pendingTag}</Pill> : null}
            <input
              data-testid="line-score"
              inputMode="decimal"
              enterKeyHint="done"
              autoComplete="off"
              aria-label={T.scoreBox(line.n)}
              placeholder={T.placeholder}
              value={text}
              disabled={locked}
              onChange={(e) => change(e.target.value)}
              onBlur={() => setDraft(null)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className={cn("h-12 w-[4.5rem] rounded-lg border bg-beach-bg px-1.5 text-center text-digit font-semibold text-beach-ink placeholder:text-beach-muted", refusal ? "border-beach-failed" : "border-beach-border", line.kind === "empty" && line.pending !== null && "border-dashed")}
            />
          </span>
        )}
      </div>
      {line.kind === "empty" && line.pending !== null ? (
        <div className="flex justify-end">
          <Chip data-testid="line-clear" aria-label={T.clearAria(line.n)} onClick={() => onClear(line)}>
            {T.clear}
          </Chip>
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
  onScore: (riderId: string, line: SheetLine, value: number) => void;
  onClear: (riderId: string, line: SheetLine) => void;
}

/**
 * The judge's second view: the heat's rider cards across the top and, below, the sheet of the rider who was tapped: exactly as many numbered lines as the division
 * allows attempts (with no limit: the attempts logged plus one empty line ahead). A judge can type on any line at any time until Submit.
 */
export function RiderSheetView(p: RiderSheetViewProps) {
  const [picked, setPicked] = useState(p.riders[0]?.id ?? "");
  const rider = p.riders.find((r) => r.id === picked) ?? p.riders[0];
  const all = rider ? (p.lines[rider.id] ?? []) : [];
  const shown = p.ended ? all.filter((l) => l.kind !== "empty" || l.pending !== null) : all;
  const locked = Boolean(p.lockedMessage);
  return (
    <>
      {p.bare ? null : <ScreenHeader heatName={p.heatName} seat={p.seat} remainingMs={p.remainingMs} timerState={p.timerState} connection={p.connection} pending={p.pendingCount} onRetry={p.onRetry} clock={p.clock} flag={p.flag} />}
      <div data-testid="screen-body" className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2 py-1.5">
        {p.switcher}
        {p.notice}
        {p.lockedMessage ? (
          <p role="status" data-testid="sheet-locked" className="rounded-card border border-beach-border bg-beach-surface px-2 py-1 text-body font-semibold">
            {p.lockedMessage}
          </p>
        ) : null}
        <div data-testid="rider-sheet" className="flex flex-col gap-1.5">
          <div role="group" aria-label={T.strip} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, p.riders.length)}, minmax(0, 1fr))` }}>
            {p.riders.map((r) => (
              <RiderTile key={r.id} compact label={r.label} attempts={r.attempts} max={r.max} selected={rider?.id === r.id} onSelect={() => setPicked(r.id)} />
            ))}
          </div>
          {rider ? (
            <>
              <h2 data-testid="sheet-heading" className="text-heading font-semibold text-beach-muted">
                {T.sheetFor(rider.label.primary.text)}
              </h2>
              <ol data-testid="sheet-lines" aria-label={T.sheetFor(rider.label.primary.text)} className="flex flex-col divide-y divide-beach-line rounded-xl border border-beach-line">
                {shown.map((line) => (
                  <LineRow key={line.n} line={line} scale={p.scale} locked={locked} ended={Boolean(p.ended)} onScore={(l, v) => p.onScore(rider.id, l, v)} onClear={(l) => p.onClear(rider.id, l)} />
                ))}
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
