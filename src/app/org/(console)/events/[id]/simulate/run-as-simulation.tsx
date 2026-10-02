"use client";

import Link from "next/link";
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
    <section className="panel flex flex-col gap-3" data-testid="run-as-simulation" aria-label={T.heading}>
      <h2 className="text-xl font-extrabold">{T.heading}</h2>
      <p className="font-semibold">{T.body}</p>
      {made ? (
        <div className="flex flex-col gap-2" role="status" data-testid="clone-done">
          <p className="font-bold">{T.ready(made.name)}</p>
          {made.locked < made.divisions ? <p className="font-semibold">{T.notDrawn(made.divisions - made.locked)}</p> : null}
          <Link href={`/org/events/${made.id}/simulate`} className="btn btn-primary w-fit" data-testid="clone-open">
            {T.open}
          </Link>
        </div>
      ) : (
        <>
          <label className="flex flex-col gap-1 font-bold">
            {T.nameLabel}
            <input data-testid="clone-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="button" className="btn btn-primary w-fit" disabled={pending} onClick={run} data-testid="run-as-simulation-button">
            {pending ? T.working : T.button}
          </button>
        </>
      )}
      {error ? (
        <p role="alert" className="font-bold" data-testid="clone-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
