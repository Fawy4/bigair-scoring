"use client";

import { NumberField } from "@/components/org/number-field";
import { DndContext, pointerWithin, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useMemo, useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import {
  addHeat,
  addRound,
  applyFix,
  checkLadder,
  clearSeat,
  heatName,
  isPreviewRider,
  moveRound,
  placeOptions,
  removeHeat,
  removeRound,
  renameHeat,
  renameRound,
  roundIndex,
  sendPlace,
  setAdvance,
  setLimits,
  setSeat,
  setSeatCount,
  LadderEditError,
  type CustomLadder,
  type Fix,
  type PlaceRef,
  type RiderRef,
  type SeatSource,
} from "@/lib/engine/ladder";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const T = copy.builder;

/** The value of a seat's dropdown: "", "seed:3", "rider:<id>" or "place:<round>:<heat>:<place>". */
function encode(s: SeatSource): string {
  if (s.type === "seed") return `seed:${s.seed}`;
  if (s.type === "rider") return `rider:${s.entrantId}`;
  if (s.type === "place") return `place:${s.round}:${s.heat}:${s.place}`;
  return "";
}

function decode(v: string): SeatSource {
  if (v.startsWith("seed:")) return { type: "seed", seed: Number(v.slice(5)) };
  if (v.startsWith("rider:")) return { type: "rider", entrantId: v.slice(6) };
  if (v.startsWith("place:")) {
    const [, round, heat, place] = v.split(":");
    return { type: "place", round, heat: Number(heat), place: Number(place) };
  }
  return { type: "empty" };
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;

function NumberBox({ id, label, value, min, max, onCommit, disabled, className }: { id: string; label: string; value: number | undefined; min: number; max: number; onCommit: (n: number) => void; disabled?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <NumberField id={id} label={label} min={min} max={max} step={max > 20 ? 0.5 : 1} value={value ?? null} disabled={disabled} onChange={onCommit} />
    </div>
  );
}

function SeatBox({
  ladder,
  riders,
  roundId,
  heat,
  seat,
  readOnly,
  sending,
  onPick,
  onSend,
  draggable,
}: {
  ladder: CustomLadder;
  riders: readonly RiderRef[];
  roundId: string;
  heat: number;
  seat: number;
  readOnly?: boolean;
  sending: PlaceRef | null;
  onPick: (source: SeatSource) => void;
  onSend: () => void;
  draggable: boolean;
}) {
  const ri = roundIndex(ladder, roundId);
  const round = ladder.rounds[ri];
  const current = round.heats[heat - 1].seats[seat];
  const value = encode(current);
  const id = `seat:${roundId}:${heat}:${seat}`;
  const drag = useDraggable({ id, disabled: readOnly || !draggable || current.type === "empty" });
  const drop = useDroppable({ id, disabled: readOnly || !draggable });

  // everything already placed, to grey it out and say where it went
  const usedAt = useMemo(() => {
    const out = new Map<string, string>();
    for (const r of ladder.rounds) {
      r.heats.forEach((h, hi) => {
        h.seats.forEach((s, si) => {
          const key = encode(s);
          if (key && !(r.id === roundId && hi + 1 === heat && si === seat)) out.set(key, `${r.shortName} ${heatName(r, hi + 1)}`);
        });
      });
    }
    return out;
  }, [ladder, roundId, heat, seat]);
  // a seed and the rider who holds that seed are the same person
  const personUsed = (key: string): string | undefined => {
    const direct = usedAt.get(key);
    if (direct) return direct;
    if (key.startsWith("seed:")) {
      const rider = riders[Number(key.slice(5)) - 1];
      return rider ? usedAt.get(`rider:${rider.id}`) : undefined;
    }
    if (key.startsWith("rider:")) {
      const at = riders.findIndex((r) => r.id === key.slice(6));
      return at >= 0 ? usedAt.get(`seed:${at + 1}`) : undefined;
    }
    return undefined;
  };

  const options = useMemo(() => {
    if (ri === 0) {
      const seedCount = Math.max(riders.length, current.type === "seed" ? current.seed : 0);
      return {
        seeds: Array.from({ length: seedCount }, (_, i) => ({ key: `seed:${i + 1}`, label: T.seedOption(i + 1, riders[i]?.name) })),
        riders: riders.filter((r) => !isPreviewRider(r.id)).map((r) => ({ key: `rider:${r.id}`, label: r.name })),
        places: [],
      };
    }
    return { seeds: [], riders: [], places: placeOptions(ladder, roundId) };
  }, [ri, riders, ladder, roundId, current]);

  const eligibleTarget = Boolean(sending) && roundIndex(ladder, sending!.round) < ri;
  const label = T.seatLabel(round.shortName, heatName(round, heat), seat + 1);
  return (
    <li
      ref={(el) => {
        drop.setNodeRef(el);
        drag.setNodeRef(el);
      }}
      data-testid="builder-seat"
      className={cn(
        "flex flex-col gap-1 rounded-lg border-2 border-[#111] bg-white p-2",
        current.type === "empty" ? "border-dashed" : "",
        drop.isOver ? "bg-[#e5e7eb]" : "",
        eligibleTarget ? "outline outline-4 outline-offset-2 outline-[#2563eb]" : "",
      )}
    >
      <div className="flex items-center gap-2">
        {draggable && !readOnly ? (
          <button type="button" ref={drag.setActivatorNodeRef} className="btn !min-h-[var(--org-ctl)] !px-2" aria-label={T.dragSeat(label)} disabled={current.type === "empty"} {...drag.listeners} {...drag.attributes}>
            ⠿
          </button>
        ) : (
          <span className="w-6 shrink-0 text-center text-sm font-extrabold" aria-hidden>
            {seat + 1}
          </span>
        )}
        <select
          id={id}
          aria-label={label}
          disabled={readOnly}
          value={value}
          className={cn("min-w-0 flex-1", drag.isDragging ? "opacity-40" : "")}
          onChange={(e) => onPick(decode(e.target.value))}
        >
          <option value="">{T.emptyOption}</option>
          {options.seeds.length > 0 ? (
            <optgroup label={T.seedsGroup}>
              {options.seeds.map((o) => {
                const used = personUsed(o.key);
                return (
                  <option key={o.key} value={o.key} disabled={Boolean(used) && o.key !== value}>
                    {used && o.key !== value ? `${o.label} ${T.usedAt(used)}` : o.label}
                  </option>
                );
              })}
            </optgroup>
          ) : null}
          {options.riders.length > 0 ? (
            <optgroup label={T.ridersGroup}>
              {options.riders.map((o) => {
                const used = personUsed(o.key);
                return (
                  <option key={o.key} value={o.key} disabled={Boolean(used) && o.key !== value}>
                    {used && o.key !== value ? `${o.label} ${T.usedAt(used)}` : o.label}
                  </option>
                );
              })}
            </optgroup>
          ) : null}
          {ladder.rounds.slice(0, ri).map((r) => {
            const list = options.places.filter((o) => o.place.round === r.id);
            if (list.length === 0) return null;
            return (
              <optgroup key={r.id} label={r.name}>
                {list.map((o) => {
                  const key = `place:${o.place.round}:${o.place.heat}:${o.place.place}`;
                  const used = o.usedAt && !(o.usedAt.round === roundId && o.usedAt.heat === heat && o.usedAt.seat === seat) ? `${ladder.rounds[roundIndex(ladder, o.usedAt.round)]?.shortName} ${heatName(ladder.rounds[roundIndex(ladder, o.usedAt.round)], o.usedAt.heat)}` : null;
                  return (
                    <option key={key} value={key} disabled={Boolean(used)}>
                      {used ? `${o.label} ${T.usedAt(used)}` : o.label}
                    </option>
                  );
                })}
              </optgroup>
            );
          })}
        </select>
      </div>
      {eligibleTarget ? (
        <button type="button" className="btn btn-primary !min-h-[var(--org-ctl)]" onClick={onSend}>
          {T.putHere}
        </button>
      ) : null}
    </li>
  );
}

export interface BuilderProps {
  ladder: CustomLadder;
  onChange: (l: CustomLadder) => void;
  riders: readonly RiderRef[];
  /** The division's real confirmed riders (the builder itself designs for `riders`, which follows the preview number). */
  confirmedCount: number;
  readOnly?: boolean;
  startFromOptions: Array<{ kind: string; label: string }>;
  onStartFrom: (kind: string) => void;
  startFromError?: string | null;
  /** Buttons that save, apply and export, drawn under the checker. */
  children?: (state: { complete: boolean }) => React.ReactNode;
}

/** The whiteboard: "+ Add round" → "+ Add heat" → seats as boxes, every seat a dropdown, with the checker beside (below on a phone). */
export function LadderBuilder({ ladder, onChange, riders, confirmedCount, readOnly, startFromOptions, onStartFrom, startFromError, children }: BuilderProps) {
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<PlaceRef | null>(null);
  const [startKind, setStartKind] = useState(startFromOptions[0]?.kind ?? "");
  const check = useMemo(() => checkLadder(ladder, riders), [ladder, riders]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function change(f: () => CustomLadder) {
    try {
      setError(null);
      onChange(f());
    } catch (e) {
      setError(e instanceof LadderEditError ? e.message : T.failed);
    }
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const [, r1, h1, s1] = String(e.active.id).split(":");
    const [, r2, h2, s2] = String(e.over.id).split(":");
    // only the first round takes seeds and riders, so only there can seats swap by dragging
    if (r1 !== r2 || roundIndex(ladder, r1) !== 0) return;
    change(() => {
      const a = ladder.rounds[0].heats[Number(h1) - 1].seats[Number(s1)];
      const b = ladder.rounds[0].heats[Number(h2) - 1].seats[Number(s2)];
      let next = setSeat(ladder, { round: r1, heat: Number(h1), seat: Number(s1) }, b);
      next = setSeat(next, { round: r2, heat: Number(h2), seat: Number(s2) }, a);
      return next;
    });
  }

  const finalId = ladder.rounds[ladder.rounds.length - 1]?.id;
  const faultsByRound = (id: string) => check.faults.filter((f) => f.round === id).length;

  return (
    <div className="flex flex-col gap-3" data-testid="ladder-builder">
      <div className="flex flex-wrap items-end gap-3">
        <button type="button" className="btn btn-primary" disabled={readOnly} onClick={() => change(() => addRound(ladder))}>
          {T.addRound}
        </button>
        <div className="flex flex-col gap-1">
          <label htmlFor="start-from" className="text-sm font-bold">
            {T.startFromLabel}
          </label>
          <select id="start-from" value={startKind} onChange={(e) => setStartKind(e.target.value)} disabled={readOnly}>
            {startFromOptions.map((o) => (
              <option key={o.kind} value={o.kind}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {ladder.rounds.length > 0 ? (
          <ConfirmButton label={T.startFrom(startFromOptions.find((o) => o.kind === startKind)?.label ?? "")} question={T.startFromQuestion} confirmLabel={T.startFromYes} cancelLabel={copy.common.cancel} disabled={readOnly} onConfirm={() => onStartFrom(startKind)} />
        ) : (
          <button type="button" className="btn" disabled={readOnly} onClick={() => onStartFrom(startKind)}>
            {T.startFrom(startFromOptions.find((o) => o.kind === startKind)?.label ?? "")}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3" role="group" aria-label={T.numbersLabel}>
        <NumberBox id="lb-target" label={T.targetLabel} value={ladder.targetHeatSize} min={1} max={10} disabled={readOnly} onCommit={(n) => change(() => setLimits(ladder, { targetHeatSize: n, minHeatSize: Math.min(ladder.minHeatSize, n), maxHeatSize: Math.max(ladder.maxHeatSize, n) }))} />
        <NumberBox id="lb-min" label={T.minLabel} value={ladder.minHeatSize} min={1} max={ladder.targetHeatSize} disabled={readOnly} onCommit={(n) => change(() => setLimits(ladder, { minHeatSize: n }))} />
        <NumberBox id="lb-max" label={T.maxLabel} value={ladder.maxHeatSize} min={ladder.targetHeatSize} max={10} disabled={readOnly} onCommit={(n) => change(() => setLimits(ladder, { maxHeatSize: n }))} />
        <p className="max-w-md text-sm font-semibold">{T.numbersNote}</p>
      </div>
      {startFromError ? <p className="field-error">{copy.common.problem(startFromError)}</p> : null}
      <p className="font-semibold" data-testid="designing-for">{confirmedCount === 0 ? T.planning(riders.length) : T.ridersKnown(riders.length, confirmedCount)}</p>
      {error ? (
        <p role="alert" className="field-error">
          {copy.common.problem(error)}
        </p>
      ) : null}
      {sending ? (
        <div role="status" className="panel flex flex-wrap items-center gap-3 !bg-[#bfdbfe]" data-testid="sending-bar">
          <span className="font-bold">{T.sending(ordinal(sending.place), `H${sending.heat}`)}</span>
          <button type="button" className="btn" onClick={() => setSending(null)}>
            {copy.common.cancel}
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={onDragEnd}>
          <div className="flex items-start gap-4 overflow-x-auto pb-3" data-testid="builder-rounds">
            {ladder.rounds.length === 0 ? <p className="panel w-full text-lg font-semibold">{T.empty}</p> : null}
            {ladder.rounds.map((round, ri) => {
              const isFinal = round.id === finalId;
              const faults = faultsByRound(round.id);
              return (
                <section key={round.id} className="flex w-80 shrink-0 flex-col gap-2 rounded-xl border-2 border-[#111] bg-[#f9fafb] p-2" aria-label={round.name} data-testid="builder-round" data-round={round.id}>
                  <header className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        aria-label={T.roundName(ri + 1)}
                        className="min-w-0 flex-1 !text-lg !font-extrabold"
                        defaultValue={round.name}
                        key={round.name}
                        disabled={readOnly}
                        maxLength={40}
                        onBlur={(e) => e.target.value.trim() !== round.name && change(() => renameRound(ladder, round.id, e.target.value))}
                        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                      />
                      <button type="button" className="btn !min-h-[var(--org-ctl)] !px-3" disabled={readOnly || ri === 0} aria-label={T.moveRoundLeft(round.name)} onClick={() => change(() => moveRound(ladder, round.id, -1))}>
                        ←
                      </button>
                      <button type="button" className="btn !min-h-[var(--org-ctl)] !px-3" disabled={readOnly || ri === ladder.rounds.length - 1} aria-label={T.moveRoundRight(round.name)} onClick={() => change(() => moveRound(ladder, round.id, 1))}>
                        →
                      </button>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      {!isFinal ? <NumberBox id={`adv-${round.id}`} label={T.advanceLabel} value={round.advance} min={0} max={10} disabled={readOnly} onCommit={(n) => change(() => setAdvance(ladder, round.id, n))} /> : <span className="text-sm font-bold">{T.finalNote}</span>}
                      <span className="text-sm font-bold">{faults > 0 ? T.roundFaults(faults) : T.roundOk}</span>
                    </div>
                    <details>
                      <summary className="cursor-pointer text-sm font-bold">{T.roundSettings}</summary>
                      <div className="mt-2 flex flex-wrap gap-3">
                        <NumberBox id={`min-${round.id}`} label={T.minLabel} value={round.minHeatSize ?? ladder.minHeatSize} min={1} max={10} disabled={readOnly} onCommit={(n) => change(() => setLimits(ladder, { minHeatSize: n }, round.id))} />
                        <NumberBox id={`max-${round.id}`} label={T.maxLabel} value={round.maxHeatSize ?? ladder.maxHeatSize} min={1} max={10} disabled={readOnly} onCommit={(n) => change(() => setLimits(ladder, { maxHeatSize: n }, round.id))} />
                        <NumberBox id={`len-${round.id}`} label={T.lengthLabel} value={round.durationMin} min={1} max={180} disabled={readOnly} onCommit={(n) => change(() => ({ ...ladder, rounds: ladder.rounds.map((r) => (r.id === round.id ? { ...r, durationMin: n } : r)) }))} />
                        <NumberBox id={`warm-${round.id}`} label={T.warmUpLabel} value={round.warmUpMin} min={0} max={60} disabled={readOnly} onCommit={(n) => change(() => ({ ...ladder, rounds: ladder.rounds.map((r) => (r.id === round.id ? { ...r, warmUpMin: n } : r)) }))} />
                      </div>
                      <ConfirmButton label={T.removeRound} question={T.removeRoundQuestion(round.name)} confirmLabel={T.removeRoundYes} cancelLabel={copy.common.cancel} danger disabled={readOnly} onConfirm={() => change(() => removeRound(ladder, round.id))} />
                    </details>
                  </header>

                  {round.heats.map((heat, hi) => (
                    <article key={hi} className="flex flex-col gap-2 rounded-lg border-2 border-[#111] bg-white p-2" data-testid="builder-heat" aria-label={`${round.name} ${heatName(round, hi + 1)}`}>
                      <div className="flex items-center gap-2">
                        <input
                          aria-label={T.heatName(round.name, hi + 1)}
                          className="min-w-0 flex-1 !font-extrabold"
                          defaultValue={heatName(round, hi + 1)}
                          key={heatName(round, hi + 1)}
                          disabled={readOnly}
                          maxLength={40}
                          onBlur={(e) => e.target.value.trim() !== heatName(round, hi + 1) && change(() => renameHeat(ladder, round.id, hi + 1, e.target.value.trim() === `H${hi + 1}` ? "" : e.target.value))}
                          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                        />
                        <button type="button" className="btn !min-h-[var(--org-ctl)] !px-3" disabled={readOnly || heat.seats.length <= 0} aria-label={T.fewerSeats(round.name, hi + 1)} onClick={() => change(() => setSeatCount(ladder, round.id, hi + 1, heat.seats.length - 1))}>
                          −
                        </button>
                        <span className="min-w-14 text-center text-sm font-extrabold" data-testid="seat-count">
                          {T.seatCount(heat.seats.length)}
                        </span>
                        <button type="button" className="btn !min-h-[var(--org-ctl)] !px-3" disabled={readOnly || heat.seats.length >= 10} aria-label={T.moreSeats(round.name, hi + 1)} onClick={() => change(() => setSeatCount(ladder, round.id, hi + 1, heat.seats.length + 1))}>
                          +
                        </button>
                      </div>
                      <ul className="flex flex-col gap-1">
                        {heat.seats.map((_, si) => (
                          <SeatBox
                            key={si}
                            ladder={ladder}
                            riders={riders}
                            roundId={round.id}
                            heat={hi + 1}
                            seat={si}
                            readOnly={readOnly}
                            draggable={ri === 0}
                            sending={sending}
                            onPick={(source) => change(() => (source.type === "empty" ? clearSeat(ladder, { round: round.id, heat: hi + 1, seat: si }) : setSeat(ladder, { round: round.id, heat: hi + 1, seat: si }, source)))}
                            onSend={() => {
                              if (!sending) return;
                              const place = sending;
                              setSending(null);
                              change(() => sendPlace(ladder, place, { round: round.id, heat: hi + 1, seat: si }));
                            }}
                          />
                        ))}
                      </ul>
                      {!isFinal && round.advance > 0 ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {Array.from({ length: Math.min(round.advance, heat.seats.length) }, (_, p) => (
                            <button
                              key={p}
                              type="button"
                              className="btn !min-h-[var(--org-ctl)]"
                              disabled={readOnly}
                              aria-pressed={sending?.round === round.id && sending.heat === hi + 1 && sending.place === p + 1}
                              onClick={() => setSending(sending?.round === round.id && sending.heat === hi + 1 && sending.place === p + 1 ? null : { round: round.id, heat: hi + 1, place: p + 1 })}
                            >
                              {T.sendPlace(ordinal(p + 1))}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <ConfirmButton label={T.removeHeat} question={T.removeHeatQuestion(heatName(round, hi + 1))} confirmLabel={T.removeHeatYes} cancelLabel={copy.common.cancel} danger disabled={readOnly} onConfirm={() => change(() => removeHeat(ladder, round.id, hi + 1))} />
                    </article>
                  ))}
                  <button type="button" className="btn" disabled={readOnly} onClick={() => change(() => addHeat(ladder, round.id))}>
                    {T.addHeat}
                  </button>
                </section>
              );
            })}
          </div>
        </DndContext>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start" aria-label={T.checkerLabel} data-testid="ladder-checker">
          <div className={cn("panel flex flex-col gap-2", check.complete ? "!border-[#166534]" : "")}>
            <h3 className="text-lg font-extrabold">{T.checkerHeading}</h3>
            <p className="font-bold" role="status" data-testid="ladder-status">
              {check.complete ? `✔ ${check.status}` : check.status}
            </p>
            {check.faults.length > 0 ? (
              <ul className="flex flex-col gap-2" aria-label={T.faultsLabel}>
                {check.faults.map((f, i) => (
                  <li key={`${f.code}-${i}`} className="flex flex-col gap-1 font-semibold" data-testid="ladder-fault">
                    <span>
                      <span aria-hidden>✖ </span>
                      {f.message}
                    </span>
                    {f.fix ? <FixButton fix={f.fix} disabled={readOnly} onFix={(fix) => change(() => applyFix(ladder, riders, fix))} /> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {check.recommendations.length > 0 ? (
              <>
                <h4 className="mt-1 font-extrabold">{T.recommendationsHeading}</h4>
                <ul className="flex flex-col gap-1" aria-label={T.recommendationsLabel}>
                  {check.recommendations.map((r, i) => (
                    <li key={`${r.code}-${i}`} className="font-semibold" data-testid="ladder-recommendation">
                      <span aria-hidden>▲ </span>
                      {r.message}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <p className="text-sm font-semibold">{T.checkerNever}</p>
          </div>
          {children?.({ complete: check.complete })}
        </aside>
      </div>
    </div>
  );
}

/** A fix with two buttons only when the same fault needs one per kind (the label says which). */
function FixButton({ fix, onFix, disabled }: { fix: Fix; onFix: (f: Fix) => void; disabled?: boolean }) {
  return (
    <button type="button" className="btn !min-h-[var(--org-ctl)] w-fit" disabled={disabled} onClick={() => onFix(fix)} data-testid="ladder-fix">
      {fix.label}
    </button>
  );
}
