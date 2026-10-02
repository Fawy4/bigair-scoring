"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, disabledWhen } from "@/components/org/button";
import { Input } from "@/components/ui/input";
import { copy } from "@/lib/ui-copy";
import { deleteSimulation, rebuildSimulation, resetSimulation } from "./actions";
import { Card } from "./parts";
import type { useSim } from "./use-sim";

const T = copy.simulator.reset;
type Sim = ReturnType<typeof useSim>;

/** Reset (one typed confirmation), the starting point, and for a copy made by "Run as simulation" the delete button. */
export function ResetPanel({ eventId, sim }: { eventId: string; sim: Sim }) {
  const router = useRouter();
  const { status, act, pending } = sim;
  const [typed, setTyped] = useState("");
  const slug = status.event.slug;
  const running = status.stats.heats_running > 0;
  const hasStart = status.stats.has_baseline;
  const typedOk = typed.trim().toLowerCase() === slug;

  return (
    <Card title={T.heading} testId="sim-reset">
      <p className="text-body font-medium">{T.body}</p>
      {!hasStart ? (
        <div className="flex flex-col gap-1" data-testid="no-baseline">
          <p className="text-body font-semibold">{T.noBaseline}</p>
          <p className="text-body font-medium">{T.rebuildBody}</p>
        </div>
      ) : null}
      <label className="flex flex-col gap-1 text-body font-semibold">
        {T.typeLabel(slug)}
        <Input data-testid="reset-slug" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} />
      </label>
      <div className="flex flex-wrap gap-2">
        {hasStart ? (
          <Button
            data-testid="reset-button"
            variant="danger"
            {...disabledWhen(pending ? T.working : running ? T.running(status.now.label ?? "") : !typedOk && T.needTyped)}
            onClick={() =>
              void act(
                () => resetSimulation(eventId, typed),
                (r) => {
                  setTyped("");
                  router.refresh();
                  return T.done(r.attempts, r.results);
                },
              )
            }
          >
            {pending ? T.working : T.button}
          </Button>
        ) : (
          <Button
            data-testid="rebuild-button"
            variant="danger"
            {...disabledWhen(pending ? T.rebuilding : running ? T.running(status.now.label ?? "") : !typedOk && T.needTyped)}
            onClick={() =>
              void act(
                () => rebuildSimulation(eventId, typed),
                (r) => {
                  setTyped("");
                  router.refresh();
                  return `${T.rebuilt(r.drawn)}${r.skipped.length ? ` ${T.rebuildSkipped(r.skipped.join(", "))}` : ""}`;
                },
              )
            }
          >
            {pending ? T.rebuilding : T.rebuildButton}
          </Button>
        )}
      </div>

      {status.event.isCopy ? (
        <div className="flex flex-col gap-2 border-t border-beach-line pt-3" data-testid="sim-delete">
          <h3 className="text-body font-semibold">{T.deleteHeading}</h3>
          <p className="text-body font-medium">{T.deleteBody}</p>
          <Button
            data-testid="delete-button"
            variant="danger"
            {...disabledWhen(pending ? T.deleting : !typedOk && T.needTyped)}
            onClick={() =>
              void act(
                () => deleteSimulation(eventId, typed),
                () => {
                  router.push("/org");
                  return T.deleted;
                },
              )
            }
          >
            {pending ? T.deleting : T.deleteButton}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
