"use client";

import { useMemo, useState } from "react";
import { MoreVertical } from "lucide-react";
import { Chip } from "./chip";
import { plain } from "./console-parts";
import { AddAttemptDialog, CellDialog, DeleteDialog, EditAttemptDialog, FlagOutDialog, ImpressionDialog, MergeDialog, StatusDialog } from "./head-console-dialogs";
import { TieDialog } from "./head-dialogs";
import { HeadMatrix } from "./head-matrix";
import type { LiveHeatState } from "./use-live-heat";
import { Pill } from "./pill";
import { RiderLabel } from "@/components/rider-label";
import { outlierTolerance } from "@/lib/live/cell-tone";
import { canMerge } from "@/lib/live/console-ops";
import type { HeadModel } from "@/lib/live/head-model";
import { heatTitle } from "@/lib/live/run-order";
import type { PastCapRole } from "@/lib/live/merge-plan";
import type { LiveMatrixRow } from "@/lib/live/matrix";
import type { HeatRider } from "@/lib/live/screen-model";
import type { HeatRow, LiveContext, LiveDivisionContext } from "@/lib/live/types";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const C = copy.live.console;
const H = copy.headLive;

type Menu = { kind: "attempt"; attemptId: string } | { kind: "rider"; entryId: string } | null;
type Dialog =
  | { kind: "cell"; attemptId: string; seatId: string }
  | { kind: "delete"; ids: string[] }
  | { kind: "merge"; ids: string[] }
  | { kind: "edit"; attemptId: string }
  | { kind: "add" }
  | { kind: "status"; entryId: string; status: "DNS" | "DNF" | "DSQ" | "INT" | "CLEAR" | "UNDO_INT"; penaltyId?: string }
  | { kind: "impression"; seatId: string; entryId: string }
  | { kind: "tie"; riders: string[] }
  | { kind: "flagOut" }
  | null;

const editable = (status: string) => ["running", "paused", "ended", "under_review"].includes(status);

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
}) {
  const [menu, setMenu] = useState<Menu>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const model = division.model;
  const rows = head.matrix.rows;
  const open = editable(heat.status);
  // Impression / Variety scores open when the heat has ended: until then nothing is owed and nothing blocks Publish
  const closing = heat.status === "ended" || heat.status === "under_review";
  const owes = closing ? head.owes : [];
  const blockerItems = closing ? head.checklist.items : [];
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
        [C.dns, () => setDialog({ kind: "status", entryId: menuRider.entryId, status: "DNS" }), true],
        [C.dnf, () => setDialog({ kind: "status", entryId: menuRider.entryId, status: "DNF" }), true],
        [C.dsq, () => setDialog({ kind: "status", entryId: menuRider.entryId, status: "DSQ" }), true],
        [C.interference, () => setDialog({ kind: "status", entryId: menuRider.entryId, status: "INT" }), true],
        ...(status ? ([[H.clearStatus, () => setDialog({ kind: "status", entryId: menuRider.entryId, status: "CLEAR" }), true]] as Array<[string, () => void, boolean]>) : []),
        ...(penaltyOf(menuRider.entryId) ? ([[H.removeInterference, () => setDialog({ kind: "status", entryId: menuRider.entryId, status: "UNDO_INT", penaltyId: penaltyOf(menuRider.entryId)!.id }), true]] as Array<[string, () => void, boolean]>) : []),
      ]
    : [];

  const flagRound = ctx.rounds.find((r) => r.id === heat.round_id);
  const showFlagOut = Boolean(division.flagOut && flagRound && division.flagOut.rounds.includes(flagRound.short_name ?? flagRound.name) && (heat.status === "running" || heat.status === "paused"));
  const title = heatTitle(ctx, heat);
  const dialogRows = (ids: string[]) => ids.flatMap((id) => (rowById(id) ? [rowById(id)!] : []));

  return (
    <div data-testid="head-live-console" data-heat={heat.id} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-name font-semibold">{title}</p>
        <Pill tone={heat.status === "published" ? "live" : "outlier"}>{copy.heatControl.status[heat.status] ?? heat.status}</Pill>
        {heat.reopened_at && heat.status === "under_review" ? <Pill tone="outlier">{H.underCorrection}</Pill> : null}
      </div>
      {!open ? <p className="text-small font-medium text-beach-muted">{heat.status === "published" ? C.published : ""}</p> : null}

      {open && menu ? (
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
      ) : open ? (
        <p className="text-small font-medium text-beach-muted">{C.tap}</p>
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
      <p className="text-small font-medium text-beach-muted">{C.toleranceNote(String(outlierTolerance(model)))}</p>

      <div className="grid items-start gap-2 min-[1700px]:grid-cols-[minmax(0,1fr)_14rem]">
        <HeadMatrix
          tolerance={outlierTolerance(model)}
          model={{ judgeIds: head.matrix.judgeIds, rows }}
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
        <aside className="grid gap-2 sm:grid-cols-2 min-[1700px]:grid-cols-1">
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
                        {t.totalLabel}
                      </span>
                      {slot?.modifier ? <Pill tone="outlier">{slot.modifier}</Pill> : null}
                    </span>
                  </div>
                  {t.formula ? <p className="text-small font-medium text-beach-muted">{t.formula}</p> : null}
                </div>
              );
            })}
          </section>

          {closing ? (
            <div data-testid="owes" className="flex flex-col gap-1 rounded-xl border border-beach-line bg-beach-bg px-2 py-1 text-body font-medium">
              {owes.length === 0 ? <span>{C.noneOwed}</span> : null}
              {[...new Set(owes.map((o) => o.seatId))].map((seatId) => {
                const mine = owes.filter((o) => o.seatId === seatId);
                return (
                  <div key={seatId} data-testid="owes-judge" className="flex flex-col gap-0.5">
                    <span>{C.owes(copy.live.matrix.judge(mine[0].judgeNo), mine.map((o) => wordFor(o.entryId)).join(", "))}</span>
                    {open ? (
                      <button type="button" data-testid="enter-impression" onClick={() => setDialog({ kind: "impression", seatId, entryId: mine[0].entryId })} className={plain}>
                        {C.enterImpression}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
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

          <section data-testid="blockers" className="flex flex-col gap-1 rounded-card border border-beach-line bg-beach-surface p-2" aria-label={H.blockersHeading}>
            <h3 className="text-heading font-semibold text-beach-muted">{blockerItems.length ? C.publishBlocked : H.nothingBlocks}</h3>
            {blockerItems.map((b) => (
              <p key={b.text} className="rounded-lg border border-beach-outlier bg-beach-bg px-2 py-0.5 text-body font-medium">
                {b.text}
              </p>
            ))}
          </section>

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
        </aside>
      </div>

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
                judgeNo={head.matrix.judgeIds.indexOf(dialog.seatId) + 1}
                who={attemptWord(row)}
                current={live.scores.find((s) => s.attempt_id === dialog.attemptId && s.judge_seat_id === dialog.seatId)}
                onClose={close}
                onDone={done}
              />
            );
          })()
        : null}
      {dialog?.kind === "delete" ? <DeleteDialog rows={dialogRows(dialog.ids)} wordFor={wordFor} onClose={close} onDone={done} /> : null}
      {dialog?.kind === "merge" ? <MergeDialog model={model} rows={dialogRows(dialog.ids)} attempts={live.attempts} scores={live.scores} panelSeatIds={head.matrix.judgeIds} wordFor={wordFor} onClose={close} onDone={done} /> : null}
      {dialog?.kind === "edit"
        ? (() => {
            const a = live.attempts.find((x) => x.id === dialog.attemptId);
            return a ? <EditAttemptDialog key={a.id} attempt={a} riders={riders} counts={counts} cap={cap} wordFor={wordFor} onClose={close} onDone={done} /> : null;
          })()
        : null}
      {dialog?.kind === "add" ? <AddAttemptDialog heatId={heat.id} riders={riders} counts={counts} cap={cap} role={role} hasActiveHead={hasActiveHead} wordFor={wordFor} onClose={close} onDone={done} /> : null}
      {dialog?.kind === "status" ? <StatusDialog heatId={heat.id} entryId={dialog.entryId} who={wordFor(dialog.entryId)} status={dialog.status} penaltyId={dialog.penaltyId} onClose={close} onDone={done} /> : null}
      {dialog?.kind === "impression" ? (
        <ImpressionDialog
          model={model}
          heatId={heat.id}
          seatId={dialog.seatId}
          judgeNo={head.matrix.judgeIds.indexOf(dialog.seatId) + 1}
          riders={owes.filter((o) => o.seatId === dialog.seatId).map((o) => ({ id: o.entryId, word: wordFor(o.entryId) }))}
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

