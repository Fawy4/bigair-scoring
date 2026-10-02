"use client";

import { Button, disabledWhen } from "@/components/org/button";
import { OrgCard } from "@/components/org/org-card";
import { Banner } from "@/components/ui/banner";
import { Input } from "@/components/ui/input";
import { useState, useTransition } from "react";
import { copy } from "@/lib/ui-copy";
import { cloneAsSimulation } from "./actions";

const T = copy.simulator.notSimulation;

/** On a real event: copy it into a simulation. Nothing happens to the real event. */
export function RunAsSimulation({ eventId, eventName }: { eventId: string; eventName: string }) {
  const [name, setName] = useState(`${eventName} (simulation)`);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ id: string; name: string; locked: number; divisions: number } | null>(null);

  function run() {
    setError(null);
    start(async () => {
      const r = await cloneAsSimulation(eventId, name);
      if (r.ok) setMade(r);
      else setError(r.message);
    });
  }

  return (
    <OrgCard title={T.heading} testId="run-as-simulation">
      <div className="flex max-w-prose flex-col gap-3">
        <p className="text-body font-medium">{T.body}</p>
        {made ? (
          <div className="flex flex-col gap-3" role="status" data-testid="clone-done">
            <p className="text-body font-semibold">{T.ready(made.name)}</p>
            {made.locked < made.divisions ? <p className="text-body font-medium">{T.notDrawn(made.divisions - made.locked)}</p> : null}
            <Button variant="primary" href={`/org/events/${made.id}/simulate`} data-testid="clone-open" className="w-fit">
              {T.open}
            </Button>
          </div>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-body font-semibold">
              {T.nameLabel}
              <Input data-testid="clone-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
            </label>
            <Button variant="primary" className="w-fit" {...disabledWhen(pending && T.working)} onClick={run} data-testid="run-as-simulation-button">
              {T.button}
            </Button>
          </>
        )}
        {error ? (
          <Banner tone="danger" data-testid="clone-error">
            {error}
          </Banner>
        ) : null}
      </div>
    </OrgCard>
  );
}
