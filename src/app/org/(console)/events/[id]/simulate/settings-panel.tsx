"use client";

import React from "react";
import { copy } from "@/lib/ui-copy";
import { refreshSettings } from "./actions";
import { Card, Choice } from "./parts";
import type { useSim } from "./use-sim";

const T = copy.simulator.settingsFrom;
type Sim = ReturnType<typeof useSim>;

/** "Settings from <event> at hh:mm" with "Refresh from event": the simulation follows the real event's current settings (Polish 3, item 9). Nothing for an event that is not a copy. */
export function SettingsFrom({ eventId, sim }: { eventId: string; sim: Sim }) {
  const { status, act, pending } = sim;
  const from = status.settingsFrom;
  const [busy, setBusy] = React.useState(false);
  if (!from) return null;
  const played = status.stats.played;
  return (
    <Card title={T.heading} help={T.help} testId="sim-settings-from">
      <p data-testid="sim-settings-line" className="text-body font-semibold">
        {T.line(from.eventName, from.time)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Choice
          data-testid="sim-refresh-settings"
          disabled={pending || busy || played}
          title={played ? T.locked : T.help.text}
          onClick={() => {
            setBusy(true);
            void act(() => refreshSettings(eventId), (r) => r.text).finally(() => setBusy(false));
          }}
        >
          {busy ? T.working : T.button}
        </Choice>
      </div>
      {played ? (
        <p data-testid="sim-refresh-why" className="text-small font-medium text-beach-muted">
          {T.locked}
        </p>
      ) : null}
    </Card>
  );
}
