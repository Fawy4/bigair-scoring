"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Monitor, Pause, Play, Printer, SkipForward } from "lucide-react";
import { Button } from "@/components/org/button";
import { NowNextCard, ReadinessList, WindCallSlot, type CheckRow, type HeatLine } from "@/components/org/dashboard-parts";
import { DataTable } from "@/components/org/data-table";
import { useShellLayout } from "@/components/org/layout-context";
import { OrgCard } from "@/components/org/org-card";
import { Popover } from "@/components/org/popover";
import { HeatTimer, type TimerState } from "@/components/live/heat-timer";
import { useServerClock, useTick } from "@/components/live/use-server-clock";
import { holdPlan, resumePlanAt, shiftPlan, type PlanActionResult } from "@/lib/live/heat-actions";
import { createClient } from "@/lib/supabase/browser";
import { effectiveStatus, remainingMs, type HeatTiming } from "@/lib/live/timer";
import { copy, orgCopy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";
import { ResetEvent } from "./reset-panel";
import { ShareCard } from "./share-card";

export interface DashboardRow {
  id: string;
  start: string | null;
  label: string;
  status: string;
}

export interface DashboardViewProps {
  eventId: string;
  timezone: string;
  checks: CheckRow[];
  /** The run order active for today, if any, and whether it is on hold (since when, in the event's time zone). */
  plan: { id: string; heldSince: string | null } | null;
  rows: DashboardRow[];
  finish: string | null;
  running: { label: string; timing: HeatTiming } | null;
  next: HeatLine | null;
  after: HeatLine | null;
  joinUrl: string;
  publicUrl: string;
}

const clockIn = (ms: number, tz: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(ms);

/** The timer reads the database's clock (never this device's), so a phone with the wrong time still shows the right number. */
function LiveNow({ running, held, next, after, timezone }: { running: DashboardViewProps["running"]; held: boolean; next: HeatLine | null; after: HeatLine | null; timezone: string }) {
  const supabase = useMemo(() => createClient(), []);
  const clock = useServerClock(supabase);
  const t = useTick(clock.now, 500);
  const state: TimerState | null = running ? (held ? "held" : ((): TimerState => { const s = effectiveStatus(running.timing, t); return s === "paused" ? "paused" : s === "ended" ? "ended" : "running"; })()) : null;
  return (
    <NowNextCard
      now={running?.label ?? null}
      held={held}
      serverTime={clock.ready ? clockIn(t, timezone) : undefined}
      serverZone={timezone.split("/").pop()?.replace(/_/g, " ")}
      timer={running && state ? <HeatTimer remainingMs={remainingMs(running.timing, t)} state={state} size="head" /> : undefined}
      next={next}
      after={after}
    />
  );
}

/** Hold, Resume at, Shift, the head judge console, the big screen. Each runs on the server with the database's clock and says why when it cannot run. */
function QuickActionsLive({ eventId, plan, timezone, runningHeat }: { eventId: string; plan: DashboardViewProps["plan"]; timezone: string; runningHeat: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resumeAt, setResumeAt] = useState(() => clockIn(Date.now(), timezone).slice(0, 5));
  const laptop = useShellLayout() === "laptop";
  const held = Boolean(plan?.heldSince);

  const run = (go: () => Promise<PlanActionResult>) => {
    setError(null);
    start(async () => {
      const r = await go();
      if (!r.ok) setError(r.message);
      else router.refresh();
    });
  };
  const noPlan = !plan;
  const busy = pending ? { disabled: true as const, disabledReason: orgCopy.dashboard.working } : {};
  return (
    <OrgCard title={orgCopy.dashboard.actionsTitle} testId="quick-actions">
      <div className={cn("grid items-start gap-2", laptop ? "grid-cols-2" : "grid-cols-1")}>
        {noPlan ? (
          <Button variant="secondary" icon={Pause} disabled disabledReason={orgCopy.dashboard.noPlanToday}>
            {orgCopy.dashboard.hold}
          </Button>
        ) : held ? (
          <Button variant="secondary" icon={Pause} disabled disabledReason={orgCopy.dashboard.alreadyHeld}>
            {orgCopy.dashboard.hold}
          </Button>
        ) : (
          <Button variant="secondary" icon={Pause} {...busy} onClick={() => run(() => holdPlan(plan!.id))} data-testid="action-hold">
            {orgCopy.dashboard.hold}
          </Button>
        )}
        {noPlan ? (
          <Button variant="secondary" icon={Play} disabled disabledReason={orgCopy.dashboard.noPlanToday}>
            {orgCopy.dashboard.resume}
          </Button>
        ) : !held ? (
          <Button variant="secondary" icon={Play} disabled disabledReason={orgCopy.dashboard.notHeld}>
            {orgCopy.dashboard.resume}
          </Button>
        ) : (
          <Popover label={orgCopy.dashboard.resume} icon={Play} testId="action-resume" panelClassName="w-72">
            {(close) => (
              <div className="flex flex-col gap-2 p-1">
                <label htmlFor="dash-resume-at" className="text-body font-semibold">
                  {orgCopy.dashboard.resumeAt}
                </label>
                <input id="dash-resume-at" type="time" value={resumeAt} onChange={(e) => setResumeAt(e.target.value)} className="h-[var(--org-ctl)] w-32 rounded-[8px] border border-beach-border bg-transparent px-2 text-body font-semibold" />
                <Button
                  variant="primary"
                  icon={Play}
                  {...(!resumeAt ? { disabled: true as const, disabledReason: orgCopy.dashboard.resumeAt } : busy)}
                  onClick={() => {
                    close();
                    run(() => resumePlanAt(plan!.id, resumeAt));
                  }}
                >
                  {orgCopy.dashboard.resumeConfirm}
                </Button>
              </div>
            )}
          </Popover>
        )}
        {[5, 10].map((m) =>
          noPlan || held ? (
            <Button key={m} variant="secondary" icon={SkipForward} disabled disabledReason={noPlan ? orgCopy.dashboard.noPlanToday : orgCopy.dashboard.shiftHeld}>
              {orgCopy.dashboard.shift(m)}
            </Button>
          ) : (
            <Button key={m} variant="secondary" icon={SkipForward} {...busy} onClick={() => run(() => shiftPlan(plan!.id, m))} data-testid={`action-shift-${m}`}>
              {orgCopy.dashboard.shift(m)}
            </Button>
          ),
        )}
        <span className="inline-flex flex-col items-start gap-1">
          <Button variant="primary" icon={ExternalLink} href={`/head/${eventId}`} target="_blank">
            {orgCopy.dashboard.headConsole}
          </Button>
          <span className="text-small font-medium text-beach-muted">{orgCopy.dashboard.headConsoleHint}</span>
        </span>
        <Button variant="secondary" icon={Monitor} disabled disabledReason={orgCopy.dashboard.bigScreenWaiting}>
          {orgCopy.dashboard.bigScreen}
        </Button>
      </div>
      <div className="mt-3 border-t border-beach-line pt-3">
        <ResetEvent eventId={eventId} runningHeat={runningHeat} />
      </div>
      {held && plan?.heldSince ? (
        <p data-testid="run-hold" className="mt-3 text-body font-semibold">
          {orgCopy.dashboard.held(plan.heldSince)}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-body font-semibold text-beach-crash">
          {orgCopy.dashboard.failed(error)}
        </p>
      ) : null}
    </OrgCard>
  );
}

export function DashboardView(p: DashboardViewProps) {
  const laptop = useShellLayout() === "laptop";
  const held = Boolean(p.plan?.heldSince);
  return (
    <div className="org-new flex flex-col gap-4">
      <div className={cn("grid items-start gap-4", laptop ? "grid-cols-2" : "grid-cols-1")}>
        <ReadinessList checks={p.checks} />
        <LiveNow running={p.running} held={held} next={p.next} after={p.after} timezone={p.timezone} />
        <WindCallSlot />
        <QuickActionsLive eventId={p.eventId} plan={p.plan} timezone={p.timezone} runningHeat={p.running?.label ?? null} />
        <div className={laptop ? "col-span-2" : undefined} data-testid="dashboard-today">
          <OrgCard title={copy.dashboard.today} actions={p.finish ? <span className="text-small font-semibold text-beach-muted">{copy.runOrder.finish(p.finish)}</span> : undefined} testId="dashboard-timetable">
            {p.rows.length === 0 ? (
              <p className="text-body font-medium text-beach-muted">{copy.dashboard.noPlan}</p>
            ) : (
              <div className="-m-4">
                <DataTable
                  bare
                  testId="dashboard-table"
                  caption={copy.dashboard.today}
                  rows={p.rows}
                  getId={(r) => r.id}
                  columns={[
                    { id: "start", header: orgCopy.dashboard.colStart, align: "end", render: (r) => r.start ?? "–" },
                    { id: "heat", header: orgCopy.dashboard.colHeat, render: (r) => r.label },
                    { id: "state", header: copy.dashboard.statusColumn, render: (r) => copy.runOrder.status[r.status as keyof typeof copy.runOrder.status] ?? r.status },
                  ]}
                />
              </div>
            )}
            <div className="mt-3">
              <Button variant="quiet" href={`/org/events/${p.eventId}/schedule`}>
                {copy.dashboard.openRunOrder}
              </Button>
            </div>
          </OrgCard>
        </div>
        <ShareCard testId="share-join" title={copy.dashboard.joinTitle} text={copy.dashboard.joinText} url={p.joinUrl} />
        <ShareCard testId="share-public" title={copy.dashboard.publicTitle} text={copy.dashboard.publicText} url={p.publicUrl} />
        <div className={laptop ? "col-span-2" : undefined}>
          <Button variant="quiet" icon={Printer} href={`/org/events/${p.eventId}/officials/cards`}>
            {orgCopy.dashboard.printCards}
          </Button>
        </div>
      </div>
    </div>
  );
}
