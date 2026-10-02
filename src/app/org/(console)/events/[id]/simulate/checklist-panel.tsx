"use client";

import { Button } from "@/components/org/button";
import { CheckCircle2, Circle } from "lucide-react";
import { Pill } from "@/components/live/pill";
import type { SimStatus } from "@/lib/simulator/types";
import { copy } from "@/lib/ui-copy";
import { Card } from "./parts";

const T = copy.simulator.checklist;

const clock = (iso: string | null, tz: string) => (iso ? new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(iso)) : "");

/** Every scenario with a tick once it has been exercised, the numbers of the current run and a link to the Feedback notes. */
export function Checklist({ status }: { status: SimStatus }) {
  const s = status.stats;
  const tz = status.event.timezone;
  return (
    <Card title={T.heading} help={T.help} testId="sim-checklist">
      <ul className="flex flex-col">
        {status.checklist.map((row) => (
          <li key={row.key} data-testid={`checklist-${row.key}`} data-done={row.done} className="flex flex-col gap-0.5 border-b border-beach-line py-2 first:pt-0 last:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-body font-semibold">{copy.simulator.scenarios.items[row.key].label}</span>
              <Pill tone={row.done ? "live" : "missing"} icon={row.done ? CheckCircle2 : Circle} dashed={!row.done}>
                {row.done ? `${T.done} · ${T.times(row.count)}` : T.notYet}
              </Pill>
            </div>
            {row.lastText ? (
              <p className="text-small font-medium text-beach-muted">
                <span className="tabular-nums">{clock(row.lastAt, tz)}</span> · {row.lastText}
              </p>
            ) : null}
            {!row.done && row.failedText ? <p className="text-small font-medium text-beach-failed">{T.failedLast(row.failedText)}</p> : null}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1 rounded-[8px] border border-beach-line bg-beach-surface px-3 py-2" data-testid="sim-numbers">
        <h3 className="text-small font-semibold text-beach-muted">{T.lastRun}</h3>
        <p className="text-body font-semibold tabular-nums" data-testid="stat-heats">
          {T.heatsPublished(s.heats_published, s.heats_total)}
        </p>
        <p className="text-body font-medium tabular-nums" data-testid="stat-attempts">
          {T.attempts(s.attempts)}
        </p>
        <p className="text-body font-medium tabular-nums" data-testid="stat-scores">
          {T.scores(s.scores, s.impressions)}
        </p>
        <p className="text-body font-medium tabular-nums" data-testid="stat-blockers">
          {T.blockers(s.blockers)}
        </p>
      </div>
      <Button variant="quiet" href="/org/feedback" data-testid="sim-feedback-link" className="w-fit">
        {T.feedback}
      </Button>
    </Card>
  );
}

/** What happened, latest first, in its own card: the time in a fixed column so the lines line up. */
export function LogCard({ status }: { status: SimStatus }) {
  const tz = status.event.timezone;
  return (
    <Card title={T.log} testId="sim-log-card">
      {status.log.length === 0 ? <p className="text-small font-medium text-beach-muted">{T.noLog}</p> : null}
      <ul className="flex max-h-64 flex-col overflow-auto" data-testid="sim-log">
        {status.log.map((l) => (
          <li key={l.id} className="grid grid-cols-[5.5rem_1fr] gap-2 border-b border-beach-line py-1 text-small font-medium last:border-b-0">
            <span className="text-right tabular-nums text-beach-muted">{clock(l.at, tz)}</span>
            <span>{l.text}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
