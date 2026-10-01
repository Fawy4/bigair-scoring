"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Chip } from "./chip";
import { Pill } from "./pill";
import type { LiveHeatState } from "./use-live-heat";
import { auditLine, type AuditRow } from "@/lib/live/audit-lines";
import { resolveFlag } from "@/lib/live/head-actions";
import { sheetSubmitted, type HeadModel } from "@/lib/live/head-model";
import type { HeatRow } from "@/lib/live/types";
import { copy } from "@/lib/ui-copy";

const H = copy.headLive;
const SEEN_WITHIN_MS = 45_000;

interface SeatInfo {
  id: string;
  name: string;
  last_seen_at: string | null;
}

/**
 * The right column of the head judge's console (docs/PLAN-phase-5 step 4): which judges are connected (seen within 45 seconds) and who has submitted, the open
 * flags with Resolve, how fast attempts are coming in, the agreement report once the heat has ended, and this heat's audit log in words.
 * `refreshKey` changes after every action so the audit log shows it at once.
 */
export function HeadSidePanel({ supabase, eventId, heat, live, head, wordFor, nowServer, refreshKey, onChanged }: { supabase: SupabaseClient; eventId: string; heat: HeatRow; live: LiveHeatState; head: HeadModel; wordFor: (entryId: string) => string; nowServer: number; refreshKey: number; onChanged: () => void }) {
  const [seats, setSeats] = useState<SeatInfo[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [pending, start] = useTransition();
  const panel = head.matrix.judgeIds;

  const loadSeats = useCallback(async () => {
    const { data } = await supabase.from("judge_seats").select("id, name, last_seen_at").in("id", panel);
    if (data) setSeats(data as SeatInfo[]);
  }, [supabase, panel]);
  const loadAudit = useCallback(async () => {
    const { data } = await supabase
      .from("audit_log")
      .select("id, action, reason, at, before, after")
      .eq("event_id", eventId)
      .or(`after->>heat_id.eq.${heat.id},before->>heat_id.eq.${heat.id},row_id.eq.${heat.id}`)
      .order("at", { ascending: false })
      .limit(40);
    if (data) setAudit(data as unknown as AuditRow[]);
  }, [supabase, eventId, heat.id]);

  useEffect(() => {
    void loadSeats();
    const t = setInterval(() => void loadSeats(), 10_000);
    return () => clearInterval(t);
  }, [loadSeats]);
  useEffect(() => {
    void loadAudit();
    const t = setInterval(() => void loadAudit(), 8_000);
    return () => clearInterval(t);
  }, [loadAudit, refreshKey]);

  const judgeNo = (seatId: string) => panel.indexOf(seatId) + 1;
  const attemptWord = (attemptId: string) => {
    const row = head.matrix.rows.find((r) => r.attemptId === attemptId);
    return row ? H.attemptWord(wordFor(row.riderKey), row.seq) : "";
  };
  const open = live.flags.filter((f) => !f.resolved_at && f.heat_id === heat.id);
  const startedMs = heat.started_at ? Date.parse(heat.started_at) : null;
  const logged = live.attempts.filter((a) => !a.deleted_at).length;
  const minutes = startedMs ? Math.max(1, Math.min((nowServer - startedMs) / 60_000, heat.duration_sec / 60)) : null;
  const ended = heat.status !== "scheduled" && heat.status !== "running" && heat.status !== "paused";

  return (
    <aside data-testid="head-side" className="flex flex-col gap-2">
      <section data-testid="judges" className="flex flex-col gap-1 rounded-card border border-beach-line bg-beach-surface p-2" aria-label={H.judgesHeading}>
        <h3 className="text-heading font-semibold text-beach-muted">{H.judgesHeading}</h3>
        {panel.map((id) => {
          const seat = seats.find((s) => s.id === id);
          const seen = seat?.last_seen_at ? nowServer - Date.parse(seat.last_seen_at) : null;
          const liveNow = seen !== null && seen <= SEEN_WITHIN_MS;
          const sheet = live.sheets.find((s) => s.judge_seat_id === id);
          return (
            <div key={id} data-testid="judge-row" data-live={liveNow} className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-body font-semibold">
                {copy.live.matrix.judge(judgeNo(id))}
                {seat?.name ? <span className="font-medium text-beach-muted"> · {seat.name}</span> : null}
              </span>
              <span className="flex flex-wrap items-center gap-1">
                <Pill tone={liveNow ? "live" : "missing"}>{liveNow ? H.judgeLive : seen === null ? H.judgeNever : H.judgeAway(Math.round(seen / 1000))}</Pill>
                {ended ? <Pill tone={sheetSubmitted(sheet) ? "live" : "pending"}>{sheetSubmitted(sheet) ? H.judgeSubmitted : H.judgeWaiting}</Pill> : null}
              </span>
            </div>
          );
        })}
      </section>

      <section data-testid="flags" className="flex flex-col gap-1 rounded-card border border-beach-line bg-beach-surface p-2" aria-label={H.flagsHeading}>
        <h3 className="text-heading font-semibold text-beach-muted">{H.flagsHeading}</h3>
        {open.length === 0 ? <p className="text-small font-medium text-beach-muted">{H.flagsNone}</p> : null}
        {open.map((f) => (
          <div key={f.id} data-testid="flag-row" className="flex items-center justify-between gap-2">
            <span className="text-body font-medium">{H.flagLine(copy.live.matrix.judge(judgeNo(f.judge_seat_id)), H.flagKinds[f.kind] ?? f.kind, attemptWord(f.attempt_id))}</span>
            <Chip
              data-testid="resolve-flag"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await resolveFlag(f.id, "");
                  onChanged();
                })
              }
            >
              {H.resolve}
            </Chip>
          </div>
        ))}
      </section>

      {minutes !== null && logged > 0 ? (
        <p data-testid="rate" className="text-small font-medium text-beach-muted">
          {H.rate((logged / minutes).toFixed(1))}
        </p>
      ) : null}

      <section data-testid="agreement" className="flex flex-col gap-1 rounded-card border border-beach-line bg-beach-surface p-2" aria-label={H.agreementHeading}>
        <h3 className="text-heading font-semibold text-beach-muted">{H.agreementHeading}</h3>
        {ended ? (
          head.agreement.map((a) => (
            <p key={a.judgeId} className="text-small font-medium">
              {H.agreementLine(copy.live.matrix.judge(judgeNo(a.judgeId)), a.meanDistance.toFixed(2), a.outliers)}
            </p>
          ))
        ) : (
          <p className="text-small font-medium text-beach-muted">{H.agreementWait}</p>
        )}
      </section>

      <section data-testid="audit" className="flex flex-col gap-1 rounded-card border border-beach-line bg-beach-surface p-2" aria-label={copy.audit.heading}>
        <h3 className="text-heading font-semibold text-beach-muted">{copy.audit.heading}</h3>
        {audit.length === 0 ? <p className="text-small font-medium text-beach-muted">{copy.audit.empty}</p> : null}
        {audit.map((a) => (
          <p key={a.id} data-testid="audit-line" data-action={a.action} className="text-small font-medium">
            {auditLine(a, { judgeNo, riderWord: wordFor, attemptWord })}
          </p>
        ))}
      </section>
    </aside>
  );
}
