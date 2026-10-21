"use client";

import { Timer } from "lucide-react";
import type { AutoStartNotice } from "@/lib/live/auto-start";
import type { StartNextHeat } from "@/lib/schemas/event-settings";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const E = copy.heatEnd;

/**
 * "Start the next heat" on the head judge's console (HE1). While a notice runs: "Next heat sequence starts in 10 s — Stop" in the brand's teal, a full-width row with a
 * big Stop. Otherwise, when the event starts heats by itself, one quiet line says whether auto start is on and offers the switch for the rest of the event; a refusal
 * of the last attempt is told in words. Nothing is drawn for an event that starts heats by hand.
 */
export function AutoStartBar({ notice, setting, off, note, busy, onStop, onSwitch, className }: { notice: AutoStartNotice | null; setting: StartNextHeat; off: boolean; note: string | null; busy: boolean; onStop: () => void; onSwitch: (on: boolean) => void; className?: string }) {
  if (setting === "manual" && !notice && !note) return null;
  return (
    <div data-testid="auto-start" data-state={notice ? (notice.due ? "starting" : "notice") : off ? "off" : "on"} className={cn("flex w-full flex-col gap-1", className)}>
      {notice ? (
        <div data-testid="auto-start-notice" data-seconds={notice.secondsLeft} role="alert" className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-card border-2 border-beach-accent bg-beach-accent px-3 py-2 text-beach-on-accent">
          <Timer aria-hidden className="size-5 shrink-0" />
          <p data-testid="auto-start-text" className="min-w-0 flex-1 basis-48 text-name font-bold">
            {notice.due ? E.autoStartStarting : E.autoStartIn(notice.secondsLeft)}
          </p>
          {notice.due ? null : (
            <button type="button" data-testid="auto-start-stop" aria-label={E.autoStartStopAria} disabled={busy} onClick={onStop} className="min-h-[56px] min-w-[96px] rounded-xl border-2 border-beach-on-accent bg-beach-bg px-4 text-name font-bold text-beach-ink disabled:opacity-60">
              {E.autoStartStop}
            </button>
          )}
        </div>
      ) : null}
      {setting !== "manual" ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p data-testid="auto-start-state" className="text-small font-semibold text-beach-muted">
            {off ? E.autoStartOff : `${E.autoStartOn} (${E.autoStartMode[setting] ?? ""})`}
          </p>
          <button type="button" data-testid="auto-start-switch" aria-pressed={!off} disabled={busy} onClick={() => onSwitch(off)} className="min-h-tap rounded-lg border border-beach-border bg-beach-fill px-2 text-small font-semibold text-beach-ink disabled:opacity-60">
            {off ? E.autoStartSwitchOn : E.autoStartSwitchOff}
          </button>
        </div>
      ) : null}
      {note ? (
        <p data-testid="auto-start-note" role="status" className="rounded-lg border border-beach-border bg-beach-surface px-2 py-1 text-small font-semibold">
          {note}
        </p>
      ) : null}
    </div>
  );
}
