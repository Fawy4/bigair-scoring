import { ChevronRight, CircleCheck, EyeOff, Flag, Repeat, TriangleAlert } from "lucide-react";
import { Pill } from "./pill";
import type { LabelModel } from "@/lib/identification/rider-label";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const button = "inline-flex min-h-tap items-center gap-1.5 rounded-xl border border-beach-border bg-beach-bg px-3 text-body font-semibold text-beach-ink";

/** The rider's colour dot and word, then the name: a button that opens the rider's sheet. */
function RiderName({ label, name, onOpen }: { label: LabelModel; name: string; onOpen?: () => void }) {
  const p = label.primary;
  const inner = (
    <>
      {p.kind === "colour" ? <span aria-hidden className="size-3.5 shrink-0 rounded-full" style={{ backgroundColor: p.hex, boxShadow: p.outlined ? "inset 0 0 0 1.5px var(--beach-ink)" : undefined }} /> : null}
      <span className="text-small font-semibold tracking-wide text-beach-muted">{p.text}</span>
      <span className="truncate text-name font-semibold text-beach-ink">{name}</span>
      {onOpen ? <ChevronRight aria-hidden className="size-5 shrink-0 text-beach-muted" /> : null}
    </>
  );
  return onOpen ? (
    <button type="button" data-testid="rider-name-button" aria-label={copy.live.attempt.openRider(name)} onClick={onOpen} className="flex min-h-tap min-w-0 items-center gap-1.5 text-left">
      {inner}
    </button>
  ) : (
    <span className="flex min-w-0 items-center gap-1.5">{inner}</span>
  );
}

/**
 * One attempt on the judge's phone. Two forms: the full card (the attempt being scored: rider name that opens the sheet, trick, the pad slot, Missed and Flag)
 * and the compact card (`compact`: one line for the trick, the status pill and the judge's own score; the previous card, and the Details list).
 * A crashed attempt shows "Crashed — no score needed" and no pad; the judge can flag it as a landing.
 */
export function AttemptCard({
  number,
  label,
  riderName,
  trick,
  status,
  direction,
  repeat,
  myScoreLabel,
  missed = false,
  compact = false,
  onOpenRider,
  onMissed,
  onFlag,
  children,
}: {
  number: number;
  label: LabelModel;
  riderName: string;
  trick: string;
  status: "landed" | "crashed";
  direction?: "left" | "right" | null;
  /** e.g. { nth: "2nd", previous: "7.0" } */
  repeat?: { nth: string; previous: string };
  myScoreLabel?: string | null;
  missed?: boolean;
  compact?: boolean;
  onOpenRider?: () => void;
  onMissed?: () => void;
  onFlag?: () => void;
  children?: React.ReactNode;
}) {
  const T = copy.live.attempt;
  const crashed = status === "crashed";
  const dir = direction === "left" ? copy.live.summary.left : direction === "right" ? copy.live.summary.right : null;
  const statusPill = (
    <Pill icon={crashed ? TriangleAlert : CircleCheck} tone={crashed ? "crash" : "live"}>
      {crashed ? T.crashed : T.landed}
    </Pill>
  );
  if (compact) {
    return (
      <article data-testid="attempt-card" data-compact="true" data-status={status} className="flex flex-col gap-0.5 rounded-card border border-beach-line bg-beach-surface px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-small font-semibold text-beach-muted">
            {T.number(number)} · {label.primary.text}
          </span>
          <span className="flex items-center gap-1.5">
            {repeat ? (
              <Pill icon={Repeat} tone="pending">
                {T.repeatShort(repeat.nth)}
              </Pill>
            ) : null}
            {statusPill}
          </span>
        </div>
        <p className="text-name font-semibold">
          {trick}
          {dir ? <span className="ml-2 text-body font-medium text-beach-muted">{dir}</span> : null}
        </p>
        {crashed ? null : <p className="text-body font-semibold tabular-nums">{myScoreLabel ? T.youGave(myScoreLabel) : <span className="text-beach-muted">{T.notScored}</span>}</p>}
      </article>
    );
  }
  return (
    <article data-testid="attempt-card" data-status={status} className={cn("flex flex-col gap-1 rounded-card border bg-beach-surface p-2", crashed ? "border-beach-crash" : "border-beach-line")}>
      <header className="flex items-center justify-between gap-2">
        <RiderName label={label} name={riderName} onOpen={onOpenRider} />
        <span className="shrink-0 text-small font-semibold text-beach-muted">{T.number(number)}</span>
      </header>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-name font-semibold">
          {trick}
          {dir ? <span className="ml-2 text-body font-medium text-beach-muted">{dir}</span> : null}
        </p>
        <span className="shrink-0">{statusPill}</span>
      </div>
      {repeat ? (
        <p data-testid="repeat-badge">
          <Pill icon={Repeat} tone="pending">
            {T.repeat(repeat.nth, repeat.previous)}
          </Pill>
        </p>
      ) : null}
      {crashed ? (
        <>
          <p className="text-body font-semibold text-beach-crash">{T.crashedNoScore}</p>
          {onFlag ? (
            <button type="button" onClick={onFlag} className={button}>
              <Flag aria-hidden className="size-5" />
              {T.flagLanding}
            </button>
          ) : null}
        </>
      ) : (
        <>
          {missed ? (
            <p data-testid="missed-note">
              <Pill icon={EyeOff} tone="missing" dashed>
                {T.missedSet}
              </Pill>
            </p>
          ) : null}
          {children}
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={missed} onClick={onMissed} className={cn(button, missed && "border-2 border-beach-accent")}>
              <EyeOff aria-hidden className="size-5" />
              {T.missed}
            </button>
            <button type="button" onClick={onFlag} className={button}>
              <Flag aria-hidden className="size-5" />
              {T.flag}
            </button>
          </div>
        </>
      )}
    </article>
  );
}
