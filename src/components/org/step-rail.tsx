"use client";

import { orgCopy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";
import { StatusPill, type StatusState } from "./status-pill";

export interface RailStep {
  key: string;
  label: string;
  state: Extract<StatusState, "done" | "attention" | "not_started">;
  /** One line: the first thing missing, or what is set. The full list belongs on the step's own page. */
  reason: string;
  href?: string;
}

/** The seven steps down the left: number, name, a state pill (icon and word) and one line of reason. */
export function StepRail({ steps, activeKey, onSelect }: { steps: readonly RailStep[]; activeKey: string; onSelect?: (key: string) => void }) {
  return (
    <nav aria-label={orgCopy.shell.railLabel} data-testid="step-rail">
      <ol className="flex flex-col gap-1">
        {steps.map((s, i) => {
          const active = s.key === activeKey;
          return (
            <li key={s.key}>
              <a
                href={s.href ?? `#step-${s.key}`}
                aria-current={active ? "step" : undefined}
                data-testid={`rail-${s.key}`}
                data-state={s.state}
                onClick={(e) => {
                  if (onSelect) {
                    e.preventDefault();
                    onSelect(s.key);
                  }
                }}
                className={cn("flex min-h-[var(--org-ctl)] flex-col gap-1 rounded-[8px] border-l-4 px-3 py-2 hover:bg-beach-surface", active ? "border-beach-accent bg-beach-surface" : "border-transparent")}
              >
                <span className="text-body font-semibold">
                  <span className="tabular-nums text-beach-muted">{i + 1}</span> {s.label}
                </span>
                <StatusPill state={s.state} />
                <span className="text-small font-medium text-beach-muted">{s.reason}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** On a phone the rail is a step picker: today's drop-down, restyled, with the state word in every option and the reason under it. */
export function StepPicker({ steps, activeKey, onSelect }: { steps: readonly RailStep[]; activeKey: string; onSelect: (key: string) => void }) {
  const active = steps.find((s) => s.key === activeKey) ?? steps[0];
  return (
    <div data-testid="step-picker" className="flex flex-col gap-1">
      <label className="text-small font-semibold text-beach-muted" htmlFor="step-picker-select">
        {orgCopy.shell.stepPickerLabel}
      </label>
      <select
        id="step-picker-select"
        value={active.key}
        onChange={(e) => onSelect(e.target.value)}
        className="h-[var(--org-ctl)] w-full rounded-[8px] border border-beach-border bg-beach-bg px-3 text-body font-semibold text-beach-ink"
      >
        {steps.map((s, i) => (
          <option key={s.key} value={s.key}>
            {orgCopy.shell.stepOption(i + 1, s.label, orgCopy.states[s.state].label)}
          </option>
        ))}
      </select>
      <p className="text-small font-medium text-beach-muted">{active.reason}</p>
    </div>
  );
}
