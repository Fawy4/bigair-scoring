"use client";

import { useState } from "react";
import { SEEN_WITHIN_MS, type SideData } from "./head-side-panel";
import type { LiveHeatState } from "./use-live-heat";
import { headSetImpression, headSetScore } from "@/lib/live/head-actions";
import { heatEndedAtMs, judgesWithLines, noOpenWork, openFlagsOf, spotterStillLogging, type OpenWork } from "@/lib/live/heat-end";
import { sheetSubmitted } from "@/lib/live/head-model";
import type { JudgeImpressions } from "@/lib/live/impression-status";
import type { ChecklistItem, FixTarget } from "@/lib/live/publish-checklist";
import { reviewBarState, type BarJudge } from "@/lib/live/review-bar";
import type { ScoringModel } from "@/lib/schemas/scoring-model";
import { ABSENT_REASON } from "@/lib/live/sheet-rule";
import type { HeatRow } from "@/lib/live/types";

/**
 * What the review bar and the Impression card need, shared by the laptop console and the phone: the bar's state from the Publish blockers and the judges'
 * sheets, "open that judge's sheet", "mark Absent" straight from the bar, and the Impression scale's own outlier tolerance.
 */
export function useReview(i: {
  heat: HeatRow;
  model: ScoringModel;
  side: SideData;
  live: LiveHeatState;
  impressions: JudgeImpressions[];
  blockerItems: ChecklistItem[];
  closing: boolean;
  nowServer: number;
  judgeWord: (seatId: string) => string;
  onChanged: () => void;
  /** Open the place a blocker is fixed (a cell, an Impression / Variety score, or the judge). */
  openFix: (target: FixTarget) => void;
  /** Open one judge's Impression / Variety sheet at a rider. */
  openSheetDialog: (seatId: string, entryId: string) => void;
}) {
  const [barPending, setBarPending] = useState(false);
  const [barError, setBarError] = useState<string | null>(null);
  const judges: BarJudge[] = i.side.judges.map((j) => {
    const seat = i.side.seats.find((x) => x.id === j.id);
    const seen = seat?.last_seen_at ? i.nowServer - Date.parse(seat.last_seen_at) : null;
    return { id: j.id, word: i.judgeWord(j.id), live: seen !== null && seen <= SEEN_WITHIN_MS, submitted: sheetSubmitted(i.live.sheets.find((s) => s.judge_seat_id === j.id)) };
  });
  // HE1: who is still working once the heat has ended, and the judges' flags that are open
  const spotterIds = new Set(i.side.spotters.map((x) => x.id));
  const work: OpenWork = i.closing
    ? {
        spotter: spotterStillLogging({
          endedAtMs: heatEndedAtMs(i.heat),
          nowMs: i.nowServer,
          attempts: i.live.attempts.filter((a) => a.heat_id === i.heat.id && a.created_by_seat !== null && spotterIds.has(a.created_by_seat)),
          spotterSeenMsAgo: i.side.spotters.map((x) => (x.last_seen_at ? i.nowServer - Date.parse(x.last_seen_at) : null)),
          seenWithinMs: SEEN_WITHIN_MS,
        }),
        judges: judgesWithLines({ panelSeatIds: i.side.judges.map((j) => j.id), attempts: i.live.attempts.filter((a) => a.heat_id === i.heat.id), scores: i.live.scores.filter((x) => x.heat_id === i.heat.id), notRiding: new Set(i.live.slots.filter((x) => x.heat_id === i.heat.id && x.modifier !== null && x.entry_id).map((x) => x.entry_id as string)) }),
        flags: openFlagsOf(i.live.flags, i.live.attempts, i.heat.id),
      }
    : noOpenWork;
  const bar = reviewBarState({ status: i.heat.status, judges, items: i.blockerItems, work });
  const scale = i.model.heat.impression?.scale;

  const openSheet = (seatId: string) => {
    const mine = i.impressions.find((j) => j.seatId === seatId);
    if (scale && mine) i.openSheetDialog(seatId, mine.cells.find((x) => x.state === "missing")?.entryId ?? mine.cells[0]?.entryId ?? "");
    else i.openFix(i.blockerItems.find((b) => b.judge === seatId && b.target)?.target ?? { kind: "sheet", seatId });
  };
  /** Absent, straight from the bar: the same action as the Absent button of the cell and sheet dialogs (the judge is marked absent for that one score). */
  const markAbsent = async (item: ChecklistItem) => {
    const t = item.target;
    if (!t) return;
    setBarPending(true);
    setBarError(null);
    try {
      const r = t.kind === "score" ? await headSetScore({ attemptId: t.attemptId, seatId: t.seatId, missed: true, reason: ABSENT_REASON }) : t.kind === "sheet" ? { ok: true as const } : await headSetImpression({ heatId: i.heat.id, entryId: t.entryId, seatId: t.seatId, value: null, missed: true, reason: ABSENT_REASON });
      if (!r.ok) setBarError(r.message);
      i.onChanged();
    } finally {
      setBarPending(false);
    }
  };
  return {
    bar,
    work,
    barPending,
    barError,
    openSheet,
    markAbsent,
    showImpressionCard: Boolean(scale) && (i.closing || i.heat.status === "published"),
    impressionTolerance: scale ? (i.model.panel.outlierWarnPct / 100) * (scale.max - scale.min) : 1,
  };
}
