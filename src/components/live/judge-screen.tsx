"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AttemptLogger, enabledIdsOf, type LoggedAttempt } from "./attempt-logger";
import { HeatEndedStrip } from "./heat-ended-strip";
import { ImpressionCard } from "./impression-card";
import { JudgeQueueView, type FlagKind, type JudgeCard } from "./judge-queue";
import { useEndAtZero, useFlagHorns, useOnline, useTimerSound, useWakeLock } from "./live-hooks";
import { useFlagStrip } from "./use-flag";
import { LiveShell, useLiveSettings } from "./live-shell";
import { ScreenHeader } from "./screen-header";
import { useLiveHeat } from "./use-live-heat";
import { useSendQueue } from "./use-send-queue";
import { useServerClock, useTick } from "./use-server-clock";
import { SeatHeartbeat } from "@/app/seat/heartbeat";
import { Chip } from "./chip";
import { RiderSheetView, ViewSwitch } from "./rider-sheet";
import { heatSummary } from "@/lib/engine/scoring";
import { criteriaRows, criteriaScore } from "@/lib/live/criteria";
import { judgeViewFor, testPathOpen } from "@/lib/live/official-views";
import type { ImpressionRider } from "@/lib/live/design-fixtures";
import { errorSentence } from "@/lib/live/errors";
import { buildJudgeItems, type LiveAttemptRow, type MyScoreRow } from "@/lib/live/judge-items";
import { impressionNameOf } from "@/lib/schemas/impression-name";
import { newAttemptIds, sheetReopenedByNewAttempt } from "@/lib/live/heat-end";
import { formatCell } from "@/lib/live/matrix-model";
import { myCountedSeqs, type MyScoreEntry } from "@/lib/live/my-sheet";
import { nextHeat } from "@/lib/live/next-heat";
import { pendingFlags, pendingImpressions, pendingScores } from "@/lib/live/pending";
import { buildLines, criteriaComplete, mergeCriterion, missedSwitch, slotForLine, submitBlockLines, viewPreference, withReferences, type JudgeView, type SheetAttempt, type SheetLine, type SheetNote } from "@/lib/live/rider-sheet";
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

const safeGet = (storage: Storage, k: string): string | null => {
  try {
    return storage.getItem(k);
  } catch {
    return null;
  }
};

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
    if (kind === "line_score" || kind === "line_missed" || kind === "line_criteria") {
      // the answer to a score (or a Missed) typed on a Rider sheet line: a pending note, or (the attempt had been logged meanwhile) the score on that attempt
      const got = row as unknown as { kind: "pending" | "score"; row: { id: string } };
      live.apply(got.kind === "pending" ? "pending" : "scores", got.row as never);
      return;
    }
    const key = kind === "attempt" ? "attempts" : kind === "trick_score" ? "scores" : kind === "impression" ? "impressions" : "flags";
    live.apply(key, row as never);
  });
  // the view this device scores in: always the Rider sheet (0.24.0). The Queue is hidden code, behind lib/live/official-views.ts: only a test server (or the one switch turned
  // back on) reads the phone's own choice and draws the switch. Read after the page is up, so the server and the browser draw the same first screen.
  const [view, setView] = useState<JudgeView>("sheet");
  const [switchShown, setSwitchShown] = useState(false);
  useEffect(() => {
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      /* no storage on this page */
    }
    const opening = judgeViewFor({ stored: storage ? safeGet(storage, viewPreference.key) : null, testPath: testPathOpen(ctx.hiddenViewsTest, storage) });
    setView(opening.view);
    setSwitchShown(opening.switchShown);
  }, [ctx.hiddenViewsTest]);
  const chooseView = (v: JudgeView) => {
    setView(v);
    viewPreference.write(v, typeof window === "undefined" ? null : window.localStorage);
  };
  const [saved, setSaved] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<Set<string | number>>(new Set());
  // HE1: after the horn the judge stays on his Rider sheet; he moves to Impression himself ("Done"), and a new line sends him back to it. (The hidden Queue keeps its old
  // way: it opens on the Impression step.)
  const [chosenTab, setTab] = useState<"impression" | "review" | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedLocal, setSubmittedLocal] = useState<Set<string>>(new Set());
  const [notices, setNotices] = useState<Array<{ key: string; text: string }>>([]);
  const [logFor, setLogFor] = useState<string | null>(null);
  // attempts whose Missed this judge has just switched off: hidden at once, until the server's removal arrives
  const [unMissed, setUnMissed] = useState<Set<string>>(new Set());
  // what this judge typed ahead of the spotter, by rider and attempt number: it covers the attempt that takes it, so nothing lights up while the score is on its way
  const aheadRef = useRef(new Map<string, number | "missed">());

  const heat = live.heat;
  const division = ctx.divisions.find((d) => d.id === heat?.division_id);
  const model = division?.model;
  const scale = useMemo(() => model?.trick.scale ?? { min: 0, max: 10, step: 0.1 }, [model]);
  const entry = model?.trick.entry ?? "single";
  const impression = model?.heat.impression ?? null;
  // the refusals about the separate score use the name the event gives it (Event step)
  const impressionCtx = useMemo(() => (model && impression ? { impressionName: impressionNameOf(model) } : {}), [model, impression]);
  const max = division?.maxAttempts ?? null;
  const kit = useMemo(() => trickKit(ctx), [ctx]);

  const timing = heat ? { status: heat.status, durationSec: heat.duration_sec, startedAt: heat.started_at, pausedAt: heat.paused_at, pausedTotalSec: heat.paused_total_sec } : null;
  const remaining = timing ? remainingMs(timing, nowServer) : 0;
  const ended = Boolean(heat) && live.phase === "ended";
  useEndAtZero(supabase, heat?.id ?? null, Boolean(heat) && heat?.status === "running" && remaining <= 0, heat?.status);
  const flag = useFlagStrip(ctx, live.heats, live.plans, live.heat, nowServer);
  useTimerSound(remaining, live.phase === "running" && !flag, settings.soundOn);
  useFlagHorns(flag?.state ?? null, settings.soundOn);
  useWakeLock(live.phase === "running" || live.phase === "paused");

  const heatRiders = useMemo(() => ridersForHeat(ctx, division, live.slots), [ctx, division, live.slots]);
  const riding = heatRiders.filter((r) => r.riding);
  const labelOf = (entryId: string) => heatRiders.find((r) => r.entryId === entryId)?.label;

  // ---- my scores: the server's, then whatever is still waiting on the phone
  const pendScores = useMemo(() => pendingScores(q.items), [q.items]);
  const pendImp = useMemo(() => pendingImpressions(q.items), [q.items]);
  const pendFlag = useMemo(() => pendingFlags(q.items), [q.items]);
  const mineRows = useMemo<MyScoreRow[]>(() => {
    const server = live.scores.filter((s) => s.judge_seat_id === seatId && !(s.missed && unMissed.has(s.attempt_id))).map((s) => ({ attemptId: s.attempt_id, score: s.score === null ? null : Number(s.score), missed: s.missed }));
    const merged = new Map(server.map((r) => [r.attemptId, r]));
    for (const [id, p] of pendScores) merged.set(id, { attemptId: id, score: p.score, missed: p.missed });
    return [...merged.values()];
  }, [live.scores, seatId, pendScores, unMissed]);
  const criteriaOf = useMemo(() => new Map(live.scores.filter((s) => s.judge_seat_id === seatId).map((s) => [s.attempt_id, (s.criteria ?? null) as Record<string, number> | null])), [live.scores, seatId]);
  // a division scored by criteria: the criteria in the division's order (one box each on a Rider sheet line)
  const critRows = useMemo(() => (model ? criteriaRows(model) : null), [model]);
  const critKeys = useMemo(() => (critRows ?? []).map((c) => c.key), [critRows]);
  // boxes typed on a line that is not complete yet wait on this phone (kept across a reload), by heat, rider and attempt number
  const draftStore = `bigair.critDraft.${ctx.event.id}.${seatId}`;
  const [drafts, setDrafts] = useState<Record<string, Record<string, number>>>({});
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftStore);
      if (raw) setDrafts(JSON.parse(raw) as Record<string, Record<string, number>>);
    } catch {
      /* no storage, or nothing kept */
    }
  }, [draftStore]);
  const setDraft = (heatId: string, entryId: string, slot: number, values: Record<string, number> | null) => {
    setDrafts((d) => {
      const k = `${heatId}:${entryId}:${slot}`;
      const next = { ...d };
      if (values && Object.keys(values).length) next[k] = values;
      else delete next[k];
      try {
        window.localStorage.setItem(draftStore, JSON.stringify(next));
      } catch {
        /* the boxes still work until the page closes */
      }
      return next;
    });
  };
  // what is typed ahead of the spotter keeps its criteria too, so the boxes stay filled when the attempt arrives and the note turns into the score
  const aheadCritRef = useRef(new Map<string, Record<string, number>>());
  const sheetCriteriaOf = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const [id, c] of criteriaOf) if (c && Object.keys(c).length) m.set(id, c);
    for (const [id, p] of pendScores) if (p.criteria) m.set(id, p.criteria);
    return m;
  }, [criteriaOf, pendScores]);

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
  // HE1: a line logged after this judge submitted reopens his sheet for it ("New attempt to score"); he goes back to his lines to score it
  const reopenedByLine = !submitted && sheetReopenedByNewAttempt(sheetRow);
  const freshIds = useMemo(
    () => (reopenedByLine ? newAttemptIds({ attempts: live.attempts, submittedAtMs: sheetRow?.submitted_at ? Date.parse(sheetRow.submitted_at) : null, scoredIds: new Set(live.scores.filter((x) => x.judge_seat_id === seatId).map((x) => x.attempt_id)) }) : new Set<string>()),
    [reopenedByLine, live.attempts, live.scores, sheetRow?.submitted_at, seatId],
  );
  useEffect(() => {
    if (freshIds.size > 0) setTab("review");
  }, [freshIds.size]);
  // lines of riders who ride that have no score from this judge: on the Impression step they are told once, in the strip, with a way back to the sheet
  const owedLines = useMemo(() => {
    const scored = new Set(mineRows.map((r) => r.attemptId));
    const ridingIds = new Set(riding.map((r) => r.entryId));
    return live.attempts.filter((a) => a.status === "landed" && !a.deleted_at && ridingIds.has(a.entry_id) && !scored.has(a.id)).length;
  }, [live.attempts, mineRows, riding]);

  // refusals the server made for good (a locked sheet, a heat that is not open): say it once
  useEffect(() => {
    const refused = q.items.filter((i) => i.state === "refused");
    if (!refused.length) return;
    setNotices((n) => [...n, ...refused.map((i) => ({ key: i.clientKey, text: errorSentence(i.code ?? i.message, impressionCtx) }))]);
    for (const i of refused) q.queue.clearRefused(i.clientKey);
  }, [q.items, q.queue, impressionCtx]);

  // ---- what the judge does
  const onScore = (id: string | number, score: number | "missed", criteria?: Record<string, number>) => {
    const card = cards.find((c) => c.id === id);
    q.enqueue("trick_score", `score:${id}`, { attemptId: id, score: score === "missed" ? null : score, missed: score === "missed", criteria: criteria ?? {} });
    if (card) setSaved(score === "missed" ? copy.live.saved.missed(card.label.primary.text, card.seq) : copy.live.saved.line(formatPadValue(score, scale), card.label.primary.text, card.seq));
  };
  const onFlag = (id: string | number, kind: FlagKind, note?: string) => {
    q.enqueue("flag", `flag:${id}:${kind}`, { attemptId: id, kind, ...(note ? { note } : {}) });
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

  // ---- the Rider sheet: this judge's lines for every rider (the attempts logged, and the notes typed on the empty lines)
  const myNotes = useMemo<Array<SheetNote & { entryId: string }>>(() => {
    const byKey = new Map<string, SheetNote & { entryId: string }>();
    for (const n of live.pending) if (n.judge_seat_id === seatId) byKey.set(`${n.entry_id}:${n.slot}`, { entryId: n.entry_id, seatId, slot: n.slot, score: Number(n.score), ...(n.missed ? { missed: true } : n.criteria && Object.keys(n.criteria).length ? { criteria: n.criteria } : {}) });
    // what is still waiting on the phone shows at once (and a Clear shows at once)
    for (const i of q.items) {
      if (i.state === "refused") continue;
      const pl = i.payload as { entryId: string; slot: number; score?: number; criteria?: Record<string, number> };
      if (i.kind === "line_score") byKey.set(`${pl.entryId}:${pl.slot}`, { entryId: pl.entryId, seatId, slot: pl.slot, score: Number(pl.score) });
      else if (i.kind === "line_criteria") byKey.set(`${pl.entryId}:${pl.slot}`, { entryId: pl.entryId, seatId, slot: pl.slot, score: Number(pl.score), ...(pl.criteria ? { criteria: pl.criteria } : {}) });
      else if (i.kind === "line_missed") byKey.set(`${pl.entryId}:${pl.slot}`, { entryId: pl.entryId, seatId, slot: pl.slot, score: 0, missed: true });
      else if (i.kind === "line_clear") byKey.delete(`${pl.entryId}:${pl.slot}`);
    }
    for (const n of byKey.values()) {
      aheadRef.current.set(`${n.entryId}:${n.slot}`, n.missed ? "missed" : n.score);
      if (n.criteria) aheadCritRef.current.set(`${n.entryId}:${n.slot}`, n.criteria);
      else aheadCritRef.current.delete(`${n.entryId}:${n.slot}`);
    }
    return [...byKey.values()];
  }, [live.pending, q.items, seatId]);
  const attemptsOf = useCallback(
    (entryId: string): SheetAttempt[] => live.attempts.filter((a) => a.entry_id === entryId).map((a) => ({ id: a.id, seq: a.seq, status: a.status, trickName: a.trick_name, direction: a.direction, deleted: Boolean(a.deleted_at) })),
    [live.attempts],
  );
  const sheetLines = useMemo(() => {
    const mine = new Map<string, number | "missed">();
    for (const m of mineRows) if (m.missed) mine.set(m.attemptId, "missed");
    else if (m.score !== null) mine.set(m.attemptId, m.score);
    const out: Record<string, SheetLine[]> = {};
    // a remembered note whose note has gone while no attempt took its number was cleared (by the judge or the head judge): forget it
    for (const key of [...aheadRef.current.keys()]) {
      const [entryId, slot] = key.split(":");
      const stillThere = myNotes.some((n) => n.entryId === entryId && String(n.slot) === slot);
      const taken = attemptsOf(entryId).some((a) => String(a.seq) === slot);
      if (!stillThere && !taken) {
        aheadRef.current.delete(key);
        aheadCritRef.current.delete(key);
      }
    }
    for (const r of riding) {
      const ahead = new Map<number, number | "missed">();
      for (const [key, v] of aheadRef.current) {
        const [entryId, slot] = key.split(":");
        if (entryId === r.entryId) ahead.set(Number(slot), v);
      }
      // a division scored by criteria: the boxes typed on a line that is not complete (kept on the phone), and the criteria of what was typed ahead
      const boxes = new Map<number, Record<string, number>>();
      if (critKeys.length && heat) {
        const prefix = `${heat.id}:${r.entryId}:`;
        for (const [k, v] of Object.entries(drafts)) if (k.startsWith(prefix)) boxes.set(Number(k.slice(prefix.length)), v);
        for (const [k, v] of aheadCritRef.current) {
          const [entryId, slot] = k.split(":");
          if (entryId === r.entryId) boxes.set(Number(slot), v);
        }
      }
      const built = buildLines({
        attempts: attemptsOf(r.entryId),
        notes: myNotes.filter((n) => n.entryId === r.entryId),
        cap: max,
        mine,
        ahead,
        ...(critKeys.length ? { criteriaKeys: critKeys, criteriaOf: sheetCriteriaOf, drafts: boxes } : {}),
      });
      // the reference score of a landed trick: a hint on its line (never a score, and a crash shows none)
      const marked = freshIds.size ? built.map((l) => (l.kind === "attempt" && l.attemptId && freshIds.has(l.attemptId) ? { ...l, fresh: true } : l)) : built;
      out[r.entryId] = kit ? withReferences(marked, (id) => live.attempts.find((a) => a.id === id)?.trick_parts, kit.vocab, kit.reference) : marked;
    }
    return out;
  }, [riding, attemptsOf, myNotes, max, mineRows, critKeys, sheetCriteriaOf, drafts, heat, kit, live.attempts, freshIds]);
  const onLineScore = (riderId: string, line: SheetLine, value: number) => {
    if (!heat) return;
    if (line.kind === "attempt" && line.attemptId) {
      onScore(line.attemptId, value);
      return;
    }
    if (line.kind !== "empty") return;
    const slot = line.slot ?? slotForLine(attemptsOf(riderId), line.n);
    if (slot === null) return;
    q.enqueue("line_score", `line:${riderId}:${slot}`, { heatId: heat.id, entryId: riderId, line: line.n, slot, score: value });
    setSaved(copy.live.saved.line(formatPadValue(value, scale), labelOf(riderId)?.primary.text ?? "", line.n));
  };
  /**
   * A value typed in one criterion's box of a line (a division scored by criteria). The boxes can be filled in any order; until every criterion has a value they wait on the
   * phone. The last one sends the whole line: on a line that has its attempt exactly as the Queue's Save does (the same score, the same criteria); on an empty line as the
   * judge's private note, which settles onto the attempt when the spotter logs it.
   */
  const onCriterion = (riderId: string, line: SheetLine, key: string, value: number) => {
    if (!heat || !model || !critRows) return;
    const slot = line.kind === "attempt" ? (line.seq ?? null) : (line.slot ?? slotForLine(attemptsOf(riderId), line.n));
    if (slot === null) return;
    const next = mergeCriterion(line.criteria, key, value);
    const score = criteriaComplete(critKeys, next) ? criteriaScore(model, next) : null;
    if (score === null) {
      setDraft(heat.id, riderId, slot, next);
      return;
    }
    setDraft(heat.id, riderId, slot, null);
    if (line.kind === "attempt" && line.attemptId) {
      onScore(line.attemptId, score, next);
      return;
    }
    if (line.kind !== "empty") return;
    q.enqueue("line_criteria", `line:${riderId}:${slot}`, { heatId: heat.id, entryId: riderId, line: line.n, slot, criteria: next, score });
    setSaved(copy.live.saved.line(formatPadValue(score, scale), labelOf(riderId)?.primary.text ?? "", line.n));
  };
  /** A criterion's box was emptied: on a finished line still waiting for its attempt the note is taken back (the other boxes stay as typed); on a line that is not complete the box is just emptied. */
  const onCriterionEmpty = (riderId: string, line: SheetLine, key: string) => {
    if (!heat) return;
    const slot = line.kind === "attempt" ? (line.seq ?? null) : (line.slot ?? slotForLine(attemptsOf(riderId), line.n));
    if (slot === null) return;
    if (line.kind === "attempt" && line.mine !== null) return; // a score cannot be taken away: the box shows it again
    const rest = { ...(line.criteria ?? {}) };
    delete rest[key];
    setDraft(heat.id, riderId, slot, rest);
    if (line.kind === "empty" && typeof line.pending === "number") onLineClear(riderId, line);
  };
  /**
   * A tap on a line's Missed. Missed is a switch: on a line that is not Missed it turns Missed on (the attempt's Missed, or a Missed note on a line the spotter has not
   * logged yet); on a line that is already Missed it turns it off. It counts as done and opens the next line. Typing a score on a Missed line turns it off by itself.
   */
  const onLineMissed = (riderId: string, line: SheetLine) => {
    if (!heat) return;
    if (missedSwitch(line) === "clear") {
      if (line.kind === "attempt" && line.attemptId) {
        if (line.seq !== undefined) aheadRef.current.delete(`${riderId}:${line.seq}`);
        setUnMissed((s) => new Set(s).add(line.attemptId as string));
        q.enqueue("line_missed_clear", `line:${riderId}:clear:${line.attemptId}`, { heatId: heat.id, entryId: riderId, line: line.n, attemptId: line.attemptId });
      } else if (line.kind === "empty") onLineClear(riderId, line);
      return;
    }
    if (line.kind === "attempt" && line.attemptId) {
      setUnMissed((s) => {
        if (!s.has(line.attemptId as string)) return s;
        const next = new Set(s);
        next.delete(line.attemptId as string);
        return next;
      });
      onScore(line.attemptId, "missed");
      return;
    }
    if (line.kind !== "empty") return;
    const slot = line.slot ?? slotForLine(attemptsOf(riderId), line.n);
    if (slot === null) return;
    q.enqueue("line_missed", `line:${riderId}:${slot}`, { heatId: heat.id, entryId: riderId, line: line.n, slot });
    setSaved(copy.live.saved.missed(labelOf(riderId)?.primary.text ?? "", line.n));
  };
  const onLineClear = (riderId: string, line: SheetLine) => {
    if (!heat || line.kind !== "empty") return;
    const slot = line.slot ?? slotForLine(attemptsOf(riderId), line.n);
    if (slot === null) return;
    aheadRef.current.delete(`${riderId}:${slot}`);
    const row = live.pending.find((n) => n.entry_id === riderId && n.judge_seat_id === seatId && n.slot === slot);
    if (row) live.drop("pending", row.id);
    q.enqueue("line_clear", `line:${riderId}:${slot}`, { heatId: heat.id, entryId: riderId, line: line.n, slot });
  };
  const heldLines = useMemo(() => submitBlockLines(myNotes, (id) => ({ attempts: attemptsOf(id) })), [myNotes, attemptsOf]);
  // the Rider sheet in every division (one box per criterion where the division scores by criteria); the switch and the Queue are hidden code (lib/live/official-views.ts)
  const effectiveView: JudgeView = view;
  const tab: "impression" | "review" = chosenTab ?? (effectiveView === "sheet" ? "review" : "impression");
  const switcher = switchShown ? <ViewSwitch view={effectiveView} onChange={chooseView} /> : null;
  const heldSentence = heldLines.length ? copy.riderSheet.submitHeld(heldLines.map((h) => copy.riderSheet.submitHeldPart(labelOf(h.entryId)?.primary.text ?? "", h.lines)).join("; ")) : null;

  // ---- the Impression / Variety step
  const impressionRiders = useMemo<ImpressionRider[]>(() => {
    const serverMine = new Map(live.impressions.filter((i) => i.judge_seat_id === seatId && !i.missed && i.value !== null).map((i) => [i.entry_id, Number(i.value)]));
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
    if (heldSentence) {
      setSubmitError(heldSentence);
      return;
    }
    if (!(await drained(q.queue, 12_000))) {
      setSubmitError(T.stillSending);
      return;
    }
    const r = await supabase.rpc("submit_sheet", { p_heat: heat.id });
    if (r.error) setSubmitError(errorSentence(r.error.message, impressionCtx));
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
  const common = { seat: viewer?.name ?? "", connection: badge.status, pending: badge.pending, onRetry: () => q.queue.retryFailed(), clock: timeNow, flag };
  const queueCommon = { seat: viewer?.name ?? "", connection: badge.status, pendingCount: badge.pending, onRetry: () => q.queue.retryFailed(), clock: timeNow, flag };
  const noticeList =
    notices.length > 0 ? (
      <div className="flex flex-col gap-1 px-2 pt-1" data-testid="notices">
        {notices.map((n) => (
          <p key={n.key} role="alert" className="flex items-center justify-between gap-2 rounded-lg border border-beach-failed bg-beach-surface px-2 py-1 text-small font-semibold">
            <span className="min-w-0">{n.text}</span>
            <button type="button" className="min-h-tap shrink-0 rounded-lg border border-beach-border bg-beach-fill px-2" onClick={() => setNotices((l) => l.filter((x) => x.key !== n.key))}>
              {copy.spotter.dismiss}
            </button>
          </p>
        ))}
      </div>
    ) : null;

  // ---- nothing to score
  if (!heat || !division || !model) {
    return (
      <>
        <SeatHeartbeat simEventId={ctx.event.isSimulation ? ctx.event.id : undefined} />
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
      </>
    );
  }

  const title = heatTitle(ctx, heat);

  // ---- the heat has ended: Impression / Variety, then Submit
  if (ended) {
    const onlyImpression = entry === "none";
    const scoreName = impression ? impressionNameOf(model) : null;
    const onSheet = tab === "review" && !onlyImpression;
    const E = copy.heatEnd;
    // the strip says what this judge can still do; the screen under it is the one he was on (HE1: the horn takes nothing away and locks nothing)
    const owedOnImpression = !onSheet && !onlyImpression && !submitted && owedLines > 0;
    const stripText = submitted ? E.judgeSubmitted : reopenedByLine && freshIds.size > 0 ? `${E.newAttempts(freshIds.size)} — ${E.judgeReopened}` : owedOnImpression ? E.linesOwed(owedLines) : onSheet ? E.judgeLines : E.judgeScores(scoreName);
    const done =
      onSheet && !submitted ? (
        <Chip variant="accent" data-testid="done-impression" aria-label={E.doneAria(scoreName)} onClick={() => setTab("impression")}>
          {E.done(scoreName)}
        </Chip>
      ) : owedOnImpression ? (
        <Chip variant="accent" data-testid="back-to-lines" onClick={() => setTab("review")}>
          {E.backToLines}
        </Chip>
      ) : null;
    return (
      <>
        <SeatHeartbeat simEventId={ctx.event.isSimulation ? ctx.event.id : undefined} />
        {onlyImpression || onSheet ? (
          <ScreenHeader heatName={title} {...common} remainingMs={0} timerState="ended" />
        ) : (
          <ScreenHeader heatName={title} {...common} remainingMs={0} timerState="ended" details={false} detailsLabels={{ off: E.backToLines, on: E.backToLines }} onToggleDetails={() => setTab("review")} />
        )}
        <HeatEndedStrip action={done}>{stripText}</HeatEndedStrip>
        {noticeList}
        {tab === "review" && !onlyImpression && effectiveView !== "sheet" && switcher ? <div className="px-2 pt-1.5">{switcher}</div> : null}
        {tab === "review" && !onlyImpression && effectiveView === "sheet" ? (
          <RiderSheetView
            bare
            ended
            heatName={title}
            seat={viewer?.name ?? ""}
            remainingMs={0}
            switcher={switcher}
            riders={liveRiders}
            lines={sheetLines}
            scale={scale}
            criteria={critRows}
            lockedMessage={lockedMessage}
            notice={heldSentence ? <p role="alert" data-testid="held-notes" className="rounded-card border border-beach-outlier bg-beach-bg px-2 py-1 text-body font-semibold">{heldSentence}</p> : null}
            onScore={onLineScore}
            onCriterion={onCriterion}
            onCriterionEmpty={onCriterionEmpty}
            flaggedIds={flaggedIds}
            onFlag={(id, kind, note) => onFlag(id, kind as FlagKind, note)}
            onMissed={onLineMissed}
            onClear={onLineClear}
          />
        ) : tab === "review" && !onlyImpression ? (
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
            {heldSentence ? (
              <div role="alert" data-testid="held-notes" className="flex flex-col items-start gap-1 rounded-card border border-beach-outlier bg-beach-bg px-2 py-1 text-body font-semibold">
                <span>{heldSentence}</span>
                <Chip
                  data-testid="open-rider-sheet"
                  onClick={() => {
                    chooseView("sheet");
                    setTab("review");
                  }}
                >
                  {copy.riderSheet.openSheet}
                </Chip>
              </div>
            ) : null}
            {impression ? (
              <ImpressionCard
                riders={impressionRiders}
                scale={impression.scale}
                scoreLabel={impression.label}
                values={impressionValues}
                submitted={submitted}
                summaryParts={division.live.impressionSummary}
                error={submitError ?? (lockedMessage && !submitted ? lockedMessage : null)}
                caption={<span className="block font-semibold text-beach-ink">{saved ?? copy.live.saved.waiting}</span>}
                onChange={(id, v) => {
                  q.enqueue("impression", `imp:${heat.id}:${id}`, { heatId: heat.id, entryId: id, value: v });
                  const word = riding.find((r) => r.entryId === id)?.label.primary.text ?? "";
                  setSaved(copy.live.saved.impression(formatPadValue(v, impression.scale), word, impression.label));
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
        <SeatHeartbeat simEventId={ctx.event.isSimulation ? ctx.event.id : undefined} />
        <ScreenHeader heatName={title} {...common} remainingMs={remaining} timerState={timerState} />
        {noticeList}
        <div data-testid="screen-body" className="flex flex-1 flex-col gap-2 px-3 py-3">
          <p className="text-name font-semibold">{T.impressionOnly}</p>
        </div>
      </>
    );
  }
  const canJudgeLog = ctx.event.judgesMayLogAttempts && Boolean(kit);
  return (
    <>
      <SeatHeartbeat simEventId={ctx.event.isSimulation ? ctx.event.id : undefined} />
      {noticeList}
      {q.memoryOnly ? <p className="px-2 pt-1 text-small font-semibold text-beach-muted">{copy.live.queue.memoryOnly}</p> : null}
      {effectiveView === "sheet" ? (
        <RiderSheetView
          heatName={title}
          {...queueCommon}
          remainingMs={remaining}
          timerState={timerState}
          switcher={switcher}
          riders={liveRiders}
          lines={sheetLines}
          scale={scale}
          criteria={critRows}
          lockedMessage={lockedMessage}
          extra={(riderId) =>
            canJudgeLog && live.phase === "running" ? (
              <Chip data-testid="log-for-rider" onClick={() => setLogFor(riderId)} className="self-start">
                {T.logAttempt(riding.find((r) => r.entryId === riderId)?.label.primary.text ?? "")}
              </Chip>
            ) : null
          }
          onScore={onLineScore}
          onCriterion={onCriterion}
          onCriterionEmpty={onCriterionEmpty}
          flaggedIds={flaggedIds}
          onFlag={(id, kind, note) => onFlag(id, kind as FlagKind, note)}
          onMissed={onLineMissed}
          onClear={onLineClear}
        />
      ) : (
      <JudgeQueueView
        topSlot={switcher}
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
        detailsExtra={(riderId) =>
          canJudgeLog && live.phase === "running" ? (
            <Chip data-testid="log-for-rider" onClick={() => setLogFor(riderId)} className="self-start">
              {T.logAttempt(riding.find((r) => r.entryId === riderId)?.label.primary.text ?? "")}
            </Chip>
          ) : null
        }
      />
      )}
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
