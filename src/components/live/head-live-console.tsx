"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MoreHorizontal, MoreVertical } from "lucide-react";
import { Chip } from "./chip";
import { plain } from "./console-parts";
import { AddAttemptDialog, CellDialog, ClearNoteDialog, DeleteDialog, EditAttemptDialog, FlagOutDialog, ImpressionDialog, MergeDialog, StatusDialog, WalkoverDialog } from "./head-console-dialogs";
import { TieDialog } from "./head-dialogs";
import { HeadMatrix } from "./head-matrix";
import { LearnMore } from "@/components/manual/learn-more";
import { ReviewButtons, VisibilityBox } from "./head-parts";
import { AgreementReport, AuditLog, JudgesStatus, OpenFlags, useSideData } from "./head-side-panel";
import { useReview } from "./use-review";
import { CARD_ROW_MIN } from "@/lib/live/impression-card";
import { impressionNameOf } from "@/lib/schemas/impression-name";
import { ImpressionCardInline, ReviewBar } from "./review-kit";
import { ScreenSettings } from "./live-shell";
import type { HeadController } from "./use-head-controller";
import type { LiveHeatState } from "./use-live-heat";
import { Pill } from "./pill";
import { RiderLabel } from "@/components/rider-label";
import { outlierTolerance } from "@/lib/live/cell-tone";
import { canMerge } from "@/lib/live/console-ops";
import { heatCanWalkover } from "@/lib/engine/ladder";
import { isWalkoverHeat, noRideText, type NoRideWord } from "@/lib/live/walkover";
import type { HeadModel } from "@/lib/live/head-model";
import type { FixTarget } from "@/lib/live/publish-checklist";
import { impressionStatus } from "@/lib/live/impression-status";
import { formatCell } from "@/lib/live/matrix-model";
import { judgeWordOf } from "@/lib/live/judge-names";
import { orderRows, readTableOrder, writeTableOrder, type TableOrder } from "@/lib/live/matrix-order";
import { heatTitle } from "@/lib/live/run-order";
import type { PastCapRole } from "@/lib/live/merge-plan";
import type { LiveMatrixRow } from "@/lib/live/matrix";
import type { HeatRider } from "@/lib/live/screen-model";
import type { HeatRow, LiveContext, LiveDivisionContext } from "@/lib/live/types";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const C = copy.live.console;
const H = copy.headLive;
const V = copy.headV2;
const W = copy.walkover;

type Menu = { kind: "attempt"; attemptId: string } | { kind: "rider"; entryId: string } | null;
type Dialog =
  | { kind: "cell"; attemptId: string; seatId: string }
  | { kind: "delete"; ids: string[] }
  | { kind: "merge"; ids: string[] }
  | { kind: "edit"; attemptId: string }
  | { kind: "add" }
  | { kind: "status"; entryId: string; status: "DNS" | "DNF" | "DSQ" | "INT" | "CLEAR" | "UNDO_INT" | "BACK" | "OUT"; penaltyId?: string }
  | { kind: "walkover" }
  | { kind: "impression"; seatId: string; entryId: string }
  | { kind: "tie"; riders: string[] }
  | { kind: "flagOut" }
  | { kind: "clearNote"; noteId: string; judgeId: string; entryId: string; line: number }
  | null;

const editable = (status: string) => ["running", "paused", "ended", "under_review"].includes(status);
/** The rider menu is there in every state a rider can still be marked: not started, running, ended, under review (a published heat is final until it is re-opened). */
const riderMenuOpen = (status: string) => status === "scheduled" || editable(status);

/**
 * The head judge's console for one heat on a laptop or tablet (docs/PLAN-phase-5 step 4): the live score table with each judge's cell coloured by its distance
 * from the panel score, tick boxes to merge or delete several attempts, the attempt and rider menus, who owes an Impression / Variety score, ties, and what blocks
 * Publish. Every change is a server action that asks for a reason and is written to the audit log; nothing here changes a number by itself.
 */
export function HeadLiveConsole({
  ctx,
  heat,
  division,
  live,
  riders,
  head,
  wordFor,
  onChanged,
  role,
  hasActiveHead,
  supabase,
  nowServer,
  refreshKey,
  c,
  extras,
  fixRequest,
}: {
  ctx: LiveContext;
  heat: HeatRow;
  division: LiveDivisionContext;
  live: LiveHeatState;
  riders: HeatRider[];
  head: HeadModel;
  wordFor: (entryId: string) => string;
  onChanged: () => void;
  role: PastCapRole;
  hasActiveHead: boolean;
  supabase: SupabaseClient;
  nowServer: number;
  refreshKey: number;
  /** The heat controller: the right column carries Publish, Re-open, Re-run and Cancel. */
  c: HeadController;
  /** Anything else for behind "More" (the practice panel of a simulation event). */
  extras?: React.ReactNode;
  /** A blocker's "Fix" pressed elsewhere (the Publish dialog): open that cell, that Impression / Variety score, or show that judge. `n` makes a repeat press count. */
  fixRequest?: { target: FixTarget; n: number } | null;
}) {
  const [menu, setMenu] = useState<Menu>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [order, setOrder] = useState<TableOrder>("newest");
  const [more, setMore] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  // riders taken out of the event on this screen (the rider list is read when the page loads; the next load has them from the database)
  const [justOut, setJustOut] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => setFlash(null), [heat.id]);
  useEffect(() => setOrder(readTableOrder(typeof window === "undefined" ? null : window.localStorage)), []);
  const side = useSideData(supabase, ctx.event.id, heat, head.matrix.judgeIds, ctx.seatNames, refreshKey, { audit: more });
  const judgeWord = (seatId: string) => judgeWordOf(side.judges.find((j) => j.id === seatId) ?? { name: null, tag: copy.live.matrix.aJudge });
  const chooseOrder = (next: TableOrder) => {
    setOrder(next);
    writeTableOrder(typeof window === "undefined" ? null : window.localStorage, next);
  };
  const model = division.model;
  const impressionName = impressionNameOf(model);
  const rows = head.matrix.rows;
  const tableRows = useMemo(() => orderRows(rows, order, riders.map((r) => r.entryId)), [rows, order, riders]);
  const open = editable(heat.status);
  // Impression / Variety scores open when the heat has ended: until then nothing is owed and nothing blocks Publish
  const closing = heat.status === "ended" || heat.status === "under_review";
  const owes = closing ? head.owes : [];
  const blockerItems = closing ? head.checklist.items : [];
  // each judge's Impression / Variety scores, rider by rider (Polish 2, item 5)
  const impressions = useMemo(() => impressionStatus({ panelSeatIds: head.matrix.judgeIds, slots: live.slots.filter((s) => s.heat_id === heat.id), impressions: live.impressions.filter((i) => i.heat_id === heat.id) }), [head.matrix.judgeIds, live.slots, live.impressions, heat.id]);
  const cap = model.heat.maxAttemptsPerRider;
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of live.attempts) if (!a.deleted_at && a.heat_id === heat.id) m.set(a.entry_id, (m.get(a.entry_id) ?? 0) + 1);
    return m;
  }, [live.attempts, heat.id]);

  const rowById = (id: string) => rows.find((r) => r.attemptId === id);
  const picked = rows.filter((r) => selection.includes(r.attemptId) && r.state !== "deleted");
  const riderOf = (entryId: string) => riders.find((r) => r.entryId === entryId);
  const attemptWord = (r: LiveMatrixRow) => H.attemptWord(wordFor(r.riderKey), r.seq);
  const close = () => setDialog(null);
  const openFix = (t: FixTarget) => {
    setMenu(null);
    if (t.kind === "score") setDialog({ kind: "cell", attemptId: t.attemptId, seatId: t.seatId });
    else if (t.kind === "impression") setDialog({ kind: "impression", seatId: t.seatId, entryId: t.entryId });
    else {
      setHighlight(t.seatId);
      if (typeof document !== "undefined") document.querySelector(`[data-testid="judge-row"][data-seat="${t.seatId}"]`)?.scrollIntoView({ block: "center" });
    }
  };
  useEffect(() => {
    if (fixRequest && open) openFix(fixRequest.target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixRequest?.n]);
  // ---- the review bar (from End heat until Publish) and the Impression card
  const review = useReview({
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
    openFix,
    openSheetDialog: (seatId, entryId) => setDialog({ kind: "impression", seatId, entryId }),
  });
  const { bar, barPending, barError, openSheet, markAbsent, showImpressionCard, impressionTolerance } = review;
  const done = () => {
    setDialog(null);
    setMenu(null);
    setSelection([]);
    onChanged();
  };

  const mergeable = (list: LiveMatrixRow[]) =>
    canMerge(list.map((r) => ({ id: r.attemptId, riderKey: r.riderKey, trick: r.trick })) as unknown as Parameters<typeof canMerge>[0]);

  const menuRow = menu?.kind === "attempt" ? rowById(menu.attemptId) : null;
  const menuRider = menu?.kind === "rider" ? riderOf(menu.entryId) : null;
  const slotOf = (entryId: string) => live.slots.find((s) => s.entry_id === entryId);
  const penaltyOf = (entryId: string) => live.penalties.find((p) => p.entry_id === entryId && p.type === "INT");

  const attemptItems: Array<[string, () => void, boolean]> = menuRow
    ? [
        [C.delete, () => setDialog({ kind: "delete", ids: [menuRow.attemptId] }), true],
        [C.merge, () => setDialog({ kind: "merge", ids: [menuRow.attemptId, menuRow.possibleDuplicateOf as string] }), menuRow.state === "duplicate" && Boolean(menuRow.possibleDuplicateOf)],
        [C.edit, () => setDialog({ kind: "edit", attemptId: menuRow.attemptId }), true],
        [C.add, () => setDialog({ kind: "add" }), true],
      ]
    : [];
  const status = menuRider ? slotOf(menuRider.entryId)?.modifier : null;
  const riderItems: Array<[string, () => void, boolean]> = menuRider
    ? [
        // Did not start (this heat only) or, once it is set, Back in the heat; Out of the event; then the marks of a heat that is on the water
        status === "DNS"
          ? [W.backIn, () => setDialog({ kind: "status", entryId: menuRider.entryId, status: "BACK" }), true]
          : [W.didNotStart, () => setDialog({ kind: "status", entryId: menuRider.entryId, status: "DNS" }), true],
        [W.outOfEvent, () => setDialog({ kind: "status", entryId: menuRider.entryId, status: "OUT" }), !menuRider.outOfEvent && !justOut.has(menuRider.entryId)],
        ...(open
          ? ([
              [C.dnf, () => setDialog({ kind: "status", entryId: menuRider.entryId, status: "DNF" }), true],
              [C.dsq, () => setDialog({ kind: "status", entryId: menuRider.entryId, status: "DSQ" }), true],
              [C.interference, () => setDialog({ kind: "status", entryId: menuRider.entryId, status: "INT" }), true],
            ] as Array<[string, () => void, boolean]>)
          : []),
        ...(status && status !== "DNS" ? ([[H.clearStatus, () => setDialog({ kind: "status", entryId: menuRider.entryId, status: "CLEAR" }), true]] as Array<[string, () => void, boolean]>) : []),
        ...(penaltyOf(menuRider.entryId) ? ([[H.removeInterference, () => setDialog({ kind: "status", entryId: menuRider.entryId, status: "UNDO_INT", penaltyId: penaltyOf(menuRider.entryId)!.id }), true]] as Array<[string, () => void, boolean]>) : []),
      ]
    : [];

  const flagRound = ctx.rounds.find((r) => r.id === heat.round_id);
  const showFlagOut = Boolean(division.flagOut && flagRound && division.flagOut.rounds.includes(flagRound.short_name ?? flagRound.name) && (heat.status === "running" || heat.status === "paused"));
  const title = heatTitle(ctx, heat);
  const dialogRows = (ids: string[]) => ids.flatMap((id) => (rowById(id) ? [rowById(id)!] : []));

  // a rider who did not ride says so in words, never a score (Did not start · Out of the event · Walkover)
  const walkedOver = isWalkoverHeat(heat);
  const seatsNow = live.slots.filter((s) => s.heat_id === heat.id);
  const winnerOfWalkover = walkedOver ? seatsNow.find((s) => s.entry_id && s.modifier !== "DNS")?.entry_id : undefined;
  const noRideOf = (entryId: string): NoRideWord | null => {
    if (slotOf(entryId)?.modifier === "DNS") return riderOf(entryId)?.outOfEvent || justOut.has(entryId) ? "outOfEvent" : "didNotStart";
    return walkedOver && winnerOfWalkover === entryId ? "walkover" : null;
  };
  // the one big button: exactly one rider can ride (or none) in a heat that has not started
  const armedNow = Boolean(heat.armed_at);
  const walkoverState = heat.status === "scheduled" && !armedNow ? heatCanWalkover(seatsNow.map((s) => ({ entrantId: s.entry_id, modifier: s.modifier }))) : null;
  const stripTiles = riders.map((r) => {
    const total = head.totals.find((t) => t.entryId === r.entryId);
    const slot = slotOf(r.entryId);
    return { r, total, slot };
  });

  return (
    <div data-testid="head-live-console" data-heat={heat.id} className="grid items-start gap-3 min-[1280px]:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="flex min-w-0 flex-col gap-2 min-[1280px]:col-span-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="whitespace-normal break-words text-name font-semibold">{title}</p>
          <Pill tone={heat.status === "published" ? "live" : "outlier"}>{copy.heatControl.status[heat.status] ?? heat.status}</Pill>
          {heat.reopened_at && heat.status === "under_review" ? <Pill tone="outlier">{H.underCorrection}</Pill> : null}
        </div>
        {bar ? <ReviewBar state={bar} pending={barPending} error={barError} onSheet={openSheet} onFix={openFix} onAbsent={(i) => void markAbsent(i)} onChooseOrder={(riders) => setDialog({ kind: "tie", riders })} /> : null}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        {!open ? <p className="text-small font-medium text-beach-muted">{heat.status === "published" ? C.published : ""}</p> : null}

        {walkoverState && (walkoverState.kind === "walkover" || walkoverState.kind === "nobody") ? (
          <button type="button" data-testid="walkover-button" data-kind={walkoverState.kind} onClick={() => setDialog({ kind: "walkover" })} className="flex min-h-[64px] w-full items-center justify-center rounded-card border-2 border-beach-accent bg-beach-accent px-3 py-2 text-center text-name font-bold text-beach-on-accent">
            {walkoverState.kind === "walkover" ? W.button(wordFor(walkoverState.winner)) : W.nobodyButton}
          </button>
        ) : null}
        {walkoverState?.kind === "waiting" && seatsNow.some((s) => s.entry_id && s.modifier === "DNS") ? (
          <p data-testid="walkover-waiting" className="text-small font-medium text-beach-muted">{W.waitingNote}</p>
        ) : null}
        {flash ? (
          <p data-testid="walkover-flash" role="status" className="rounded-lg border border-beach-line bg-beach-surface px-2 py-1 text-body font-semibold">
            {flash}
          </p>
        ) : null}
        {walkedOver ? <p data-testid="walkover-banner" className="rounded-lg border border-beach-live bg-beach-surface px-2 py-1 text-body font-semibold">{W.word.walkover}</p> : null}
        <section data-testid="rider-strip" aria-label={V.ridersStrip} className="flex flex-nowrap items-start gap-1.5" style={showImpressionCard ? { minHeight: CARD_ROW_MIN } : undefined}>
          {/* up to six riders share one line (the cards shrink a little before they wrap, so the table never moves); more riders wrap as before */}
          <div data-testid="rider-tiles" className={cn("flex min-w-0 flex-[0_1_auto] items-start gap-1.5", stripTiles.length <= 6 && showImpressionCard ? "flex-nowrap" : "flex-wrap")}>
          {stripTiles.map(({ r, total, slot }) => {
            const noRide = noRideOf(r.entryId);
            return (
              <div key={r.entryId} data-testid="rider-card" data-rider={r.entryId} className="flex min-w-[4.5rem] shrink flex-col rounded-card border border-beach-line bg-beach-surface">
                <button
                  type="button"
                  data-testid="rider-strip-tile"
                  data-rider={r.entryId}
                  disabled={!open}
                  aria-label={`${wordFor(r.entryId)}: ${C.riderMenu}`}
                  onClick={() => setMenu({ kind: "rider", entryId: r.entryId })}
                  className="flex min-h-tap w-full flex-col items-start gap-0.5 rounded-card px-2 py-1 text-left"
                >
                  <span className="min-w-0 whitespace-normal break-words">{<RiderLabel model={r.label} variant="live" bare />}</span>
                  <span className="flex w-full flex-wrap items-baseline justify-between gap-x-2">
                    <span data-testid="rider-strip-total" className="text-name font-semibold tabular-nums">
                      {noRide ? noRideText(noRide) : (heat.status === "scheduled" ? copy.live.result.noTotal : (total?.totalLabel ?? copy.live.result.noTotal))}
                    </span>
                    <span data-testid="rider-strip-attempts" className="text-small font-medium text-beach-muted tabular-nums">
                      {V.attemptsShort(counts.get(r.entryId) ?? 0, cap)}
                    </span>
                  </span>
                  {slot?.modifier && !noRide ? <Pill tone="outlier">{slot.modifier}</Pill> : null}
                  {noRide ? <Pill tone="outlier"><span data-testid="rider-noride">{noRideText(noRide)}</span></Pill> : null}
                </button>
                {riderMenuOpen(heat.status) ? (
                  <button
                    type="button"
                    data-testid="rider-card-menu"
                    data-rider={r.entryId}
                    aria-label={W.menuButton(wordFor(r.entryId))}
                    aria-haspopup="menu"
                    onClick={() => setMenu({ kind: "rider", entryId: r.entryId })}
                    className="flex min-h-[44px] w-full items-center justify-center rounded-b-card border-t border-beach-line text-name font-bold leading-none text-beach-ink"
                  >
                    <MoreHorizontal aria-hidden className="size-5" />
                    <span aria-hidden className="sr-only">···</span>
                  </button>
                ) : null}
              </div>
            );
          })}
          </div>
          {showImpressionCard ? <ImpressionCardInline name={impressionName} judges={side.judges} impressions={impressions} riders={riders} tolerance={impressionTolerance} onCell={open ? (seatId, entryId) => setDialog({ kind: "impression", seatId, entryId }) : undefined} /> : null}
        </section>

        {(menu?.kind === "rider" ? riderMenuOpen(heat.status) : open) && menu ? (
          <div role="menu" data-testid={menu.kind === "attempt" ? "attempt-menu" : "rider-menu"} className="flex flex-wrap items-center gap-1.5 rounded-card border border-beach-border bg-beach-surface p-1.5">
            <span className="text-small font-semibold text-beach-muted">
              {menu.kind === "attempt" && menuRow ? `${C.attemptMenu}: ${attemptWord(menuRow)}` : menuRider ? `${C.riderMenu}: ${wordFor(menuRider.entryId)}` : ""}
            </span>
            {(menu.kind === "attempt" ? attemptItems : riderItems).map(([label, run, enabled]) => (
              <button key={label} type="button" role="menuitem" disabled={!enabled} onClick={run} className={cn(plain, !enabled && "opacity-60")}>
                {label}
              </button>
            ))}
            <button type="button" onClick={() => setMenu(null)} className={plain}>
              {copy.common.close}
            </button>
          </div>
        ) : null}

        {open && picked.length > 0 ? (
          <div data-testid="selection-bar" className="flex flex-wrap items-center gap-1.5 rounded-card border border-beach-accent bg-beach-surface p-1.5">
            <span className="text-body font-semibold">{C.selected(picked.length)}</span>
            <Chip data-testid="merge-selected" variant={mergeable(picked) ? "accent" : "muted"} disabled={!mergeable(picked)} onClick={() => setDialog({ kind: "merge", ids: picked.map((r) => r.attemptId) })}>
              {C.mergeSelected}
            </Chip>
            <Chip data-testid="delete-selected" onClick={() => setDialog({ kind: "delete", ids: picked.map((r) => r.attemptId) })}>
              {C.deleteSelected}
            </Chip>
            <Chip onClick={() => setSelection([])}>{C.clearSelection}</Chip>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 text-small font-medium text-beach-muted">{open && !menu ? `${C.tap} ` : ""}{C.toleranceNote(String(outlierTolerance(model)))}</p>
          <div role="group" aria-label={V.orderToggle} className="flex gap-1.5">
            <Chip data-testid="order-newest" pressed={order === "newest"} onClick={() => chooseOrder("newest")}>
              {V.newestOnTop}
            </Chip>
            <Chip data-testid="order-rider" pressed={order === "rider"} onClick={() => chooseOrder("rider")}>
              {V.groupedByRider}
            </Chip>
          </div>
        </div>

        <HeadMatrix
          tolerance={outlierTolerance(model)}
          judges={side.judges}
          model={{ judgeIds: head.matrix.judgeIds, rows: tableRows }}
          pending={head.matrix.pending}
          pendingAfterRider={order === "rider"}
          onClearNote={open ? (row, judgeId, noteId) => setDialog({ kind: "clearNote", noteId, judgeId, entryId: row.riderKey, line: row.n }) : undefined}
          actions={
            open
              ? {
                  onCell: (r, seatId) => setDialog({ kind: "cell", attemptId: (r as LiveMatrixRow).attemptId, seatId }),
                  onAttempt: (r) => setMenu({ kind: "attempt", attemptId: (r as LiveMatrixRow).attemptId }),
                  onRider: (r) => setMenu({ kind: "rider", entryId: (r as LiveMatrixRow).riderKey }),
                  selected: selection,
                  onSelect: (r) => setSelection((all) => (all.includes((r as LiveMatrixRow).attemptId) ? all.filter((x) => x !== (r as LiveMatrixRow).attemptId) : [...all, (r as LiveMatrixRow).attemptId])),
                }
              : {}
          }
        />
        {head.matrix.pending.length > 0 ? (
          <p data-testid="pending-help" className="text-small font-medium text-beach-muted">
            {copy.live.matrix.pendingHelp}
          </p>
        ) : null}
      </div>

      <aside data-testid="head-side" className="flex min-w-0 flex-col gap-2">
        <ReviewButtons c={c} compact visibility={false} />
        <JudgesStatus side={side} nowServer={nowServer} highlight={highlight} />

        <section data-testid="blockers" className="flex flex-col gap-1 rounded-card border border-beach-line bg-beach-surface p-2" aria-label={H.blockersHeading}>
          <h3 className="text-heading font-semibold text-beach-muted">{blockerItems.length ? C.publishBlocked : H.nothingBlocks}</h3>
          {blockerItems.map((b) => (
            <div key={b.text} data-testid="blocker-line" data-kind={b.kind} className="flex items-center justify-between gap-2 rounded-lg border border-beach-outlier bg-beach-bg px-2 py-0.5">
              <span className="min-w-0 text-body font-medium">
                {b.text}
                {b.kind === "pending" ? <LearnMore href={copy.manual.href("cl-pending")} what={copy.live.matrix.pendingTitle} /> : null}
              </span>
              {open && b.target ? (
                <button type="button" data-testid="blocker-fix" aria-label={copy.checklist.fixAria(b.text)} onClick={() => openFix(b.target!)} className={plain}>
                  {copy.checklist.fix}
                </button>
              ) : null}
            </div>
          ))}
        </section>

        <OpenFlags side={side} live={live} head={head} heat={heat} wordFor={wordFor} onChanged={onChanged} />

        <section className="flex flex-col gap-1 rounded-card border border-beach-line bg-beach-surface p-2" aria-label={C.totals}>
          <h3 className="text-heading font-semibold text-beach-muted">{C.totals}</h3>
          {head.totals.map((t) => {
            const r = riderOf(t.entryId);
            const slot = slotOf(t.entryId);
            return (
              <div key={t.entryId} data-testid="console-total" data-rider={t.entryId} className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between gap-2">
                  <button type="button" aria-label={`${wordFor(t.entryId)}: ${C.riderMenu}`} disabled={!open} onClick={() => setMenu({ kind: "rider", entryId: t.entryId })} className="flex min-h-tap min-w-0 items-center gap-1 rounded-lg text-left">
                    {r ? <RiderLabel model={r.label} variant="live" bare /> : <span>{wordFor(t.entryId)}</span>}
                    {open ? <MoreVertical aria-hidden className="size-4 shrink-0 text-beach-muted" /> : null}
                  </button>
                  <span className="flex flex-col items-end">
                    <span data-testid="console-total-value" className="text-name font-semibold tabular-nums">
                      {noRideOf(t.entryId) ? noRideText(noRideOf(t.entryId)!) : heat.status === "scheduled" ? copy.live.result.noTotal : t.totalLabel}
                    </span>
                    {slot?.modifier && !noRideOf(t.entryId) ? <Pill tone="outlier">{slot.modifier}</Pill> : null}
                  </span>
                </div>
                {t.formula ? <p className="text-small font-medium text-beach-muted">{t.formula}</p> : null}
              </div>
            );
          })}
        </section>

        {closing && model.heat.impression ? (
          <section data-testid="owes" aria-label={H.impressionsHeading(impressionName)} className="flex flex-col gap-1.5 rounded-card border border-beach-line bg-beach-surface p-2">
            <h3 className="text-heading font-semibold text-beach-muted">{H.impressionsHeading(impressionName)}</h3>
            {owes.length === 0 ? <p className="text-small font-medium text-beach-muted">{C.noneOwed(impressionName)}</p> : null}
            {impressions.map((j) => (
              <div key={j.seatId} data-testid="owes-judge" data-seat={j.seatId} data-missing={j.missing} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-body font-semibold">{judgeWord(j.seatId)}</span>
                  <Pill tone={j.missing ? "pending" : "live"}>{j.missing ? H.impressionsMissing(j.missing) : H.impressionsAllIn}</Pill>
                </div>
                <ul className="flex flex-wrap gap-1">
                  {j.cells.map((cell) => (
                    <li
                      key={cell.entryId}
                      data-testid="impression-cell"
                      data-rider={cell.entryId}
                      data-state={cell.state}
                      className={cn("rounded-lg border px-1.5 text-small font-semibold tabular-nums", cell.state === "missing" ? "border-dashed border-beach-outlier" : "border-beach-line")}
                    >
                      {H.impressionCell(wordFor(cell.entryId), cell.state === "done" ? `${H.sheetDone} ${formatCell(cell.value as number)}` : cell.state === "absent" ? H.sheetAbsent : H.sheetMissing)}
                    </li>
                  ))}
                </ul>
                {open ? (
                  <button type="button" data-testid="enter-impression" onClick={() => setDialog({ kind: "impression", seatId: j.seatId, entryId: j.cells.find((c) => c.state === "missing")?.entryId ?? j.cells[0]?.entryId ?? "" })} className={plain}>
                    {H.sheetOpen(judgeWord(j.seatId))}
                  </button>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}

        {head.ties.length > 0 ? (
          <section data-testid="ties" aria-label={H.tiesHeading} className="flex flex-col gap-1 rounded-card border border-beach-line bg-beach-surface p-2">
            <h3 className="text-heading font-semibold text-beach-muted">{H.tiesHeading}</h3>
            {head.ties.map((t) => (
              <div key={t.text} className="flex flex-col gap-1">
                <p className="text-body font-medium">{t.text}</p>
                {open && (t.unresolved || t.shared) ? (
                  <button type="button" data-testid="choose-order" className={plain} onClick={() => setDialog({ kind: "tie", riders: t.riderIds })}>
                    {H.chooseOrder}
                  </button>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}

        {showFlagOut && division.flagOut ? (
          <section data-testid="flag-out" aria-label={H.flagOutHeading} className="flex flex-col gap-1 rounded-card border border-beach-line bg-beach-surface p-2">
            <h3 className="text-heading font-semibold text-beach-muted">{H.flagOutHeading}</h3>
            <p className="text-small font-medium">{H.flagOutDue(division.flagOut.count, division.flagOut.atMin)}</p>
            <button type="button" data-testid="flag-out-button" className={plain} onClick={() => setDialog({ kind: "flagOut" })}>
              {H.flagOutButton}
            </button>
          </section>
        ) : null}
        {open ? (
          <button type="button" data-testid="add-attempt" className={plain} onClick={() => setDialog({ kind: "add" })}>
            {C.add}
          </button>
        ) : null}

        <button type="button" data-testid="more-toggle" aria-expanded={more} onClick={() => setMore((m) => !m)} className={plain}>
          {more ? V.moreHide : V.more}
          {" · "}
          {V.detailsToggle}
        </button>
        {more ? (
          <div data-testid="more-panel" className="flex flex-col gap-2">
            <VisibilityBox c={c} />
            <AgreementReport side={side} head={head} heat={heat} />
            <AuditLog side={side} head={head} wordFor={wordFor} nameFor={(id) => riders.find((r) => r.entryId === id)?.name || wordFor(id)} timezone={ctx.event.timezone} />
            <ScreenSettings hideSound />
            {extras}
          </div>
        ) : null}
      </aside>

      {dialog?.kind === "cell"
        ? (() => {
            const row = rowById(dialog.attemptId);
            if (!row) return null;
            return (
              <CellDialog
                key={`${dialog.attemptId}${dialog.seatId}`}
                model={model}
                attemptId={dialog.attemptId}
                seatId={dialog.seatId}
                judge={judgeWord(dialog.seatId)}
                who={attemptWord(row)}
                current={live.scores.find((s) => s.attempt_id === dialog.attemptId && s.judge_seat_id === dialog.seatId)}
                onClose={close}
                onDone={done}
              />
            );
          })()
        : null}
      {dialog?.kind === "clearNote" ? <ClearNoteDialog noteId={dialog.noteId} judge={side.judges.find((j) => j.id === dialog.judgeId)?.tag ?? copy.live.matrix.aJudge} rider={riders.find((r) => r.entryId === dialog.entryId)?.name || wordFor(dialog.entryId)} line={dialog.line} onClose={close} onDone={done} /> : null}
      {dialog?.kind === "delete" ? <DeleteDialog rows={dialogRows(dialog.ids)} wordFor={wordFor} onClose={close} onDone={done} /> : null}
      {dialog?.kind === "merge" ? <MergeDialog model={model} rows={dialogRows(dialog.ids)} attempts={live.attempts} scores={live.scores} panelSeatIds={head.matrix.judgeIds} judgeWord={judgeWord} wordFor={wordFor} onClose={close} onDone={done} /> : null}
      {dialog?.kind === "edit"
        ? (() => {
            const a = live.attempts.find((x) => x.id === dialog.attemptId);
            return a ? <EditAttemptDialog key={a.id} attempt={a} riders={riders} counts={counts} cap={cap} wordFor={wordFor} onClose={close} onDone={done} /> : null;
          })()
        : null}
      {dialog?.kind === "add" ? <AddAttemptDialog heatId={heat.id} riders={riders} counts={counts} cap={cap} role={role} hasActiveHead={hasActiveHead} wordFor={wordFor} onClose={close} onDone={done} /> : null}
      {dialog?.kind === "status" ? (
        <StatusDialog
          heatId={heat.id}
          entryId={dialog.entryId}
          who={wordFor(dialog.entryId)}
          status={dialog.status}
          penaltyId={dialog.penaltyId}
          onClose={close}
          onDone={() => {
            if (dialog.status === "OUT") setJustOut((all) => new Set(all).add(dialog.entryId));
            done();
          }}
        />
      ) : null}
      {dialog?.kind === "walkover" && walkoverState && (walkoverState.kind === "walkover" || walkoverState.kind === "nobody") ? (
        <WalkoverDialog
          heatId={heat.id}
          winner={walkoverState.kind === "walkover" ? wordFor(walkoverState.winner) : null}
          others={walkoverState.others.map((id) => wordFor(id))}
          onClose={close}
          onDone={(text) => {
            setFlash(text);
            done();
          }}
        />
      ) : null}
      {dialog?.kind === "impression" ? (
        <ImpressionDialog
          model={model}
          heatId={heat.id}
          seatId={dialog.seatId}
          judge={judgeWord(dialog.seatId)}
          riders={(impressions.find((j) => j.seatId === dialog.seatId)?.cells ?? []).map((cell) => ({ id: cell.entryId, word: wordFor(cell.entryId), label: riders.find((r) => r.entryId === cell.entryId)!.label, now: { state: cell.state, value: cell.value } }))}
          first={dialog.entryId}
          onClose={close}
          onDone={done}
        />
      ) : null}
      {dialog?.kind === "tie" ? <TieDialog heatId={heat.id} riders={dialog.riders.map((id) => ({ id, word: wordFor(id) }))} onClose={close} onDone={done} /> : null}
      {dialog?.kind === "flagOut" && division.flagOut ? (
        <FlagOutDialog heatId={heat.id} riders={riders} preselected={head.flagOut?.riders ?? []} undecided={head.flagOut?.undecided ?? false} count={division.flagOut.count} wordFor={wordFor} onClose={close} onDone={done} />
      ) : null}
    </div>
  );
}

