"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Chip } from "@/components/live/chip";
import { copy } from "@/lib/ui-copy";
import { deleteSimulation, rebuildSimulation, resetSimulation, saveStartingPoint } from "./actions";
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
  const baselineWhen = status.stats.baseline_at ? new Intl.DateTimeFormat("en-GB", { timeZone: status.event.timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(status.stats.baseline_at)) : null;

  return (
    <Card title={T.heading} testId="sim-reset">
      <p className="text-body font-medium">{T.body}</p>
      {hasStart && baselineWhen ? <p className="text-small font-medium text-beach-muted">{T.baselineAt(baselineWhen)}</p> : null}
      {!hasStart ? (
        <div className="flex flex-col gap-1" data-testid="no-baseline">
          <p className="text-body font-semibold">{T.noBaseline}</p>
          {!status.stats.played ? (
            <Chip data-testid="save-baseline" disabled={pending} onClick={() => void act(() => saveStartingPoint(eventId), () => T.baselineSaved)}>
              {T.saveBaseline}
            </Chip>
          ) : (
            <p className="text-body font-medium">{T.rebuildBody}</p>
          )}
        </div>
      ) : null}
      <label className="flex flex-col gap-1 text-body font-semibold">
        {T.typeLabel(slug)}
        <input data-testid="reset-slug" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} className="min-h-tap rounded-lg border border-beach-border bg-beach-bg px-2 text-body font-semibold text-beach-ink" />
      </label>
      {running ? <p className="text-body font-semibold">{T.running(status.now.label ?? "")}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        {hasStart ? (
          <Chip
            data-testid="reset-button"
            variant="danger"
            disabled={pending || !typedOk || running}
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
          </Chip>
        ) : (
          <Chip
            data-testid="rebuild-button"
            variant="danger"
            disabled={pending || !typedOk || running}
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
          </Chip>
        )}
      </div>

      {status.event.isCopy ? (
        <div className="mt-2 flex flex-col gap-1 border-t border-beach-line pt-2" data-testid="sim-delete">
          <h3 className="text-small font-semibold text-beach-muted">{T.deleteHeading}</h3>
          <p className="text-body font-medium">{T.deleteBody}</p>
          <Chip
            data-testid="delete-button"
            variant="danger"
            disabled={pending || !typedOk}
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
          </Chip>
        </div>
      ) : null}
    </Card>
  );
}
