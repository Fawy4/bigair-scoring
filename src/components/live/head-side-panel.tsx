"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Flag } from "lucide-react";
import { FLAG_LOOK } from "./flag-look";
import { Pill } from "./pill";
import type { LiveHeatState } from "./use-live-heat";
import { auditLine, isScoreChange, timeOfDay, type AuditRow } from "@/lib/live/audit-lines";
import { resolveFlag } from "@/lib/live/head-actions";
import type { HeadModel } from "@/lib/live/head-model";
import { openFlagsOf } from "@/lib/live/heat-end";
import { judgeNames, judgeWordOf } from "@/lib/live/judge-names";
import { watchingCount } from "@/lib/live/observer";
import type { HeatRow } from "@/lib/live/types";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const H = copy.headLive;
/** A phone says "here" every 30 s but the database stores it at most once a minute (Fix 2), so "connected" means seen within 90 s. */
export const SEEN_WITHIN_MS = 90_000;

interface SeatInfo {
  id: string;
  name: string;
  last_seen_at: string | null;
}

/**
 * What the right column of the head judge's console reads besides the heat itself: which judges are connected (seen within 45 seconds), and this heat's audit
 * log in words. The judges are named by their seat ("Fawy"); `seatNames` from the page is the first answer, the seats' own rows keep it fresh.
 * `refreshKey` changes after every action so the audit log shows it at once.
 */
export function useSideData(supabase: SupabaseClient, eventId: string, heat: HeatRow, panel: string[], seatNames: Record<string, string>, refreshKey: number, wanted: { audit: boolean }) {
  const [seats, setSeats] = useState<SeatInfo[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [observers, setObservers] = useState<Array<{ role: string; last_seen_at: string | null }>>([]);
  // the event's spotters (HE1): "Spotter still logging" needs to know whose lines are the spotters' and whether a spotter's phone is connected
  const [spotters, setSpotters] = useState<Array<{ id: string; last_seen_at: string | null }>>([]);

  const loadSeats = useCallback(async () => {
    if (panel.length === 0) return;
    const { data } = await supabase.from("judge_seats").select("id, name, last_seen_at").in("id", panel);
    if (data) setSeats(data as SeatInfo[]);
  }, [supabase, panel]);
  const loadAudit = useCallback(async () => {
    const { data } = await supabase
      .from("audit_log")
      .select("id, action, reason, at, before, after, table_name")
      .eq("event_id", eventId)
      .or(`after->>heat_id.eq.${heat.id},before->>heat_id.eq.${heat.id},row_id.eq.${heat.id}`)
      .order("at", { ascending: false })
      .limit(120);
    // only changes somebody made on purpose have a name of their own; the rest (every score a judge saves) is not worth a line here
    if (data) setAudit((data as unknown as AuditRow[]).filter((r) => !["insert", "update", "delete"].includes(r.action) || isScoreChange(r)).slice(0, 30));
  }, [supabase, eventId, heat.id]);

  // observers are never judges: they only show as "2 observers watching"
  const loadObservers = useCallback(async () => {
    const { data } = await supabase.from("judge_seats").select("role, last_seen_at").eq("event_id", eventId).eq("role", "observer").eq("active", true).eq("status", "active");
    if (data) setObservers(data as Array<{ role: string; last_seen_at: string | null }>);
  }, [supabase, eventId]);

  const loadSpotters = useCallback(async () => {
    const { data } = await supabase.from("judge_seats").select("id, last_seen_at").eq("event_id", eventId).eq("role", "spotter").eq("active", true).eq("status", "active");
    if (data) setSpotters(data as Array<{ id: string; last_seen_at: string | null }>);
  }, [supabase, eventId]);

  useEffect(() => {
    void loadSeats();
    void loadObservers();
    void loadSpotters();
    const t = setInterval(() => {
      void loadSeats();
      void loadObservers();
      void loadSpotters();
    }, 10_000);
    return () => clearInterval(t);
  }, [loadSeats, loadObservers, loadSpotters]);
  useEffect(() => {
    if (!wanted.audit) return;
    void loadAudit();
    const t = setInterval(() => void loadAudit(), 8_000);
    return () => clearInterval(t);
  }, [loadAudit, refreshKey, wanted.audit]);

  const names = { ...seatNames, ...Object.fromEntries(seats.map((s) => [s.id, s.name])) };
  return { seats, audit, observers, spotters, judges: judgeNames(panel, names) };
}
export type SideData = ReturnType<typeof useSideData>;

/** Who is connected and who has submitted, one line per judge, by the seat's name. */
export function JudgesStatus({ side, nowServer, highlight }: { side: SideData; nowServer: number; /** The judge a blocker's "Fix" pointed at. */ highlight?: string | null }) {
  const watching = watchingCount(side.observers, nowServer);
  return (
    <section data-testid="judges" className="flex flex-col gap-1 rounded-card border border-beach-line bg-beach-surface p-2" aria-label={H.judgesHeading}>
      <h3 className="text-heading font-semibold text-beach-muted">{H.judgesHeading}</h3>
      {side.judges.map((j) => {
        const seat = side.seats.find((s) => s.id === j.id);
        const seen = seat?.last_seen_at ? nowServer - Date.parse(seat.last_seen_at) : null;
        const liveNow = seen !== null && seen <= SEEN_WITHIN_MS;
        return (
          <div key={j.id} data-testid="judge-row" data-seat={j.id} data-live={liveNow} data-highlight={highlight === j.id} className={cn("flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 rounded-lg", highlight === j.id && "outline outline-2 outline-beach-accent")}>
            <span className="min-w-0 whitespace-normal break-words text-body font-semibold">
              {judgeWordOf(j)}
              {j.name ? <span className="font-medium text-beach-muted"> · {j.tag}</span> : null}
            </span>
            <span className="flex flex-wrap items-center gap-1">
              <Pill tone={liveNow ? "live" : "missing"}>{liveNow ? H.judgeLive : seen === null ? H.judgeNever : H.judgeAway(Math.round(seen / 1000))}</Pill>
              {/* who has submitted is the review bar's job now (directly under the heat header), not this pane's */}
            </span>
          </div>
        );
      })}
      {watching > 0 ? (
        <p data-testid="observers-watching" title={copy.observer.watchingHelp} className="text-small font-medium text-beach-muted">
          {copy.observer.watching(watching)}
        </p>
      ) : null}
    </section>
  );
}

/**
 * The judges' flags that nobody has resolved yet, in a box of their own (HE1): the brand's ink, filled, with a flag icon and the judge's note, and a jump to the attempt in
 * the table. Fixing the attempt resolves its flag by itself; Resolve closes a flag that needed no fix. On a narrow screen the console draws this box above the table.
 */
export function OpenFlags({ side, live, head, heat, wordFor, onChanged, onJump }: { side: SideData; live: LiveHeatState; head: HeadModel; heat: HeatRow; wordFor: (entryId: string) => string; onChanged: () => void; onJump?: (attemptId: string) => void }) {
  const [pending, start] = useTransition();
  const word = (seatId: string) => judgeWordOf(side.judges.find((j) => j.id === seatId) ?? { name: null, tag: copy.live.matrix.aJudge });
  const attemptWord = (attemptId: string) => {
    const row = head.matrix.rows.find((r) => r.attemptId === attemptId);
    return row ? H.attemptWord(wordFor(row.riderKey), row.seq) : "";
  };
  const open = openFlagsOf(live.flags, live.attempts, heat.id);
  return (
    <section data-testid="flags" data-open={open.length} className={cn("flex flex-col gap-1 rounded-card border-2 border-beach-ink bg-beach-surface p-2")} aria-label={H.flagsHeading}>
      <h3 className="flex items-center gap-1 text-heading font-semibold text-beach-ink">
        <Flag aria-hidden className="size-4 shrink-0" />
        {H.flagsHeading}
      </h3>
      {open.length === 0 ? <p className="text-small font-medium text-beach-muted">{H.flagsNone}</p> : null}
      {open.map((f) => (
        <div key={f.id} data-testid="flag-row" className={cn("flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-lg px-2 py-1", FLAG_LOOK)}>
          <span className="min-w-0 flex-1 basis-40 text-body font-semibold">
            {H.flagLine(word(f.judgeId), H.flagKinds[f.kind] ?? f.kind, attemptWord(f.attemptId))}
            {f.note ? (
              <span data-testid="flag-note" className="block font-medium">
                {copy.heatEnd.flagNote(f.note)}
              </span>
            ) : null}
          </span>
          <span className="flex flex-wrap gap-1">
            {onJump ? (
              <button type="button" data-testid="flag-jump" onClick={() => onJump(f.attemptId)} className="min-h-tap rounded-lg border-2 border-beach-bg bg-beach-bg px-2 text-small font-semibold text-beach-ink">
                {copy.heatEnd.goToAttempt}
              </button>
            ) : null}
            <button
              type="button"
              data-testid="resolve-flag"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await resolveFlag(f.id, "");
                  onChanged();
                })
              }
              className="min-h-tap rounded-lg border-2 border-beach-bg px-2 text-small font-semibold text-beach-bg disabled:opacity-60"
            >
              {H.resolve}
            </button>
          </span>
        </div>
      ))}
    </section>
  );
}

/** How far each judge is from the panel on average, once the heat has ended. */
export function AgreementReport({ side, head, heat }: { side: SideData; head: HeadModel; heat: HeatRow }) {
  const ended = heat.status !== "scheduled" && heat.status !== "running" && heat.status !== "paused";
  const word = (seatId: string) => judgeWordOf(side.judges.find((j) => j.id === seatId) ?? { name: null, tag: copy.live.matrix.aJudge });
  return (
    <section data-testid="agreement" className="flex flex-col gap-1 rounded-card border border-beach-line bg-beach-surface p-2" aria-label={H.agreementHeading}>
      <h3 className="text-heading font-semibold text-beach-muted">{H.agreementHeading}</h3>
      {ended ? (
        head.agreement.map((a) => (
          <p key={a.judgeId} className="text-small font-medium">
            {H.agreementLine(word(a.judgeId), a.meanDistance.toFixed(2), a.outliers)}
          </p>
        ))
      ) : (
        <p className="text-small font-medium text-beach-muted">{H.agreementWait}</p>
      )}
    </section>
  );
}

/** This heat's audit log, in words. */
export function AuditLog({ side, head, wordFor, nameFor, timezone }: { side: SideData; head: HeadModel; wordFor: (entryId: string) => string; nameFor?: (entryId: string) => string; timezone?: string }) {
  const word = (seatId: string) => judgeWordOf(side.judges.find((j) => j.id === seatId) ?? { name: null, tag: copy.live.matrix.aJudge });
  const attemptWord = (attemptId: string) => {
    const row = head.matrix.rows.find((r) => r.attemptId === attemptId);
    return row ? H.attemptWord(wordFor(row.riderKey), row.seq) : "";
  };
  return (
    <section data-testid="audit" className="flex flex-col gap-1 rounded-card border border-beach-line bg-beach-surface p-2" aria-label={copy.audit.heading}>
      <h3 className="text-heading font-semibold text-beach-muted">{copy.audit.heading}</h3>
      {side.audit.length === 0 ? <p className="text-small font-medium text-beach-muted">{copy.audit.empty}</p> : null}
      {side.audit.map((a) => (
        <p key={a.id} data-testid="audit-line" data-action={a.action} className="text-small font-medium">
          {auditLine(a, { judgeWord: word, riderWord: wordFor, riderName: nameFor, attemptWord, ...(timezone ? { clock: (iso: string) => timeOfDay(iso, timezone) } : {}) })}
        </p>
      ))}
    </section>
  );
}
