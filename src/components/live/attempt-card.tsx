import { CircleCheck, EyeOff, Flag, Repeat, TriangleAlert } from "lucide-react";
import { RiderLabel } from "@/components/rider-label";
import type { LabelModel } from "@/lib/identification/rider-label";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

/**
 * One attempt on the judge's phone: label, number, trick, Landed / Crashed, Repeat badge, Missed and Flag, and the pad slot.
 * A crashed attempt shows "Crashed — no score needed" and no pad (owner, 1 Oct 2026); the judge can flag it as a landing.
 */
export function AttemptCard({
  number,
  label,
  trick,
  categoryLabel,
  status,
  repeat,
  missed = false,
  onMissed,
  onFlag,
  children,
}: {
  number: number;
  label: LabelModel;
  trick: string;
  categoryLabel?: string;
  status: "landed" | "crashed";
  /** e.g. { nth: "2nd", previous: "7.0" } */
  repeat?: { nth: string; previous: string };
  missed?: boolean;
  onMissed?: () => void;
  onFlag?: () => void;
  children?: React.ReactNode;
}) {
  const T = copy.live.attempt;
  const crashed = status === "crashed";
  const button = "inline-flex min-h-tap items-center gap-2 rounded-lg border-2 border-beach-border bg-beach-bg px-4 text-lg font-bold text-beach-ink";
  return (
    <article data-testid="attempt-card" data-status={status} className={cn("flex flex-col gap-3 rounded-lg border-2 bg-beach-surface p-3", crashed ? "border-beach-crash" : "border-beach-border")}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-2xl font-extrabold">{T.number(number)}</h3>
        <span data-testid="attempt-status" className={cn("inline-flex min-h-tap items-center gap-2 rounded-full border-2 border-current px-4 text-xl font-extrabold", crashed ? "text-beach-crash" : "text-beach-live")}>
          {crashed ? <TriangleAlert aria-hidden className="size-6" /> : <CircleCheck aria-hidden className="size-6" />}
          {crashed ? T.crashed : T.landed}
        </span>
      </header>
      <RiderLabel model={label} size="md" nameplate />
      <p className="text-rider-name">
        {trick}
        {categoryLabel ? <span className="block text-lg font-semibold text-beach-muted">{categoryLabel}</span> : null}
      </p>
      {repeat ? (
        <p data-testid="repeat-badge" className="inline-flex items-center gap-2 self-start rounded-full border-2 border-beach-pending px-4 py-1 text-lg font-extrabold text-beach-pending">
          <Repeat aria-hidden className="size-6" />
          {T.repeat(repeat.nth, repeat.previous)}
        </p>
      ) : null}
      {crashed ? (
        <>
          <p className="text-xl font-extrabold text-beach-crash">{T.crashedNoScore}</p>
          {onFlag ? (
            <button type="button" onClick={onFlag} className={button}>
              <Flag aria-hidden className="size-6" />
              {T.flagLanding}
            </button>
          ) : null}
        </>
      ) : (
        <>
          {missed ? (
            <p data-testid="missed-note" className="inline-flex items-center gap-2 self-start rounded-lg border-2 border-dashed border-beach-missing px-3 py-2 text-xl font-extrabold text-beach-missing">
              <EyeOff aria-hidden className="size-6" />
              {T.missedSet}
            </p>
          ) : null}
          {children}
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={missed} onClick={onMissed} className={cn(button, missed && "border-4")}>
              <EyeOff aria-hidden className="size-6" />
              {T.missed}
            </button>
            <button type="button" onClick={onFlag} className={button}>
              <Flag aria-hidden className="size-6" />
              {T.flag}
            </button>
          </div>
        </>
      )}
    </article>
  );
}
