"use client";

import { Hourglass } from "lucide-react";
import { Chip } from "@/components/live/chip";
import { Pill } from "@/components/live/pill";
import { SCENARIO_KEYS, type ScenarioKey } from "@/lib/simulator/scenarios";
import { copy } from "@/lib/ui-copy";
import { judgeIsBack, pressScenarioButton } from "./actions";
import { Card } from "./parts";
import type { useSim } from "./use-sim";

const T = copy.simulator.scenarios;
type Sim = ReturnType<typeof useSim>;

/** One tap each. A scenario that needs a running heat waits for the next one and says so; pressing a waiting one cancels it. What it did goes to the checklist. */
export function ScenarioPanel({ eventId, sim }: { eventId: string; sim: Sim }) {
  const { status, act, pending } = sim;
  const labelOf = (key: ScenarioKey): string => {
    if (key === "wind_hold" && status.windHeld) return T.windResume;
    if (key === "hold_final" && status.finalHeld) return T.holdRelease;
    return T.items[key].label;
  };
  return (
    <Card title={T.heading} help={T.help} testId="sim-scenarios">
      <ul className="flex flex-col gap-1.5">
        {SCENARIO_KEYS.map((key) => {
          const armed = status.armed.includes(key);
          return (
            <li key={key} className="flex flex-col gap-1 rounded-xl border border-beach-line bg-beach-bg p-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Chip data-testid={`scenario-${key}`} data-armed={armed || undefined} pressed={armed} disabled={pending} onClick={() => void act(() => pressScenarioButton(eventId, key), (r) => r.text || null)}>
                  {labelOf(key)}
                </Chip>
                {armed ? (
                  <Pill tone="pending" icon={Hourglass}>
                    {T.armed}
                  </Pill>
                ) : null}
                {key === "judge_dies" && status.deadJudge ? (
                  <Chip data-testid="scenario-judge-back" disabled={pending} onClick={() => void act(() => judgeIsBack(eventId))}>
                    {T.judgeBack}
                  </Chip>
                ) : null}
              </div>
              <p className="text-small font-medium text-beach-muted">{T.items[key].hint}</p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
