"use client";

import { clearPlan } from "@/lib/engine/schedule";
import type { SchedulePlan } from "@/lib/schemas/schedule";
import { copy } from "@/lib/ui-copy";
import { ResetSection } from "../reset-section";
import { clearPlanAction } from "./actions";

const C = copy.runOrder.clearPlan;

/** "Clear this plan" on the Run order step: one confirmation (the reason box is optional), the counts first, and the heats that already ran are said to stay. */
export function ClearPlanButton({ planId, planName, plan, started, onCleared }: { planId: string; planName: string; plan: SchedulePlan; started: ReadonlySet<string>; onCleared: (r: { items: unknown; anchors: unknown; actualStarts: unknown }) => void }) {
  const preview = clearPlan(plan, started);
  const nothing = preview.heatsRemoved + preview.otherRemoved === 0;
  return (
    <ResetSection
      testId="clear-plan"
      openLabel={C.open}
      title={C.title(planName)}
      intro={C.intro}
      confirmLabel={C.confirm}
      idleReason={nothing ? C.nothing : undefined}
      load={async () => ({ ok: true, view: { lines: [C.lines(preview.heatsRemoved, preview.otherRemoved, preview.heatsStay)], blockers: [], reasonNeeded: true, reasonWhy: C.reasonWhy } })}
      run={async (reason) => {
        const r = await clearPlanAction(planId, reason);
        if (!r.ok) return r;
        onCleared(r);
        return { ok: true, message: C.done(r.heatsRemoved, r.heatsStay) };
      }}
    />
  );
}
