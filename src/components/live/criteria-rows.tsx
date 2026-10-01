"use client";

import { HelpTip } from "./help-tip";
import { ScorePad } from "./score-pad";
import type { Scale } from "@/lib/schemas/scoring-model";
import { copy } from "@/lib/ui-copy";

export interface CriterionRow {
  key: string;
  label: string;
  help?: string;
  scale: Scale;
}

/** One pad per criterion on its own scale, a "?" for what it means, and the trick score worked out live from them. */
export function CriteriaRows({ criteria, values, onChange, computedLabel }: { criteria: CriterionRow[]; values: Record<string, number | undefined>; onChange: (key: string, value: number) => void; computedLabel: string | null }) {
  return (
    <div data-testid="criteria-rows" className="flex flex-col gap-5">
      {criteria.map((c) => (
        <div key={c.key} className="flex flex-col gap-2 rounded-lg border-2 border-beach-border bg-beach-bg p-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-rider-name">{c.label}</h4>
            {c.help ? <HelpTip what={c.label} text={c.help} /> : null}
          </div>
          <ScorePad scale={c.scale} value={values[c.key] ?? null} onChange={(v) => onChange(c.key, v)} label={c.label} />
        </div>
      ))}
      <div data-testid="computed-trick-score" className="flex items-center justify-between gap-3 rounded-lg border-4 border-beach-border bg-beach-surface p-3">
        <span className="text-xl font-extrabold">{copy.live.criteria.trickScore}</span>
        <span className="text-4xl font-extrabold tabular-nums">{computedLabel ?? copy.live.pad.none}</span>
      </div>
      {computedLabel === null ? <p className="text-lg font-bold text-beach-muted">{copy.live.criteria.trickScoreNone}</p> : null}
    </div>
  );
}
