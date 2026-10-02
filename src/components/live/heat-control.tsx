"use client";

import { BreakStrip, ControlMessage, DivisionTabs, HeatDialogs, ReviewButtons, RunOrderList, StartWarning, TimerBar, TimingButtons, WindButton } from "./head-parts";
import type { HeadController } from "./use-head-controller";
import type { ChecklistItem } from "@/lib/live/publish-checklist";

/** What the Control tab needs to publish and re-open: the blocker list in words, and what to do after a change. */
export interface ReviewProps {
  items: ChecklistItem[];
  canOverride: boolean;
  /** The riders of the shown heat, for Re-run heat ("who does not ride again"). */
  riders: Array<{ entryId: string; word: string; name: string }>;
  /** The riders of a tie (for "Choose order"). */
  onChooseOrder: (riders: string[]) => void;
  onChanged: () => void;
}

/**
 * The Control tab of a phone (docs/PLAN-phase-5 step 1, Console v2): the division selector, the break after a heat, the heat's timer and Start / Pause / Resume /
 * End, the run order of the division, Hold / Resume at / Shift, the wind call (one button), Publish, Re-open, Cancel and Re-run. The laptop arranges the same
 * pieces differently (head-page.tsx); both read one controller, so a press means the same everywhere.
 */
export function HeatControl({ c, divisions, divisionId, liveIds, onPickDivision, announcer }: { c: HeadController; divisions: Array<{ id: string; name: string }>; divisionId: string | null; liveIds: Set<string>; onPickDivision: (id: string) => void; announcer?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <DivisionTabs divisions={divisions} divisionId={divisionId} liveIds={liveIds} onPick={onPickDivision} />
      <StartWarning c={c} />
      <BreakStrip c={c} />
      <TimerBar c={c} />
      <RunOrderList c={c} divisionId={divisionId} />
      <TimingButtons c={c} />
      {!announcer ? <WindButton eventId={c.ctx.event.id} /> : null}
      <ReviewButtons c={c} />
      <ControlMessage c={c} />
      <HeatDialogs c={c} />
    </div>
  );
}
