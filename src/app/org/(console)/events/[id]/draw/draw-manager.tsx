"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { toast } from "@/hooks/use-toast";
import {
  applyDrawEdit,
  arrangedParts,
  checkDraw,
  heatLabel,
  placeholderText,
  placesBefore,
  ridersInRound,
  type DivisionDraw,
  type DrawEdit,
  type DrawHeat,
  type DrawRound,
} from "@/lib/engine/ladder";
import type { IdentificationScheme } from "@/lib/schemas/identification";
import { copy } from "@/lib/ui-copy";
import { editDraw, generateDraw, lockDraw, unlockDraw } from "./actions";
import { Ladder, type SeatKey } from "./ladder";

const T = copy.draw;

export interface DivisionSummary {
  id: string;
  name: string;
  riders: number;
  hasDraw: boolean;
  locked: boolean;
  started: boolean;
}

export interface SelectedDivision {
  id: string;
  name: string;
  locked: boolean;
  started: boolean;
  draw: DivisionDraw | null;
  scheme: IdentificationScheme;
  riders: number;
  formatName: string | null;
  formatProblem: string | null;
}

/** Inline rename: the name is a button; tapping it turns it into a box, Enter or leaving the box saves, Escape cancels. */
function Rename({ value, label, onSave, disabled, className }: { value: string; label: string; onSave: (name: string) => void; disabled?: boolean; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  if (!editing || disabled) {
    return (
      <button type="button" className={`text-left ${className ?? ""}`} disabled={disabled} aria-label={T.renameLabel(label)} onClick={() => { setText(value); setEditing(true); }}>
        {value}
      </button>
    );
  }
  const commit = () => {
    setEditing(false);
    if (text.trim() !== value) onSave(text.trim());
  };
  return (
    <input
      autoFocus
      aria-label={T.renameLabel(label)}
      value={text}
      maxLength={40}
      className="w-full !text-lg !font-extrabold"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}

export function DrawManager({ eventId, divisions, selected }: { eventId: string; divisions: DivisionSummary[]; selected: SelectedDivision }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draw, setDraw] = useState<DivisionDraw | null>(selected.draw);
  const [locked, setLocked] = useState(selected.locked);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picked, setPicked] = useState<SeatKey | null>(null);
  const [target, setTarget] = useState<SeatKey | null>(null);
  const [menu, setMenu] = useState<SeatKey | null>(null);
  const [regen, setRegen] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [reason, setReason] = useState("");

  const editable = Boolean(draw) && !locked;
  const warnings = useMemo(() => (draw ? [...checkDraw(draw).map((w) => w.message), ...draw.warnings.map((w) => w.message)] : []), [draw]);
  const arranged = draw ? arrangedParts(draw) : { heats: [], rounds: [] };
  const heats = draw ? draw.rounds.flatMap((r) => r.heats).filter((h) => !h.bye).length : 0;
  const heatById = (id: string): { round: DrawRound; heat: DrawHeat } | null => {
    for (const r of draw?.rounds ?? []) for (const h of r.heats) if (h.id === id) return { round: r, heat: h };
    return null;
  };

  /** The same engine runs here (instant) and on the server (saved and audited); the server's answer wins. */
  function apply(e: DrawEdit, done?: string) {
    if (!draw) return;
    setError(null);
    setNotice(null);
    let optimistic: DivisionDraw;
    try {
      optimistic = applyDrawEdit(draw, e).draw;
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    const before = draw;
    setDraw(optimistic);
    setPicked(null);
    setTarget(null);
    setMenu(null);
    startTransition(async () => {
      const r = await editDraw(selected.id, e);
      if (r.ok) {
        setDraw(r.draw);
        setNotice(done ?? r.summary);
        toast({ title: done ?? r.summary });
      } else {
        setDraw(before);
        setError(r.error);
      }
    });
  }

  function onSeat(seat: SeatKey) {
    if (!draw) return;
    setError(null);
    const here = heatById(seat.heatId);
    const slot = here?.heat.slots[seat.slot];
    if (!picked) {
      if (slot?.entrantId) setPicked(seat);
      else setMenu(seat);
      return;
    }
    if (picked.heatId === seat.heatId && picked.slot === seat.slot) {
      setPicked(null);
      setTarget(null);
      return;
    }
    setTarget(seat);
  }

  function runGenerate(keep: boolean) {
    setError(null);
    setRegen(false);
    startTransition(async () => {
      const r = await generateDraw(selected.id, keep);
      if (r.ok) {
        setDraw(r.draw);
        setLocked(false);
        setPicked(null);
        setTarget(null);
        const extra = r.kept.length ? ` ${T.keptNote(r.kept.length)}` : "";
        const dropped = r.dropped.length ? ` ${T.droppedNote(r.dropped.join(", "))}` : "";
        setNotice(`${T.generated}${extra}${dropped}`);
        router.refresh();
      } else setError(r.error);
    });
  }

  function runLock() {
    setError(null);
    startTransition(async () => {
      const r = await lockDraw(selected.id);
      if (r.ok) {
        setLocked(true);
        setPicked(null);
        setTarget(null);
        setMenu(null);
        setNotice(T.lockedNotice);
        router.refresh();
      } else setError(r.error);
    });
  }

  function runUnlock() {
    setError(null);
    startTransition(async () => {
      const r = await unlockDraw(selected.id, reason);
      if (r.ok) {
        setLocked(false);
        setUnlocking(false);
        setReason("");
        setNotice(T.unlockedNotice);
        router.refresh();
      } else setError(r.error);
    });
  }

  const pickedInfo = picked ? heatById(picked.heatId) : null;
  const pickedName = picked && pickedInfo ? draw?.entrants.find((e) => e.id === pickedInfo.heat.slots[picked.slot]?.entrantId)?.name : null;
  const targetInfo = target ? heatById(target.heatId) : null;
  const targetSlot = target && targetInfo ? targetInfo.heat.slots[target.slot] : null;
  const targetName = targetSlot?.entrantId ? draw?.entrants.find((e) => e.id === targetSlot.entrantId)?.name : null;

  const menuInfo = menu ? heatById(menu.heatId) : null;
  const menuSlot = menu && menuInfo ? menuInfo.heat.slots[menu.slot] : null;

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label={T.divisionsLabel} className="flex flex-wrap gap-2">
        {divisions.map((d) => (
          <Link key={d.id} href={`/org/events/${eventId}/draw?division=${d.id}`} className={`btn ${d.id === selected.id ? "btn-primary" : ""}`} aria-current={d.id === selected.id ? "page" : undefined}>
            {d.name}
            <span className="ml-2 text-sm font-bold">{d.locked ? T.tab.locked : d.hasDraw ? T.tab.draft : T.tab.none}</span>
          </Link>
        ))}
      </nav>

      <div className="panel flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-extrabold">{selected.name}</h2>
          <span className="font-bold" data-testid="draw-status">
            {!draw ? T.status.none : locked ? T.status.locked : T.status.draft}
          </span>
          <span className="font-semibold">{T.riders(selected.riders)}</span>
          {selected.formatName ? <span className="font-semibold">{T.format(selected.formatName)}</span> : null}
          {draw ? <span className="font-semibold" data-testid="draw-count">{T.counts(draw.rounds.length, heats)}</span> : null}
        </div>
        {selected.formatProblem ? <p className="field-error">{copy.common.problem(selected.formatProblem)}</p> : null}
        {!selected.formatName && !selected.formatProblem ? <p className="font-semibold">{T.noFormat}</p> : null}
        {selected.riders === 0 ? <p className="font-semibold">{T.noRiders}</p> : null}

        <div className="flex flex-wrap items-center gap-3">
          {!draw ? (
            <button type="button" className="btn btn-primary" disabled={pending || !selected.formatName || selected.riders === 0} onClick={() => runGenerate(false)}>
              {T.generate}
            </button>
          ) : regen ? (
            <div role="group" aria-label={T.regenerate} className="panel flex flex-col gap-3">
              <p className="text-lg font-bold">{arranged.heats.length > 0 ? T.regenerateQuestionArranged(arranged.heats.map((h) => h.label)) : T.regenerateQuestion}</p>
              <div className="flex flex-wrap gap-3">
                {arranged.heats.length > 0 ? (
                  <>
                    <button type="button" className="btn btn-primary" disabled={pending} onClick={() => runGenerate(true)}>
                      {T.regenerateKeep}
                    </button>
                    <button type="button" className="btn btn-danger" disabled={pending} onClick={() => runGenerate(false)}>
                      {T.regenerateDiscard}
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn btn-primary" disabled={pending} onClick={() => runGenerate(false)}>
                    {T.regenerateYes}
                  </button>
                )}
                <button type="button" className="btn" onClick={() => setRegen(false)}>
                  {copy.common.cancel}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn" disabled={pending || locked || selected.started} title={selected.started ? T.regenerateRefusedStarted : locked ? T.regenerateRefusedLocked : undefined} onClick={() => setRegen(true)}>
              {T.regenerate}
            </button>
          )}
          {draw && !locked ? (
            <button type="button" className="btn btn-primary" disabled={pending} onClick={runLock}>
              {T.lock}
            </button>
          ) : null}
          {draw && locked && !unlocking ? (
            <button type="button" className="btn" disabled={pending} onClick={() => setUnlocking(true)}>
              {T.unlock}
            </button>
          ) : null}
          {draw ? (
            <Link className="btn" href={`/org/events/${eventId}/draw/print?division=${selected.id}`} target="_blank">
              {T.print}
            </Link>
          ) : null}
        </div>
        {selected.started ? <p className="font-semibold">{T.startedNote}</p> : null}
        {locked && !unlocking ? <p className="font-semibold">{T.lockedHelp}</p> : null}
        {unlocking ? (
          <div role="group" aria-label={T.unlock} className="panel flex flex-col gap-2">
            <label htmlFor="unlock-reason" className="text-lg font-bold">
              {T.unlockReasonLabel}
            </label>
            <input id="unlock-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={T.unlockReasonPlaceholder} />
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn btn-primary" disabled={pending || reason.trim().length < 5} onClick={runUnlock}>
                {T.unlockConfirm}
              </button>
              <button type="button" className="btn" onClick={() => { setUnlocking(false); setReason(""); }}>
                {copy.common.cancel}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="panel field-error" data-testid="draw-error">
          {copy.common.problem(error)}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="panel font-bold" data-testid="draw-notice">
          {notice}
        </p>
      ) : null}

      {draw ? (
        <>
          <div className="panel flex flex-col gap-2" aria-label={T.checksLabel} data-testid="draw-checks">
            <h3 className="text-lg font-extrabold">{T.checksHeading}</h3>
            {warnings.length === 0 ? (
              <p className="font-semibold" data-testid="draw-checks-ok">
                {T.checksOk}
              </p>
            ) : (
              <ul className="list-disc pl-6 font-semibold">
                {warnings.map((w, i) => (
                  <li key={`${i}-${w}`} data-testid="draw-warning">
                    {w}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm font-semibold">{T.checksNever}</p>
          </div>

          {picked && pickedName ? (
            <div role="status" className="panel sticky top-2 z-10 flex flex-wrap items-center gap-3 !border-[#111] !bg-[#fde68a]" data-testid="tap-bar">
              {!target ? (
                <span className="text-lg font-bold">{T.tapPicked(pickedName)}</span>
              ) : (
                <>
                  <span className="text-lg font-bold">{targetName ? T.tapSwapQuestion(pickedName, targetName) : T.tapMoveQuestion(pickedName)}</span>
                  <button type="button" className="btn btn-primary" disabled={pending} onClick={() => apply({ op: "move", from: picked, to: target })}>
                    {targetName ? T.swap(targetName) : T.moveHere}
                  </button>
                </>
              )}
              <button type="button" className="btn" onClick={() => { setPicked(null); setTarget(null); }}>
                {copy.common.cancel}
              </button>
            </div>
          ) : null}

          {menu && menuInfo && menuSlot ? (
            <div role="group" aria-label={T.seatMenuHeading(heatLabel(menuInfo.heat), menu.slot + 1)} className="panel flex flex-col gap-3" data-testid="seat-menu">
              <h3 className="text-lg font-extrabold">{T.seatMenuHeading(heatLabel(menuInfo.heat), menu.slot + 1)}</h3>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="menu-rider">{T.placeRider}</label>
                  <select
                    id="menu-rider"
                    value=""
                    onChange={(e) => e.target.value && apply({ op: "place", heatId: menu.heatId, slot: menu.slot, entrantId: e.target.value })}
                  >
                    <option value="">{copy.common.choose}</option>
                    {ridersInRound(draw, menuInfo.round.id).map((r) => (
                      <option key={r.entrantId} value={r.entrantId}>
                        {r.name} — {r.heats.length === 0 ? T.noHeatYet : r.heats.map((id) => heatById(id)?.heat).map((h) => (h ? heatLabel(h) : "")).join(", ")}
                      </option>
                    ))}
                  </select>
                </div>
                {menuInfo.round.id !== draw.rounds[0].id ? (
                  <div className="flex flex-col gap-1">
                    <label htmlFor="menu-place">{T.waitForPlace}</label>
                    <select
                      id="menu-place"
                      value=""
                      onChange={(e) => {
                        if (!e.target.value) return;
                        const [round, heat, place] = e.target.value.split("|");
                        apply({ op: "setPlace", heatId: menu.heatId, slot: menu.slot, from: { round, heat: Number(heat), place: Number(place) } });
                      }}
                    >
                      <option value="">{copy.common.choose}</option>
                      {placesBefore(draw, menuInfo.round.id).map((p) => (
                        <option key={`${p.round}|${p.heat}|${p.place}`} value={`${p.round}|${p.heat}|${p.place}`}>
                          {placeholderText(draw, p, menuInfo.round.id)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <button type="button" className="btn" disabled={pending} onClick={() => apply({ op: "clear", heatId: menu.heatId, slot: menu.slot })}>
                  {T.clearSeat}
                </button>
                <button type="button" className="btn" disabled={pending} onClick={() => apply({ op: "removeSeat", heatId: menu.heatId, slot: menu.slot })}>
                  {T.removeSeat}
                </button>
                <button type="button" className="btn" onClick={() => setMenu(null)}>
                  {copy.common.close}
                </button>
              </div>
            </div>
          ) : null}

          <Ladder
            draw={draw}
            scheme={selected.scheme}
            editable={editable}
            picked={picked}
            target={target}
            menuSeat={menu}
            onSeat={onSeat}
            onMenu={(seat) => setMenu((m) => (m && m.heatId === seat.heatId && m.slot === seat.slot ? null : seat))}
            onMove={(from, to) => apply({ op: "move", from, to })}
            renderRoundHeader={(round) => (
              <div className="flex items-center gap-2">
                <Rename className="text-xl font-extrabold" label={round.name} value={round.name} disabled={locked} onSave={(name) => apply({ op: "renameRound", roundId: round.id, name })} />
                {editable ? (
                  <>
                    <button type="button" className="btn !min-h-[var(--org-ctl)]" disabled={pending} onClick={() => apply({ op: "addHeat", roundId: round.id })}>
                      {T.addHeat}
                    </button>
                    <button type="button" className="btn !min-h-[var(--org-ctl)]" disabled={pending} onClick={() => apply({ op: "addRound", afterRoundId: round.id })}>
                      {T.addRoundAfter}
                    </button>
                    {round.heats.length === 0 ? (
                      <button type="button" className="btn !min-h-[var(--org-ctl)]" disabled={pending} onClick={() => apply({ op: "removeRound", roundId: round.id })}>
                        {T.removeRound}
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            )}
            renderHeatTitle={(_round, heat) => <Rename label={heatLabel(heat)} value={heatLabel(heat)} disabled={locked} onSave={(name) => apply({ op: "renameHeat", heatId: heat.id, name })} />}
            renderHeatExtra={(_round, heat) =>
              editable && heat.status === "pending" ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn !min-h-[var(--org-ctl)]" disabled={pending} onClick={() => apply({ op: "addSeat", heatId: heat.id })}>
                    {T.addSeat}
                  </button>
                  <ConfirmButton
                    label={T.removeHeat}
                    question={T.removeHeatQuestion(heatLabel(heat))}
                    confirmLabel={T.removeHeatYes}
                    cancelLabel={copy.common.cancel}
                    pending={pending}
                    danger
                    onConfirm={() => apply({ op: "removeHeat", heatId: heat.id })}
                  />
                </div>
              ) : null
            }
          />
        </>
      ) : (
        <p className="panel text-lg font-semibold">{T.emptyState}</p>
      )}
    </div>
  );
}
