"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AttemptLogger, enabledIdsOf, type LoggedAttempt } from "./attempt-logger";
import { ImpressionCard } from "./impression-card";
import { JudgeQueueView, type FlagKind, type JudgeCard } from "./judge-queue";
import { useEndAtZero, useOnline, useTimerSound, useWakeLock } from "./live-hooks";
import { LiveShell, ScreenSettings, useLiveSettings } from "./live-shell";
import { ScreenHeader } from "./screen-header";
import { useLiveHeat } from "./use-live-heat";
import { useSendQueue } from "./use-send-queue";
import { useServerClock, useTick } from "./use-server-clock";
import { SeatHeartbeat } from "@/app/seat/heartbeat";
import { Chip } from "./chip";
import { heatSummary } from "@/lib/engine/scoring";
import { criteriaRows, criteriaScore } from "@/lib/live/criteria";
import type { ImpressionRider } from "@/lib/live/design-fixtures";
import { errorSentence } from "@/lib/live/errors";
import { buildJudgeItems, type LiveAttemptRow, type MyScoreRow } from "@/lib/live/judge-items";
import { formatCell } from "@/lib/live/matrix-model";
import { myCountedSeqs, type MyScoreEntry } from "@/lib/live/my-sheet";
import { nextHeat } from "@/lib/live/next-heat";
import { pendingFlags, pendingImpressions, pendingScores } from "@/lib/live/pending";
import { activePlanFor, heatTitle, livesFor, timetableOptions } from "@/lib/live/run-order";
import { attemptCounts, ridersForHeat, trickKit } from "@/lib/live/screen-model";
import { formatPadValue } from "@/lib/live/score-pad";
import { remainingMs } from "@/lib/live/timer";
import type { LiveContext } from "@/lib/live/types";
import type { RiderSheetModel } from "@/lib/live/view-types";
import { createClient } from "@/lib/supabase/browser";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const T = copy.judge;

export function JudgeRoot({ ctx, pinnedHeatId }: { ctx: LiveContext; pinnedHeatId?: string | null }) {
  return (
    <LiveShell>
      <JudgeScreen ctx={ctx} pinnedHeatId={pinnedHeatId} />
    </LiveShell>
  );
}

/** Waits (up to `ms`) until nothing of ours is left on the phone, so Submit never runs ahead of a score still being sent. */
async function drained(q: ReturnType<typeof useSendQueue>["queue"], ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  for (;;) {
    await q.flush();
    const c = q.counts();
    if (c.pending === 0 && c.failed === 0) return true;
    if (Date.now() > until) return false;
    await new Promise((r) => setTimeout(r, 400));
  }
}

/**
 * The judge's phone (docs/PLAN-phase-5 step 3). While the heat runs it is the scoring queue; when time is up it opens the Impression / Variety step with the
 * compact summary card and Submit. Submit asks once and locks the sheet; "Ask the head judge to reopen". Also used as the Score tab of a head judge who scores.
 */
export function JudgeScreen({ ctx, pinnedHeatId }: { ctx: LiveContext; pinnedHeatId?: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const clock = useServerClock(supabase);
  const nowServer = useTick(clock.now);
  const online = useOnline();
  const settings = useLiveSettings();
  const live = useLiveHeat(supabase, ctx, nowServer, pinnedHeatId);
  const viewer = ctx.viewer.kind === "seat" ? ctx.viewer : null;
  const seatId = viewer?.seatId ?? "";
  const q = useSendQueue(supabase, clock.now, `judge-${ctx.event.id}-${seatId}`, online && live.connected, (kind, row) => {
    const key = kind === "attempt" ? "attempts" : kind === "trick_score" ? "scores" : kind === "impression" ? "impressions" : "flags";
    live.apply(key, row as never);
  });
  const [saved, setSaved] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<Set<string | number>>(new Set());
  const [tab, setTab] = useState<"impression" | "review">("impression");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedLocal, setSubmittedLocal] = useState<Set<string>>(new Set());
  const [notices, setNotices] = useState<Array<{ key: string; text: string }>>([]);
  const [logFor, setLogFor] = useState<string | null>(null);

  const heat = live.heat;
  const division = ctx.divisions.find((d) => d.id === heat?.division_id);
  const model = division?.model;
  const scale = useMemo(() => model?.trick.scale ?? { min: 0, max: 10, step: 0.1 }, [model]);
  const entry = model?.trick.entry ?? "single";
  const impression = model?.heat.impression ?? null;
  const max = division?.maxAttempts ?? null;
  const kit = useMemo(() => trickKit(ctx), [ctx]);

  const timing = heat ? { status: heat.status, durationSec: heat.duration_sec, startedAt: heat.started_at, pausedAt: heat.paused_at, pausedTotalSec: heat.paused_total_sec } : null;
  const remaining = timing ? remainingMs(timing, nowServer) : 0;
  const ended = Boolean(heat) && live.phase === "ended";
  useEndAtZero(supabase, heat?.id ?? null, Boolean(heat) && heat?.status === "running" && remaining <= 0, heat?.status);
  useTimerSound(remaining, live.phase === "running", settings.soundOn);
  useWakeLock(live.phase === "running" || live.phase === "paused");

  const heatRiders = useMemo(() => ridersForHeat(ctx, division, live.slots), [ctx, division, live.slots]);
  const riding = heatRiders.filter((r) => r.riding);
  const labelOf = (entryId: string) => heatRiders.find((r) => r.entryId === entryId)?.label;

  // ---- my scores: the server's, then whatever is still waiting on the phone
  const pendScores = useMemo(() => pendingScores(q.items), [q.items]);
  const pendImp = useMemo(() => pendingImpressions(q.items), [q.items]);
  const pendFlag = useMemo(() => pendingFlags(q.items), [q.items]);
  const mineRows = useMemo<MyScoreRow[]>(() => {
    const server = live.scores.filter((s) => s.judge_seat_id === seatId).map((s) => ({ attemptId: s.attempt_id, score: s.score === null ? null : Number(s.score), missed: s.missed }));
    const merged = new Map(server.map((r) => [r.attemptId, r]));
    for (const [id, p] of pendScores) merged.set(id, { attemptId: id, score: p.score, missed: p.missed });
    return [...merged.values()];
  }, [live.scores, seatId, pendScores]);
  const criteriaOf = useMemo(() => new Map(live.scores.filter((s) => s.judge_seat_id === seatId).map((s) => [s.attempt_id, (s.criteria ?? null) as Record<string, number> | null])), [live.scores, seatId]);

  const attemptRows = useMemo<LiveAttemptRow[]>(
    () => live.attempts.map((a) => ({ id: a.id, entryId: a.entry_id, seq: a.seq, status: a.status, trickName: a.trick_name, direction: a.direction, createdAt: a.created_at, deletedAt: a.deleted_at })),
    [live.attempts],
  );
  const writeScore = useCallback((n: number) => formatPadValue(n, scale), [scale]);
  const cards = useMemo<JudgeCard[]>(
    () =>
      buildJudgeItems(attemptRows, mineRows, writeScore).flatMap((i) => {
        const label = labelOf(i.entryId);
        return label ? [{ ...i, label, criteria: criteriaOf.get(String(i.id)) ?? null, pending: pendScores.has(String(i.id)) }] : [];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attemptRows, mineRows, writeScore, heatRiders, criteriaOf, pendScores],
  );

  const serverFlags = useMemo(() => new Set<string | number>(live.flags.filter((f) => f.judge_seat_id === seatId).map((f) => f.attempt_id)), [live.flags, seatId]);
  const flaggedIds = useMemo(() => new Set<string | number>([...flagged, ...serverFlags, ...pendFlag]), [flagged, serverFlags, pendFlag]);

  const sheetRow = live.sheets.find((s) => s.judge_seat_id === seatId);
  const serverSubmitted = Boolean(sheetRow?.submitted_at && (!sheetRow.reopened_at || sheetRow.submitted_at > sheetRow.reopened_at));
  const reopened = Boolean(sheetRow?.reopened_at && (!sheetRow.submitted_at || sheetRow.reopened_at >= sheetRow.submitted_at));
  const submitted = serverSubmitted || (heat ? submittedLocal.has(heat.id) && !reopened : false);
  const inReview = heat?.status === "under_review" || heat?.status === "published";
  const lockedMessage = submitted ? T.locked : inReview && !reopened ? T.reviewLocked : null;

  // refusals the server made for good (a locked sheet, a heat that is not open): say it once
  useEffect(() => {
    const refused = q.items.filter((i) => i.state === "refused");
    if (!refused.length) return;
    setNotices((n) => [...n, ...refused.map((i) => ({ key: i.clientKey, text: errorSentence(i.code ?? i.message) }))]);
    for (const i of refused) q.queue.clearRefused(i.clientKey);
  }, [q.items, q.queue]);

  // ---- what the judge does
  const onScore = (id: string | number, score: number | "missed", criteria?: Record<string, number>) => {
    const card = cards.find((c) => c.id === id);
    q.enqueue("trick_score", `score:${id}`, { attemptId: id, score: score === "missed" ? null : score, missed: score === "missed", criteria: criteria ?? {} });
    if (card) setSaved(score === "missed" ? copy.live.saved.missed(card.label.primary.text, card.seq) : copy.live.saved.line(formatPadValue(score, scale), card.label.primary.text, card.seq));
  };
  const onFlag = (id: string | number, kind: FlagKind) => {
    q.enqueue("flag", `flag:${id}:${kind}`, { attemptId: id, kind });
    setFlagged((f) => new Set(f).add(id));
  };

  // ---- the sheets behind "Details"
  const sheets = useMemo(() => {
    const out: Record<string, RiderSheetModel> = {};
    const mineEntries: Record<string, MyScoreEntry> = {};
    for (const r of mineRows) mineEntries[r.attemptId] = { score: r.score, missed: r.missed, criteria: criteriaOf.get(r.attemptId) ?? null };
    for (const r of heatRiders) {
      const mine = live.attempts.filter((a) => a.entry_id === r.entryId && !a.deleted_at).sort((a, b) => a.seq - b.seq);
      const counted = model && seatId ? myCountedSeqs(model, mine.map((a) => ({ id: a.id, seq: a.seq, status: a.status, trickName: a.trick_name, categoryKey: a.category_key, direction: a.direction })), mineEntries, seatId) : new Set<number>();
      const rows = mine.map((a) => {
        const m = mineEntries[a.id];
        return {
          id: a.id,
          seq: a.seq,
          trick: a.trick_name ?? "",
          direction: a.direction,
          status: a.status === "crashed" ? ("crashed" as const) : m ? ("landed" as const) : ("pending" as const),
          myScoreLabel: m ? (m.missed ? copy.live.queue.missedRow : m.score === null ? null : formatCell(m.score)) : null,
          counted: counted.has(a.seq),
        };
      });
      out[r.entryId] = {
        name: r.name,
        label: r.label,
        attempts: rows,
        left: mine.filter((a) => a.status === "landed" && a.direction === "left").length,
        right: mine.filter((a) => a.status === "landed" && a.direction === "right").length,
        counter: max === null ? String(mine.length) : `${mine.length} / ${max}`,
      };
    }
    return out;
  }, [heatRiders, live.attempts, mineRows, criteriaOf, model, seatId, max]);
  const counts = useMemo(() => attemptCounts(live.attempts, []), [live.attempts]);
  const liveRiders = riding.map((r) => ({ id: r.entryId, label: r.label, attempts: counts.get(r.entryId) ?? 0, max }));

  // ---- the Impression / Variety step
  const impressionRiders = useMemo<ImpressionRider[]>(() => {
    const serverMine = new Map(live.impressions.filter((i) => i.judge_seat_id === seatId).map((i) => [i.entry_id, Number(i.value)]));
    return riding.map((r) => {
      const mine = live.attempts.filter((a) => a.entry_id === r.entryId && !a.deleted_at);
      const myScores: Record<string, number | "missed" | null> = {};
      for (const m of mineRows) myScores[m.attemptId] = m.missed ? "missed" : m.score;
      const summary = heatSummary(
        mine.map((a) => ({ id: a.id, seq: a.seq, status: a.status, trickName: a.trick_name, direction: a.direction })),
        myScores,
        formatCell,
      );
      return { id: r.entryId, label: r.label, summary, initialValue: pendImp.get(r.entryId) ?? serverMine.get(r.entryId) ?? null };
    });
  }, [riding, live.attempts, live.impressions, seatId, mineRows, pendImp]);
  const impressionValues = useMemo(() => Object.fromEntries(impressionRiders.map((r) => [r.id, r.initialValue])) as Record<string, number | null>, [impressionRiders]);

  const submit = async () => {
    if (!heat) return;
    setSubmitError(null);
    if (!(await drained(q.queue, 12_000))) {
      setSubmitError(T.stillSending);
      return;
    }
    const r = await supabase.rpc("submit_sheet", { p_heat: heat.id });
    if (r.error) setSubmitError(errorSentence(r.error.message));
    else setSubmittedLocal((s) => new Set(s).add(heat.id));
  };

  // ---- between heats
  const plan = activePlanFor(live.plans, ctx.event.timezone, nowServer);
  const next = useMemo(
    () => (plan ? nextHeat(plan.plan, livesFor(ctx, live.heats, ctx.heatMeta), timetableOptions(plan, ctx.event.timezone, nowServer)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan?.id, plan?.updatedAt, live.heats, Math.floor(nowServer / 15_000)],
  );
  const nextRow = next ? ctx.heats.find((h) => h.id === next.heatId) : null;
  const nextLine = next ? (next.held ? T.nextHeld(nextRow ? heatTitle(ctx, nextRow) : next.title) : T.next(nextRow ? heatTitle(ctx, nextRow) : next.title, next.startsAt)) : null;

  const badge = q.badge;
  const timeNow = { timezone: ctx.event.timezone, nowMs: nowServer };
  const common = { seat: viewer?.name ?? "", connection: badge.status, pending: badge.pending, onRetry: () => q.queue.retryFailed(), clock: timeNow };
  const queueCommon = { seat: viewer?.name ?? "", connection: badge.status, pendingCount: badge.pending, onRetry: () => q.queue.retryFailed(), clock: timeNow };
  const noticeList =
    notices.length > 0 ? (
      <div className="flex flex-col gap-1 px-2 pt-1" data-testid="notices">
        {notices.map((n) => (
          <p key={n.key} role="alert" className="flex items-center justify-between gap-2 rounded-lg border border-beach-failed bg-beach-surface px-2 py-1 text-small font-semibold">
            <span className="min-w-0">{n.text}</span>
            <button type="button" className="min-h-tap shrink-0 rounded-lg border border-beach-border bg-beach-bg px-2" onClick={() => setNotices((l) => l.filter((x) => x.key !== n.key))}>
              {copy.spotter.dismiss}
            </button>
          </p>
        ))}
      </div>
    ) : null;

  const settingsBlock = <ScreenSettings />;

  // ---- nothing to score
  if (!heat || !division || !model) {
    return (
      <>
        <SeatHeartbeat />
        <ScreenHeader heatName={ctx.event.name} {...common} remainingMs={0} showTimer={false} />
        {noticeList}
        <div data-testid="between-heats" className="flex flex-1 flex-col items-start justify-center gap-2 px-3">
          <p className="text-name font-semibold">{T.waiting}</p>
          {nextLine ? (
            <p data-testid="next-heat" className="text-body font-semibold">
              {nextLine}
            </p>
          ) : (
            <p className="text-body font-medium text-beach-muted">{copy.spotter.noMoreHeats}</p>
          )}
        </div>
        <div className="px-2 pb-2">{settingsBlock}</div>
      </>
    );
  }

  const title = heatTitle(ctx, heat);

  // ---- the heat has ended: Impression / Variety, then Submit
  if (ended) {
    const onlyImpression = entry === "none";
    return (
      <>
        <SeatHeartbeat />
        <ScreenHeader heatName={title} {...common} remainingMs={0} timerState="ended" details={tab === "review"} detailsLabels={{ off: T.reviewTab, on: T.impressionTab }} onToggleDetails={onlyImpression ? undefined : () => setTab((t) => (t === "review" ? "impression" : "review"))} />
        {noticeList}
        {tab === "review" && !onlyImpression ? (
          <JudgeQueueView
            bare
            startDetails
            heatName={title}
            seat={viewer?.name ?? ""}
            remainingMs={0}
            items={cards}
            scale={scale}
            criteria={criteriaRows(model)}
            computeCriteria={(v) => criteriaScore(model, v)}
            onScore={onScore}
            onFlag={onFlag}
            flaggedIds={flaggedIds}
            saved={saved}
            riders={liveRiders}
            sheets={sheets}
            lockedMessage={lockedMessage}
          />
        ) : (
          <div data-testid="screen-body" className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2 py-1.5">
            {impression ? (
              <ImpressionCard
                riders={impressionRiders}
                scale={impression.scale}
                values={impressionValues}
                submitted={submitted}
                summaryParts={division.live.impressionSummary}
                error={submitError ?? (lockedMessage && !submitted ? lockedMessage : null)}
                caption={<span className="block font-semibold text-beach-ink">{saved ?? copy.live.saved.waiting}</span>}
                onChange={(id, v) => {
                  q.enqueue("impression", `imp:${heat.id}:${id}`, { heatId: heat.id, entryId: id, value: v });
                  const word = riding.find((r) => r.entryId === id)?.label.primary.text ?? "";
                  setSaved(copy.live.saved.impression(formatPadValue(v, impression.scale), word));
                }}
                onSubmit={() => void submit()}
              />
            ) : (
              <>
                <p className="text-body font-semibold">{T.nothingToScore}</p>
                <Chip variant="accent" data-testid="submit-plain" disabled={submitted} onClick={() => void submit()}>
                  {copy.live.impression.submit}
                </Chip>
                {submitError ? (
                  <p role="alert" className="text-body font-semibold">
                    {submitError}
                  </p>
                ) : null}
              </>
            )}
            {submitted && nextLine ? (
              <p data-testid="next-heat" className="text-body font-semibold">
                {nextLine}
              </p>
            ) : null}
            {settingsBlock}
          </div>
        )}
      </>
    );
  }

  // ---- the heat is running or paused: the queue
  const timerState = live.phase === "paused" ? "paused" : "running";
  if (entry === "none") {
    return (
      <>
        <SeatHeartbeat />
        <ScreenHeader heatName={title} {...common} remainingMs={remaining} timerState={timerState} />
        {noticeList}
        <div data-testid="screen-body" className="flex flex-1 flex-col gap-2 px-3 py-3">
          <p className="text-name font-semibold">{T.impressionOnly}</p>
          {settingsBlock}
        </div>
      </>
    );
  }
  const canJudgeLog = ctx.event.judgesMayLogAttempts && Boolean(kit);
  return (
    <>
      <SeatHeartbeat />
      {noticeList}
      {q.memoryOnly ? <p className="px-2 pt-1 text-small font-semibold text-beach-muted">{copy.live.queue.memoryOnly}</p> : null}
      <JudgeQueueView
        heatName={title}
        {...queueCommon}
        remainingMs={remaining}
        timerState={timerState}
        items={cards}
        scale={scale}
        criteria={criteriaRows(model)}
        computeCriteria={(v) => criteriaScore(model, v)}
        onScore={onScore}
        onFlag={onFlag}
        flaggedIds={flaggedIds}
        saved={saved}
        riders={liveRiders}
        sheets={sheets}
        lockedMessage={lockedMessage}
        settings={settingsBlock}
        detailsExtra={(riderId) =>
          canJudgeLog && live.phase === "running" ? (
            <Chip data-testid="log-for-rider" onClick={() => setLogFor(riderId)} className="self-start">
              {T.logAttempt(riding.find((r) => r.entryId === riderId)?.label.primary.text ?? "")}
            </Chip>
          ) : null
        }
      />
      {logFor && kit ? (
        <div role="dialog" aria-label={T.logAttempt("")} data-testid="judge-logger" className={cn("absolute inset-0 z-20 flex flex-col bg-beach-bg")}>
          <div className="flex items-center justify-end border-b border-beach-line px-2 py-1">
            <Chip onClick={() => setLogFor(null)}>{T.closeLogger}</Chip>
          </div>
          <AttemptLogger
            riders={liveRiders.filter((r) => r.id === logFor)}
            vocab={kit.vocab}
            view={kit.viewFor(division)}
            enabledIds={enabledIdsOf(kit.viewFor(division))}
            canLog={live.phase === "running"}
            disabledNote={copy.spotter.notRunning}
            onLog={(riderId: string, a: LoggedAttempt) => {
              const key = q.uuid();
              q.enqueue("attempt", key, { heatId: heat.id, entryId: riderId, status: a.status, trickName: a.trickName, direction: a.direction, categoryKey: a.categoryKey, trickParts: a.trickParts, inputMethod: a.inputMethod, rawText: a.rawText, needsReview: Boolean(a.trickParts.needsReview) }, key);
              return key;
            }}
            onUndo={(key) => void q.queue.cancel(key)}
            categoryLabelOf={(k) => (k ? (copy.trickBase.categoryLabels[k] ?? k) : "")}
          />
        </div>
      ) : null}
    </>
  );
}
