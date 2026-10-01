"use client";

import { useEffect, useMemo, useState } from "react";
import { AttemptLogger, enabledIdsOf, type LoggedAttempt } from "./attempt-logger";
import { useOnline, useEndAtZero, useTimerSound, useWakeLock } from "./live-hooks";
import { LiveShell, ScreenSettings, useLiveSettings } from "./live-shell";
import { Pill } from "./pill";
import { ScreenHeader } from "./screen-header";
import { useLiveHeat } from "./use-live-heat";
import { useSendQueue } from "./use-send-queue";
import { useServerClock, useTick } from "./use-server-clock";
import { SeatHeartbeat } from "@/app/seat/heartbeat";
import { errorSentence, parseError } from "@/lib/live/errors";
import { pendingAttempts } from "@/lib/live/pending";
import { activePlanFor, heatTitle, livesFor, timetableOptions } from "@/lib/live/run-order";
import { nextHeat } from "@/lib/live/next-heat";
import { attemptCounts, feedLines, ridersForHeat, trickKit } from "@/lib/live/screen-model";
import { remainingMs } from "@/lib/live/timer";
import type { LiveContext } from "@/lib/live/types";
import { createClient } from "@/lib/supabase/browser";
import { copy } from "@/lib/ui-copy";

const T = copy.spotter;

export function SpotterRoot({ ctx, pinnedHeatId }: { ctx: LiveContext; pinnedHeatId?: string | null }) {
  return (
    <LiveShell>
      <SpotterScreen ctx={ctx} pinnedHeatId={pinnedHeatId} />
    </LiveShell>
  );
}

/** What the person is told when the server refused an attempt for good. */
interface Notice {
  key: string;
  text: string;
}

function SpotterScreen({ ctx, pinnedHeatId }: { ctx: LiveContext; pinnedHeatId?: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const clock = useServerClock(supabase);
  const nowServer = useTick(clock.now);
  const online = useOnline();
  const settings = useLiveSettings();
  const live = useLiveHeat(supabase, ctx, nowServer, pinnedHeatId);
  const viewer = ctx.viewer.kind === "seat" ? ctx.viewer : null;
  const seatId = viewer?.seatId ?? "organiser";
  const q = useSendQueue(supabase, clock.now, `spot-${ctx.event.id}-${seatId}`, online && live.connected, (kind, row) => kind === "attempt" && live.apply("attempts", row as never));
  const [feedOpen, setFeedOpen] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);

  const heat = live.heat;
  const division = ctx.divisions.find((d) => d.id === heat?.division_id);
  const kit = useMemo(() => trickKit(ctx), [ctx]);
  const view = useMemo(() => kit?.viewFor(division) ?? [], [kit, division]);
  const enabledIds = useMemo(() => enabledIdsOf(view), [view]);
  const riders = useMemo(() => ridersForHeat(ctx, division, live.slots).filter((r) => r.riding), [ctx, division, live.slots]);
  const pending = useMemo(() => pendingAttempts(q.items).filter((p) => p.heatId === heat?.id), [q.items, heat?.id]);
  const counts = useMemo(() => attemptCounts(live.attempts, pending), [live.attempts, pending]);
  const max = division?.maxAttempts ?? null;
  const loggerRiders = riders.map((r) => ({ id: r.entryId, label: r.label, attempts: counts.get(r.entryId) ?? 0, max }));

  const assignedIds = useMemo(() => {
    if (!viewer) return [];
    const colours = new Set(viewer.spotterColours.map((c) => c.toLowerCase()));
    return riders
      .filter((r) => viewer.spotterEntries.includes(r.entryId) || colours.has((live.slots.find((s) => s.entry_id === r.entryId)?.vest_colour ?? "").toLowerCase()))
      .map((r) => r.entryId);
  }, [viewer, riders, live.slots]);

  const remaining = heat ? remainingMs({ status: heat.status, durationSec: heat.duration_sec, startedAt: heat.started_at, pausedAt: heat.paused_at, pausedTotalSec: heat.paused_total_sec }, nowServer) : 0;
  const running = live.phase === "running";
  useEndAtZero(supabase, heat?.id ?? null, Boolean(heat) && live.phase !== "paused" && remaining <= 0 && heat?.status === "running", heat?.status);
  useTimerSound(remaining, running, settings.soundOn);
  useWakeLock(live.phase === "running" || live.phase === "paused");

  // what the server refused for good: say it once, in words, then forget it
  useEffect(() => {
    const refused = q.items.filter((i) => i.state === "refused");
    if (!refused.length) return;
    const made = refused.map((i): Notice => {
      const p = i.payload as { entryId?: string };
      const word = riders.find((r) => r.entryId === p.entryId)?.label.primary.text ?? "";
      const code = i.code ?? parseError(i.message).code ?? "";
      return { key: i.clientKey, text: code === "ATTEMPT_CAP_REACHED" ? T.refusedCap(word, max ?? 0) : T.refusedOther(word, errorSentence(code || i.message)) };
    });
    setNotices((n) => [...n, ...made]);
    for (const i of refused) q.queue.clearRefused(i.clientKey);
  }, [q.items, q.queue, riders, max]);

  const log = (riderId: string, a: LoggedAttempt): string => {
    if (!heat) return "";
    const key = q.uuid();
    q.enqueue(
      "attempt",
      key,
      { heatId: heat.id, entryId: riderId, status: a.status, trickName: a.trickName, direction: a.direction, categoryKey: a.categoryKey, trickParts: a.trickParts, inputMethod: a.inputMethod, rawText: a.rawText, needsReview: Boolean(a.trickParts.needsReview) },
      key,
    );
    return key;
  };

  const undo = async (key: string) => {
    if (q.queue.cancel(key)) return;
    let id = live.attempts.find((a) => a.client_key === key)?.id;
    if (!id) id = (await supabase.from("trick_attempts").select("id").eq("client_key", key).maybeSingle()).data?.id;
    if (!id) return;
    const r = await supabase.rpc("undo_attempt", { p_attempt: id });
    if (r.error) setNotices((n) => [...n, { key: `undo-${key}`, text: T.undoFailed(errorSentence(r.error!.message)) }]);
  };

  const plan = activePlanFor(live.plans, ctx.event.timezone, nowServer);
  const next = useMemo(
    () => (plan ? nextHeat(plan.plan, livesFor(ctx, live.heats, ctx.heatMeta), timetableOptions(plan, ctx.event.timezone, nowServer)) : null),
    // the estimate only needs to follow the heats, not every tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan?.id, plan?.updatedAt, live.heats, Math.floor(nowServer / 15_000)],
  );
  const nextHeatRow = next ? ctx.heats.find((h) => h.id === next.heatId) : null;
  const nextTitle = nextHeatRow ? heatTitle(ctx, nextHeatRow) : (next?.title ?? "");

  const badge = q.badge;
  const header = heat ? (
    <ScreenHeader
      heatName={heatTitle(ctx, heat)}
      seat={viewer?.name ?? ""}
      remainingMs={remaining}
      timerState={live.phase === "paused" ? "paused" : live.phase === "ended" || remaining <= 0 ? "ended" : "running"}
      connection={badge.status}
      pending={badge.pending}
      onRetry={() => q.queue.retryFailed()}
      details={feedOpen}
      detailsLabels={{ off: T.feed, on: T.feedOn }}
      onToggleDetails={() => setFeedOpen((v) => !v)}
    />
  ) : (
    <ScreenHeader heatName={ctx.event.name} seat={viewer?.name ?? ""} remainingMs={0} showTimer={false} connection={badge.status} pending={badge.pending} onRetry={() => q.queue.retryFailed()} details={feedOpen} detailsLabels={{ off: T.feed, on: T.feedOn }} onToggleDetails={() => setFeedOpen((v) => !v)} />
  );

  const noticeList =
    notices.length > 0 ? (
      <div className="flex flex-col gap-1 px-2 pt-1" data-testid="notices">
        {notices.map((n) => (
          <p key={n.key} role="alert" className="flex items-center justify-between gap-2 rounded-lg border border-beach-failed bg-beach-surface px-2 py-1 text-small font-semibold">
            <span className="min-w-0">{n.text}</span>
            <button type="button" className="min-h-tap shrink-0 rounded-lg border border-beach-border bg-beach-bg px-2" onClick={() => setNotices((l) => l.filter((x) => x.key !== n.key))}>
              {T.dismiss}
            </button>
          </p>
        ))}
      </div>
    ) : null;

  const feed = feedLines(live.attempts, pending);

  return (
    <>
      <SeatHeartbeat />
      {header}
      {noticeList}
      {q.memoryOnly ? <p className="px-2 pt-1 text-small font-semibold text-beach-muted">{copy.live.queue.memoryOnly}</p> : null}
      {feedOpen ? (
        <div data-testid="screen-body" className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2 py-1.5">
          <ScreenSettings />
          <h2 className="text-heading font-semibold text-beach-muted">{T.attemptsHeading}</h2>
          {feed.length === 0 ? (
            <p data-testid="feed-empty" className="text-body font-medium text-beach-muted">
              {T.feedEmpty}
            </p>
          ) : (
            <ol data-testid="feed" className="flex flex-col divide-y divide-beach-line rounded-xl border border-beach-line bg-beach-bg">
              {feed.map((l) => {
                const r = riders.find((x) => x.entryId === l.entryId);
                const word = r?.label.primary.text ?? "";
                return (
                  <li key={l.key} data-testid="feed-line" className="flex min-h-row flex-wrap items-center justify-between gap-x-2 px-2 py-0.5">
                    <span className="min-w-0 text-body font-medium">{l.seq ? T.feedLine(word, l.seq, l.trick, l.status === "landed" ? T.asLanded : T.asCrashed) : `${word} — ${l.trick || copy.live.builder.none} — ${l.status === "landed" ? T.asLanded : T.asCrashed}`}</span>
                    <span className="flex shrink-0 gap-1">
                      {l.pending ? <Pill tone="pending">{T.sending}</Pill> : null}
                      {l.duplicate ? <Pill tone="outlier">{T.duplicate}</Pill> : null}
                      {l.needsReview ? <Pill tone="missing">{T.freeTag}</Pill> : null}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      ) : heat && kit && division ? (
        <AttemptLogger
          riders={loggerRiders}
          assignedIds={assignedIds}
          vocab={kit.vocab}
          view={view}
          enabledIds={enabledIds}
          canLog={running}
          disabledNote={live.phase === "paused" ? T.paused : T.notRunning}
          onLog={log}
          onUndo={(k) => void undo(k)}
          categoryLabelOf={(k) => (k ? (copy.trickBase.categoryLabels[k] ?? k) : "")}
        />
      ) : (
        <div data-testid="between-heats" className="flex flex-1 flex-col items-start justify-center gap-2 px-3">
          <p className="text-name font-semibold">{T.waiting}</p>
          {next ? (
            <p data-testid="next-heat" className="text-body font-semibold">
              {next.held ? T.nextHeld(nextTitle) : T.next(nextTitle, next.startsAt)}
            </p>
          ) : (
            <p className="text-body font-medium text-beach-muted">{T.noMoreHeats}</p>
          )}
        </div>
      )}
    </>
  );
}
