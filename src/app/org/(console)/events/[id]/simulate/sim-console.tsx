"use client";

import Link from "next/link";
import { Radio } from "lucide-react";
import { Banner } from "@/components/ui/banner";
import { Pill } from "@/components/live/pill";
import type { SimStatus } from "@/lib/simulator/types";
import { copy } from "@/lib/ui-copy";
import { Checklist, LogCard } from "./checklist-panel";
import { Behaviour, Roles, Toolbar } from "./play-panel";
import { ResetPanel } from "./reset-panel";
import { ScenarioPanel } from "./scenario-panel";
import { useSim } from "./use-sim";
import { ViewAs } from "./view-as-panel";

const T = copy.simulator;

/**
 * The control panel, in the organiser design system (the same layout rules as Run order): the controls are one quiet toolbar, everything else is a card.
 * Two columns on a laptop, one on a phone. It takes the page's theme (Daylight or Dark) like every other organiser screen.
 */
export function SimConsole({ eventId, initial }: { eventId: string; initial: SimStatus }) {
  const sim = useSim(eventId, initial);
  const { status, message } = sim;
  const unlocked = status.stats.divisions - status.stats.locked_divisions;
  return (
    <div className="flex flex-col gap-4" data-testid="sim-console" data-run={status.control.runNo}>
      <div className="flex flex-wrap items-center gap-2">
        <Pill icon={Radio} tone="accent">
          {T.pill}
        </Pill>
        <span className="text-name font-semibold" data-testid="sim-event-name">
          {status.event.name}
        </span>
      </div>
      {message ? (
        <Banner tone={message.ok ? "info" : "danger"} data-testid="sim-message">
          {message.text}
        </Banner>
      ) : null}
      {unlocked > 0 ? (
        <Banner tone="warning" role="note" data-testid="sim-need-lock">
          {T.needLock(unlocked)}{" "}
          <Link href={`/org/events/${eventId}/draw`} className="underline">
            {T.needLockLink}
          </Link>
        </Banner>
      ) : null}
      <Toolbar eventId={eventId} sim={sim} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Roles eventId={eventId} sim={sim} />
          <Behaviour eventId={eventId} sim={sim} />
          <ScenarioPanel eventId={eventId} sim={sim} />
        </div>
        <div className="flex flex-col gap-4">
          <ViewAs eventId={eventId} sim={sim} />
          <Checklist status={status} />
          <LogCard status={status} />
          <ResetPanel eventId={eventId} sim={sim} />
        </div>
      </div>
    </div>
  );
}
