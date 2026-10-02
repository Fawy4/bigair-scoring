"use client";

import { DndContext, pointerWithin, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { useState } from "react";
import { RiderLabel } from "@/components/rider-label";
import { heatLabel, placeholderText, provisionalSeat, type DivisionDraw, type DrawHeat, type DrawRound, type Slot } from "@/lib/engine/ladder";
import type { IdentificationScheme } from "@/lib/schemas/identification";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const T = copy.draw.ladder;

export interface SeatKey {
  heatId: string;
  slot: number;
}
export const seatId = (k: SeatKey) => `${k.heatId}:${k.slot}`;
export const parseSeatId = (id: string): SeatKey => {
  const at = id.lastIndexOf(":");
  return { heatId: id.slice(0, at), slot: Number(id.slice(at + 1)) };
};
const sameSeat = (a: SeatKey | null, b: SeatKey) => Boolean(a) && a!.heatId === b.heatId && a!.slot === b.slot;

export interface LadderProps {
  draw: DivisionDraw;
  scheme: IdentificationScheme;
  /** Print and read-only views pass false: no buttons, no dragging. */
  editable: boolean;
  picked?: SeatKey | null;
  target?: SeatKey | null;
  menuSeat?: SeatKey | null;
  onSeat?: (seat: SeatKey) => void;
  onMenu?: (seat: SeatKey) => void;
  onMove?: (from: SeatKey, to: SeatKey) => void;
  renderHeatExtra?: (round: DrawRound, heat: DrawHeat) => React.ReactNode;
  renderRoundHeader?: (round: DrawRound) => React.ReactNode;
  renderHeatTitle?: (round: DrawRound, heat: DrawHeat) => React.ReactNode;
}

const riderOf = (draw: DivisionDraw, slot: Slot) => draw.entrants.find((e) => e.id === slot.entrantId);

function SeatBody({ draw, scheme, round, slot, compact }: { draw: DivisionDraw; scheme: IdentificationScheme; round: DrawRound; slot: Slot; compact?: boolean }) {
  const rider = riderOf(draw, slot);
  if (rider) {
    return (
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <RiderLabel scheme={scheme} size="sm" rider={{ name: rider.name, identifiers: rider.identifiers, slotColour: slot.vestColour }} />
        {slot.modifier === "DNS" ? <span className="badge-note">{T.walkover}</span> : null}
        {slot.manual ? <span className="badge-note">{T.byHand}</span> : null}
        {rider.withdrawn && slot.modifier !== "DNS" ? <span className="badge-note">{T.withdrawn}</span> : null}
      </span>
    );
  }
  if (slot.from) {
    // a round that re-seeds from all its arrivals deals later, but the seat can already say who is on the way
    const coming = provisionalSeat(draw, round, slot);
    if (coming) return <span className={cn("font-extrabold", compact ? "text-base" : "text-lg")} data-testid="placeholder" data-provisional="true">{T.seatPending(coming.name, coming.placeholder)}</span>;
    return <span className={cn("font-extrabold", compact ? "text-base" : "text-lg")} data-testid="placeholder">{placeholderText(draw, slot.from, round.id)}</span>;
  }
  return <span className="font-semibold italic" data-testid="empty-seat">{T.emptySeat}</span>;
}

function Seat({ draw, scheme, round, heat, index, editable, picked, target, menuSeat, onSeat, onMenu }: { draw: DivisionDraw; scheme: IdentificationScheme; round: DrawRound; heat: DrawHeat; index: number } & Pick<LadderProps, "editable" | "picked" | "target" | "menuSeat" | "onSeat" | "onMenu">) {
  const slot = heat.slots[index];
  const key: SeatKey = { heatId: heat.id, slot: index };
  const canEdit = editable && heat.status === "pending";
  const hasRider = Boolean(slot.entrantId);
  const drag = useDraggable({ id: seatId(key), disabled: !canEdit || !hasRider });
  const drop = useDroppable({ id: seatId(key), disabled: !canEdit });
  const isPicked = sameSeat(picked ?? null, key);
  const isTarget = sameSeat(target ?? null, key);
  return (
    <li
      ref={(el) => {
        drop.setNodeRef(el);
      }}
      data-testid="seat"
      data-seat={seatId(key)}
      data-state={isPicked ? "picked" : isTarget ? "target" : drop.isOver ? "over" : "idle"}
      className={cn(
        "flex items-center gap-2 rounded-lg border-2 px-2 py-1",
        isPicked ? "border-[#111] bg-[#fde68a]" : isTarget ? "border-[#111] bg-[#bfdbfe]" : drop.isOver ? "border-[#111] bg-[#e5e7eb]" : "border-[#111] bg-white",
        !slot.entrantId && !slot.from ? "border-dashed" : "",
      )}
    >
      <span className="w-6 shrink-0 text-center text-sm font-extrabold" aria-hidden>
        {index + 1}
      </span>
      {canEdit ? (
        <button
          {...drag.listeners}
          {...drag.attributes}
          ref={drag.setNodeRef}
          type="button"
          className={cn("min-h-[44px] min-w-0 flex-1 cursor-pointer text-left", drag.isDragging ? "opacity-40" : "")}
          aria-pressed={isPicked}
          aria-label={T.seatLabel(heatLabel(heat), index + 1, riderOf(draw, slot)?.name ?? (slot.from ? placeholderText(draw, slot.from, round.id) : T.emptySeat))}
          onClick={() => onSeat?.(key)}
        >
          <SeatBody draw={draw} scheme={scheme} round={round} slot={slot} />
        </button>
      ) : (
        <div className="min-h-[44px] min-w-0 flex-1 py-1">
          <SeatBody draw={draw} scheme={scheme} round={round} slot={slot} />
        </div>
      )}
      {canEdit ? (
        <button type="button" className="btn !min-h-[var(--org-ctl)] !px-3" aria-label={T.seatMenu(heatLabel(heat), index + 1)} aria-expanded={sameSeat(menuSeat ?? null, key)} onClick={() => onMenu?.(key)}>
          ⋯
        </button>
      ) : null}
    </li>
  );
}

function HeatCard(props: LadderProps & { round: DrawRound; heat: DrawHeat }) {
  const { round, heat } = props;
  const pending = heat.status === "pending";
  return (
    <section
      className={cn("flex w-72 shrink-0 flex-col gap-2 rounded-xl border-2 border-[#111] bg-white p-2", !pending ? "bg-[#f3f4f6]" : "")}
      aria-label={heatLabel(heat)}
      data-testid="heat-card"
      data-heat={heat.id}
      data-status={heat.status}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h4 className="min-w-0 flex-1 text-lg font-extrabold">{props.renderHeatTitle ? props.renderHeatTitle(round, heat) : heatLabel(heat)}</h4>
        <span className="text-sm font-bold">{T.heatTiming(heat.durationMin, heat.warmUpMin ?? 0)}</span>
      </header>
      <div className="flex flex-wrap gap-1">
        {heat.manualOverride ? <span className="badge-note" data-testid="by-hand">{T.byHand}</span> : null}
        {heat.status === "running" ? <span className="badge-note">{T.started}</span> : null}
        {heat.status === "published" ? <span className="badge-note">{T.finished}</span> : null}
      </div>
      <ol className="flex flex-col gap-1">
        {heat.slots.map((_, i) => (
          <Seat key={i} {...props} heat={heat} index={i} />
        ))}
      </ol>
      {props.renderHeatExtra ? props.renderHeatExtra(round, heat) : null}
    </section>
  );
}

/** The ladder: rounds as columns, heats as cards, every seat showing its Rider label or the place it waits for ("1st H1", "1st R2 H3"). */
export function Ladder(props: LadderProps) {
  const { draw, editable } = props;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [dragging, setDragging] = useState<SeatKey | null>(null);
  const onStart = (e: DragStartEvent) => setDragging(parseSeatId(String(e.active.id)));
  const onEnd = (e: DragEndEvent) => {
    setDragging(null);
    if (!e.over || e.active.id === e.over.id) return;
    props.onMove?.(parseSeatId(String(e.active.id)), parseSeatId(String(e.over.id)));
  };
  const columns = (
    <div className="flex items-start gap-4 overflow-x-auto pb-3" data-testid="ladder">
      {draw.rounds.map((round) => (
        <div key={round.id} className="flex shrink-0 flex-col gap-2" data-testid="round-column" data-round={round.id}>
          <div className="flex flex-wrap items-center gap-2">
            {props.renderRoundHeader ? props.renderRoundHeader(round) : <h3 className="text-xl font-extrabold">{round.name}</h3>}
            {round.arranged ? <span className="badge-note" data-testid="round-by-hand">{T.byHand}</span> : null}
          </div>
          <p className="text-sm font-bold">{T.roundSummary(round.heats.filter((h) => !h.bye).length, round.heats.reduce((n, h) => n + h.slots.length, 0))}</p>
          {round.heats.length === 0 ? <p className="w-72 rounded-lg border-2 border-dashed border-[#111] p-3 font-semibold">{T.noHeats}</p> : null}
          {round.heats.map((heat) => (
            <HeatCard key={heat.id} {...props} round={round} heat={heat} />
          ))}
        </div>
      ))}
    </div>
  );
  if (!editable) return columns;
  const dragged = dragging ? draw.rounds.flatMap((r) => r.heats.filter((h) => h.id === dragging.heatId).map((h) => ({ r, h })))[0] : null;
  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setDragging(null)}>
      {columns}
      <DragOverlay>
        {dragged ? (
          <div className="rounded-lg border-2 border-[#111] bg-white p-2 shadow-lg">
            <SeatBody draw={draw} scheme={props.scheme} round={dragged.r} slot={dragged.h.slots[dragging!.slot]} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
