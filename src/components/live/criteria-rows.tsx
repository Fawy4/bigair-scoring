"use client";

import { useState } from "react";
import { HelpTip } from "./help-tip";
import { ScorePad } from "./score-pad";
import type { Scale } from "@/lib/schemas/scoring-model";
import { formatPadValue } from "@/lib/live/score-pad";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

export interface CriterionRow {
  key: string;
  label: string;
  help?: string;
  scale: Scale;
}

/**
 * Scoring by criteria on a phone: one tab per criterion showing its value, and ONE pad (for the tab chosen) on that criterion's own scale,
 * with a "?" for what it means and the trick score worked out live. One pad at a time keeps the whole attempt on one screen.
 */
export function CriteriaRows({ criteria, values, onChange, computedLabel, caption }: { criteria: CriterionRow[]; values: Record<string, number | undefined>; onChange: (key: string, value: number) => void; computedLabel: string | null; caption?: React.ReactNode }) {
  const [active, setActive] = useState(criteria[0]?.key);
  const current = criteria.find((c) => c.key === active) ?? criteria[0];
  return (
    <div data-testid="criteria-rows" className="flex flex-col gap-2">
      <div role="group" aria-label={copy.live.criteria.tabs} className="grid grid-cols-4 gap-1.5">
        {criteria.map((c) => {
          const v = values[c.key];
          const on = c.key === current.key;
          return (
            <button
              key={c.key}
              type="button"
              data-criterion={c.key}
              aria-pressed={on}
              onClick={() => setActive(c.key)}
              className={cn("flex min-h-[52px] min-w-0 flex-col items-center justify-center rounded-xl px-1 py-1", on ? "border-2 border-beach-accent bg-beach-bg" : "border border-beach-line bg-beach-surface")}
            >
              <span className="max-w-full truncate text-small font-semibold text-beach-ink">{c.label}</span>
              <span className={cn("text-body tabular-nums", v === undefined ? "font-medium text-beach-muted" : "font-semibold text-beach-ink")}>{v === undefined ? copy.live.pad.none : formatPadValue(v, c.scale)}</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-name font-semibold">{current.label}</p>
        {current.help ? <HelpTip what={current.label} text={current.help} /> : null}
      </div>
      <ScorePad scale={current.scale} value={values[current.key] ?? null} onChange={(v) => onChange(current.key, v)} label={current.label} caption={caption} />
      <div data-testid="computed-trick-score" className="flex items-center justify-between gap-3 rounded-xl border border-beach-line bg-beach-surface px-3 py-2">
        <span className="text-body font-semibold">{copy.live.criteria.trickScore}</span>
        <span className="text-digit font-semibold tabular-nums">{computedLabel ?? copy.live.pad.none}</span>
      </div>
      {computedLabel === null ? <p className="text-small font-medium text-beach-muted">{copy.live.criteria.trickScoreNone}</p> : null}
    </div>
  );
}
