"use client";

import { copy } from "@/lib/ui-copy";
import { clearPlanActuals, previewResetDivision, resetDivision } from "./reset-actions";
import { ResetSection } from "./reset-section";

const P = copy.resetParts;

/** "Reset this division…" on the Divisions step: one confirmation; says when it is a rebuild; a heat running refuses it with the fix. */
export function ResetDivisionButton({ divisionId, name, hasHeats }: { divisionId: string; name: string; hasHeats: boolean }) {
  return (
    <ResetSection
      testId="reset-division"
      openLabel={P.division.open}
      title={P.division.title(name)}
      intro={P.division.intro}
      confirmLabel={P.division.confirm}
      idleReason={hasHeats ? undefined : P.division.noHeats}
      load={async () => {
        const r = await previewResetDivision(divisionId);
        if (!r.ok) return r;
        const { counts: c, running, rebuilt, everPublic, drawn } = r.preview;
        return {
          ok: true,
          view: {
            lines: [P.wipes(c.all_heats, c.attempts, c.scores, c.published_results, c.reruns)],
            blockers: [...(running ? [copy.reset.errors.HEAT_RUNNING(running)] : []), ...(drawn ? [] : [P.errors.NO_DRAW])],
            note: !drawn ? undefined : rebuilt ? P.rebuildNote : P.copyNote,
            reasonNeeded: everPublic,
          },
        };
      }}
      run={async (reason) => {
        const r = await resetDivision({ divisionId, reason });
        return r.ok ? { ok: true, message: P.division.done(name, r.counts.all_heats, r.counts.attempts) } : r;
      }}
    />
  );
}

/** "Clear actual times" on the Run order step, per run order. What it clears is counted from the plan on screen; the database refuses it while a heat runs. */
export function ClearActualsButton({ planId, planName, actualStarts, pins }: { planId: string; planName: string; actualStarts: number; pins: number }) {
  return (
    <ResetSection
      testId="clear-actuals"
      openLabel={P.plan.open}
      title={P.plan.title(planName)}
      intro={P.plan.intro}
      confirmLabel={P.plan.confirm}
      idleReason={actualStarts + pins === 0 ? P.plan.nothing : undefined}
      load={async () => ({ ok: true, view: { lines: [P.plan.lines(actualStarts, pins)], blockers: [], reasonNeeded: false } })}
      run={async () => {
        const r = await clearPlanActuals(planId);
        return r.ok ? { ok: true, message: P.plan.done(r.actualStarts, r.pins) } : r;
      }}
    />
  );
}
