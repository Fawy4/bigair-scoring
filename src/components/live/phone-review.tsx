"use client";

import { useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CellDialog, ImpressionDialog } from "./head-console-dialogs";
import { useSideData } from "./head-side-panel";
import { ImpressionCardBlock, ReviewBar } from "./review-kit";
import { useReview } from "./use-review";
import type { LiveHeatState } from "./use-live-heat";
import type { HeadModel } from "@/lib/live/head-model";
import { impressionStatus } from "@/lib/live/impression-status";
import { judgeWordOf } from "@/lib/live/judge-names";
import type { FixTarget } from "@/lib/live/publish-checklist";
import type { HeatRider } from "@/lib/live/screen-model";
import type { HeatRow, LiveContext, LiveDivisionContext } from "@/lib/live/types";
import { copy } from "@/lib/ui-copy";

type Open = { kind: "sheet"; seatId: string; entryId: string } | { kind: "cell"; seatId: string; attemptId: string } | null;

/**
 * The review bar and the Impression card on the head judge's phone (the Control tab): the bar directly under the heat's header, the card as a block under the heat's
 * controls, open by default in the review state. A name in the bar opens that judge's sheet; Fix opens the cell or the sheet; Absent works from the bar. The score
 * table itself is for a wider screen, so the cells of the card are how a score is corrected here.
 */
export function PhoneReview({
  ctx,
  heat,
  division,
  head,
  live,
  riders,
  wordFor,
  supabase,
  nowServer,
  refreshKey,
  closing,
  onChanged,
  onChooseOrder,
  children,
}: {
  ctx: LiveContext;
  heat: HeatRow;
  division: LiveDivisionContext;
  head: HeadModel;
  live: LiveHeatState;
  riders: HeatRider[];
  wordFor: (entryId: string) => string;
  supabase: SupabaseClient;
  nowServer: number;
  refreshKey: number;
  closing: boolean;
  onChanged: () => void;
  onChooseOrder: (riders: string[]) => void;
  /** The page draws its column with the two parts where they belong: the bar under the heat's header, the card under the heat's controls. */
  children: (parts: { bar: ReactNode; card: ReactNode }) => ReactNode;
}) {
  const side = useSideData(supabase, ctx.event.id, heat, head.matrix.judgeIds, ctx.seatNames, refreshKey, { audit: false });
  const [open, setOpen] = useState<Open>(null);
  const model = division.model;
  const judgeWord = (seatId: string) => judgeWordOf(side.judges.find((j) => j.id === seatId) ?? { name: null, tag: copy.live.matrix.aJudge });
  const impressions = impressionStatus({ panelSeatIds: head.matrix.judgeIds, slots: live.slots.filter((s) => s.heat_id === heat.id), impressions: live.impressions.filter((i) => i.heat_id === heat.id) });
  const blockerItems = closing ? head.checklist.items : [];
  const r = useReview({
    heat,
    model,
    side,
    live,
    impressions,
    blockerItems,
    closing,
    nowServer,
    judgeWord,
    onChanged,
    openFix: (t: FixTarget) => {
      if (t.kind === "score") setOpen({ kind: "cell", seatId: t.seatId, attemptId: t.attemptId });
      else if (t.kind === "impression") setOpen({ kind: "sheet", seatId: t.seatId, entryId: t.entryId });
    },
    openSheetDialog: (seatId, entryId) => setOpen({ kind: "sheet", seatId, entryId }),
  });
  const done = () => {
    setOpen(null);
    onChanged();
  };
  const row = open?.kind === "cell" ? head.matrix.rows.find((x) => x.attemptId === open.attemptId) : null;
  const bar = r.bar ? <ReviewBar state={r.bar} pending={r.barPending} error={r.barError} onSheet={r.openSheet} onFix={(t) => (t.kind === "sheet" ? r.openSheet(t.seatId) : undefined)} onAbsent={(i) => void r.markAbsent(i)} onChooseOrder={onChooseOrder} /> : null;
  const card = r.showImpressionCard ? (
        <ImpressionCardBlock judges={side.judges} impressions={impressions} riders={riders} tolerance={r.impressionTolerance} onCell={closing ? (seatId, entryId) => setOpen({ kind: "sheet", seatId, entryId }) : undefined} defaultOpen />
      ) : null;
  return (
    <>
      {children({ bar, card })}
      {open?.kind === "sheet" ? (
        <ImpressionDialog
          model={model}
          heatId={heat.id}
          seatId={open.seatId}
          judge={judgeWord(open.seatId)}
          riders={(impressions.find((j) => j.seatId === open.seatId)?.cells ?? []).map((cell) => ({ id: cell.entryId, word: wordFor(cell.entryId), now: { state: cell.state, value: cell.value } }))}
          first={open.entryId}
          onClose={() => setOpen(null)}
          onDone={done}
        />
      ) : null}
      {open?.kind === "cell" && row ? (
        <CellDialog
          key={`${open.attemptId}${open.seatId}`}
          model={model}
          attemptId={open.attemptId}
          seatId={open.seatId}
          judge={judgeWord(open.seatId)}
          who={copy.headLive.attemptWord(wordFor(row.riderKey), row.seq)}
          current={live.scores.find((s) => s.attempt_id === open.attemptId && s.judge_seat_id === open.seatId)}
          onClose={() => setOpen(null)}
          onDone={done}
        />
      ) : null}
    </>
  );
}
