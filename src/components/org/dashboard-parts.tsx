"use client";

import type { ReactNode } from "react";
import { ExternalLink, Monitor, Pause, Play, Printer, RotateCcw, SkipForward, Wind } from "lucide-react";
import { orgCopy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";
import { CopyLinkButton } from "./app-shell";
import { Button } from "./button";
import { DataTable } from "./data-table";
import { useShellLayout } from "./layout-context";
import { OrgCard } from "./org-card";
import { StatusPill } from "./status-pill";
import type { RunOrderRow } from "@/lib/org-design/fixtures";

/** What a checklist row needs: the preview's rows have a title and a step, the real ones a link. */
export interface CheckRow {
  id: string;
  state: "done" | "attention" | "not_started";
  title?: string;
  sentence: string;
  fixHref?: string;
  fixStep?: string | null;
}

/** One row per check: a pill, a sentence and a "Fix" link to the right step. All green reads "Ready to run". */
export function ReadinessList({ checks, onFix }: { checks: readonly CheckRow[]; onFix?: (step: string) => void }) {
  const left = checks.filter((c) => c.state !== "done").length;
  return (
    <OrgCard
      title={orgCopy.dashboard.readinessTitle}
      testId="dashboard-missing"
      actions={
        left === 0 ? (
          <span data-testid="dashboard-ready" className="text-small font-semibold text-beach-accent">
            {orgCopy.dashboard.ready}
          </span>
        ) : (
          <span className="text-small font-semibold text-beach-muted">{orgCopy.dashboard.thingsLeft(left)}</span>
        )
      }
    >
      <ul className="-my-2 flex flex-col">
        {checks.map((c) => (
          <li key={c.id} data-testid={`check-${c.id}`} data-state={c.state} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-beach-line py-2 last:border-b-0">
            <StatusPill state={c.state} />
            <div className="min-w-0 flex-1 basis-44">
              {c.title ? (
                <>
                  <p className="text-body font-semibold">{c.title}</p>
                  <p className="text-small font-medium text-beach-muted">{c.sentence}</p>
                </>
              ) : (
                <p className="text-body font-semibold">{c.sentence}</p>
              )}
            </div>
            {c.state !== "done" && (c.fixHref || c.fixStep) ? (
              <Button
                variant="secondary"
                href={c.fixHref ?? `#step-${c.fixStep}`}
                aria-label={orgCopy.dashboard.fixLabel(c.title ?? c.sentence)}
                data-testid={`fix-${c.id}`}
                onClick={onFix && c.fixStep ? (e) => { e.preventDefault(); onFix(c.fixStep!); } : undefined}
              >
                {orgCopy.dashboard.fix}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </OrgCard>
  );
}

/** The running heat with its timer (counted from the server's clock, frozen on the preview), the next heat and the one after it. */
export interface HeatLine {
  label: string;
  start: string | null;
}

export function NowNextCard({ now, timerText, timer, serverTime, serverZone, next, after, held }: { now: string | null; timerText?: string; timer?: ReactNode; serverTime?: string; serverZone?: string; next: HeatLine | null; after: HeatLine | null; held: boolean }) {
  const line = (h: HeatLine | null) => (h ? `${h.label}${h.start ? ` · ${orgCopy.dashboard.est(h.start)}` : ""}` : orgCopy.dashboard.nothingNext);
  return (
    <OrgCard title={orgCopy.dashboard.nowTitle} testId="dashboard-now">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {now ? <StatusPill state={held ? "held" : "live"} /> : null}
            <span className="text-body font-semibold">{now ?? orgCopy.dashboard.nothingRunning}</span>
          </div>
          {serverTime ? <p className="mt-1 text-small font-medium text-beach-muted">{orgCopy.dashboard.serverTime(serverTime, serverZone)}</p> : null}
        </div>
        {timer ? (
          <div data-testid="dashboard-timer" className="ml-auto">
            {timer}
          </div>
        ) : timerText ? (
          <p data-testid="dashboard-timer" className="ml-auto text-timer-head font-semibold tabular-nums">
            {timerText} <span className="text-body font-medium text-beach-muted">{orgCopy.dashboard.left}</span>
          </p>
        ) : null}
      </div>
      <dl className="mt-3 flex flex-col gap-1 border-t border-beach-line pt-3 text-body">
        <div data-testid="dashboard-next" className="flex flex-wrap justify-between gap-x-4">
          <dt className="font-semibold">{orgCopy.dashboard.next}</dt>
          <dd className="font-medium">{line(next)}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-x-4">
          <dt className="font-semibold">{orgCopy.dashboard.after}</dt>
          <dd className="font-medium">{line(after)}</dd>
        </div>
      </dl>
    </OrgCard>
  );
}

/** The wind call is built with the public pages (Phase 6); this card only holds its place and says why it is waiting. */
export function WindCallSlot() {
  return (
    <OrgCard title={orgCopy.dashboard.windTitle} testId="wind-call-slot">
      <p className="mb-2 text-body font-medium text-beach-muted">{orgCopy.dashboard.windBody}</p>
      <Button variant="secondary" icon={Wind} disabled disabledReason={orgCopy.dashboard.windWaiting}>
        {orgCopy.dashboard.windButton}
      </Button>
    </OrgCard>
  );
}

/** Hold, Resume, Shift, the head judge console, the big screen and Reset. Each says why when it cannot run. */
export function QuickActions({ runningHeat, held, onHold, onResume }: { runningHeat: string; held: boolean; onHold: () => void; onResume: () => void }) {
  const laptop = useShellLayout() === "laptop";
  return (
    <OrgCard title={orgCopy.dashboard.actionsTitle} testId="quick-actions">
      <div className={cn("grid items-start gap-2", laptop ? "grid-cols-2" : "grid-cols-1")}>
        {held ? (
          <Button variant="secondary" icon={Pause} disabled disabledReason={orgCopy.dashboard.alreadyHeld}>
            {orgCopy.dashboard.hold}
          </Button>
        ) : (
          <Button variant="secondary" icon={Pause} onClick={onHold}>
            {orgCopy.dashboard.hold}
          </Button>
        )}
        {held ? (
          <Button variant="secondary" icon={Play} onClick={onResume}>
            {orgCopy.dashboard.resume}
          </Button>
        ) : (
          <Button variant="secondary" icon={Play} disabled disabledReason={orgCopy.dashboard.notHeld}>
            {orgCopy.dashboard.resume}
          </Button>
        )}
        <Button variant="secondary" icon={SkipForward}>
          {orgCopy.dashboard.shift(5)}
        </Button>
        <Button variant="secondary" icon={SkipForward}>
          {orgCopy.dashboard.shift(10)}
        </Button>
        <Button variant="primary" icon={ExternalLink} href="#head-judge">
          {orgCopy.dashboard.headConsole}
        </Button>
        <Button variant="secondary" icon={Monitor} disabled disabledReason={orgCopy.dashboard.bigScreenWaiting}>
          {orgCopy.dashboard.bigScreen}
        </Button>
      </div>
      <div className="mt-3 border-t border-beach-line pt-3">
        <Button variant="danger" icon={RotateCcw} disabled disabledReason={orgCopy.dashboard.resetRefused(runningHeat)}>
          {orgCopy.dashboard.reset}
        </Button>
      </div>
    </OrgCard>
  );
}

/** A link to share: the address, Copy and Open. */
export function ShareCard({ title, note, url, testId }: { title: string; note: string; url: string; testId: string }) {
  return (
    <OrgCard title={title} testId={testId}>
      <p className="text-small font-medium text-beach-muted">{note}</p>
      <p className="my-2 break-all text-body font-semibold">{url}</p>
      <div className="flex flex-wrap gap-2">
        <CopyLinkButton url={url} />
        <Button variant="quiet" icon={ExternalLink} href={url}>
          {orgCopy.shell.openLink}
        </Button>
      </div>
    </OrgCard>
  );
}

export function PrintCardsButton() {
  return (
    <Button variant="quiet" icon={Printer}>
      {orgCopy.dashboard.printCards}
    </Button>
  );
}

/** Today's timetable, compact: the same dense table as everywhere else. */
export function TimetableCard({ rows }: { rows: readonly RunOrderRow[] }) {
  return (
    <OrgCard title={orgCopy.dashboard.timetableTitle} testId="dashboard-timetable">
      <div className="-m-4">
        <DataTable
          bare
          caption={orgCopy.dashboard.timetableTitle}
          rows={rows}
          getId={(r) => r.start}
          columns={[
            { id: "start", header: orgCopy.dashboard.colStart, align: "end", render: (r) => r.start },
            { id: "heat", header: orgCopy.dashboard.colHeat, render: (r) => r.label },
            { id: "end", header: orgCopy.dashboard.colEnd, align: "end", render: (r) => r.end },
            { id: "len", header: orgCopy.dashboard.colLength, align: "end", render: (r) => r.lengthMin },
          ]}
        />
      </div>
    </OrgCard>
  );
}
