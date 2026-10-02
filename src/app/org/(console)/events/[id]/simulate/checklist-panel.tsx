"use client";

import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { Pill } from "@/components/live/pill";
import type { SimStatus } from "@/lib/simulator/types";
import { copy } from "@/lib/ui-copy";
import { Card } from "./parts";

const T = copy.simulator.checklist;

const clock = (iso: string | null, tz: string) => (iso ? new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(iso)) : "");

/** Every scenario with a tick once it has been exercised, the numbers of the current run, a link to the Feedback notes, and what happened (latest first). */
export function Checklist({ status }: { status: SimStatus }) {
  const s = status.stats;
  const tz = status.event.timezone;
  return (
    <Card title={T.heading} help={T.help} testId="sim-checklist">
      <ul className="flex flex-col gap-1">
        {status.checklist.map((row) => (
          <li key={row.key} data-testid={`checklist-${row.key}`} data-done={row.done} className="flex flex-col gap-0.5 rounded-xl border border-beach-line bg-beach-bg px-2 py-1">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <span className="text-name font-semibold">{copy.simulator.scenarios.items[row.key].label}</span>
              <Pill tone={row.done ? "live" : "missing"} icon={row.done ? CheckCircle2 : Circle} dashed={!row.done}>
                {row.done ? `${T.done} · ${T.times(row.count)}` : T.notYet}
              </Pill>
            </div>
            {row.lastText ? (
              <p className="text-small font-medium text-beach-muted">
                {clock(row.lastAt, tz)} · {row.lastText}
              </p>
            ) : null}
            {!row.done && row.failedText ? <p className="text-small font-medium text-beach-failed">{T.failedLast(row.failedText)}</p> : null}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-0.5 rounded-xl border border-beach-line bg-beach-bg p-2" data-testid="sim-numbers">
        <h3 className="text-small font-semibold text-beach-muted">{T.lastRun}</h3>
        <p className="text-body font-semibold" data-testid="stat-heats">
          {T.heatsPublished(s.heats_published, s.heats_total)}
        </p>
        <p className="text-body font-medium" data-testid="stat-attempts">
          {T.attempts(s.attempts)}
        </p>
        <p className="text-body font-medium" data-testid="stat-scores">
          {T.scores(s.scores, s.impressions)}
        </p>
        <p className="text-body font-medium" data-testid="stat-blockers">
          {T.blockers(s.blockers)}
        </p>
      </div>
      <Link href="/org/feedback" className="w-fit text-body font-semibold underline" data-testid="sim-feedback-link">
        {T.feedback}
      </Link>

      <div className="flex flex-col gap-0.5">
        <h3 className="text-small font-semibold text-beach-muted">{T.log}</h3>
        {status.log.length === 0 ? <p className="text-small font-medium">{T.noLog}</p> : null}
        <ul className="flex max-h-64 flex-col gap-0.5 overflow-auto" data-testid="sim-log">
          {status.log.map((l) => (
            <li key={l.id} className="text-small font-medium">
              <span className="text-beach-muted">{clock(l.at, tz)}</span> {l.text}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
