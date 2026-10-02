"use client";

import Link from "next/link";
import { Pill } from "@/components/live/pill";
import { Radio } from "lucide-react";
import type { SimStatus } from "@/lib/simulator/types";
import { copy } from "@/lib/ui-copy";
import { Checklist } from "./checklist-panel";
import { Behaviour, Roles, SpeedAndPlay } from "./play-panel";
import { ResetPanel } from "./reset-panel";
import { ScenarioPanel } from "./scenario-panel";
import { useSim } from "./use-sim";
import { ViewAs } from "./view-as-panel";

const T = copy.simulator;

/** The control panel. Beach standard, the compact look of /design: one calm card per job, taps only. Two columns on a laptop, one on a phone. */
export function SimConsole({ eventId, initial }: { eventId: string; initial: SimStatus }) {
  const sim = useSim(eventId, initial);
  const { status, message } = sim;
  const unlocked = status.stats.divisions - status.stats.locked_divisions;
  return (
    <div className="beach-day beach-text-normal flex flex-col gap-3 rounded-card bg-beach-bg p-3 text-beach-ink" data-testid="sim-console" data-run={status.control.runNo}>
      <div className="flex flex-wrap items-center gap-2">
        <Pill icon={Radio} tone="accent">
          {T.pill}
        </Pill>
        <span className="text-name font-semibold" data-testid="sim-event-name">
          {status.event.name}
        </span>
      </div>
      {message ? (
        <p role={message.ok ? "status" : "alert"} data-testid="sim-message" className={`rounded-xl border p-2 text-body font-semibold ${message.ok ? "border-beach-line bg-beach-surface" : "border-beach-failed text-beach-failed"}`}>
          {message.text}
        </p>
      ) : null}
      {unlocked > 0 ? (
        <p role="note" data-testid="sim-need-lock" className="rounded-xl border border-beach-outlier p-2 text-body font-semibold">
          {T.needLock(unlocked)}{" "}
          <Link href={`/org/events/${eventId}/draw`} className="underline">
            {T.needLockLink}
          </Link>
        </p>
      ) : null}
      <div className="grid gap-3 min-[900px]:grid-cols-2">
        <div className="flex flex-col gap-3">
          <SpeedAndPlay eventId={eventId} sim={sim} />
          <Roles eventId={eventId} sim={sim} />
          <Behaviour eventId={eventId} sim={sim} />
          <ScenarioPanel eventId={eventId} sim={sim} />
        </div>
        <div className="flex flex-col gap-3">
          <ViewAs eventId={eventId} sim={sim} />
          <Checklist status={status} />
          <ResetPanel eventId={eventId} sim={sim} />
        </div>
      </div>
    </div>
  );
}
