"use client";

import { useEffect, useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { heartbeatState } from "@/lib/officials/last-seen";
import { copy } from "@/lib/ui-copy";
import { deleteSeat, regeneratePin, revealPin, saveSpotterAssignment, setHeadScores, updateSeat, type IssuedPin } from "./actions";
import type { useAction } from "../riders/use-action";

const T = copy.officials;

export interface SeatRow {
  id: string;
  name: string;
  role: string;
  status: "active" | "pending";
  active: boolean;
  scores: boolean;
  bound: boolean;
  lastSeenAt: string | null;
  hasPin: boolean;
  phone: string | null;
  spotterEntries: string[] | null;
}

export interface RiderChoice {
  divisionId: string;
  divisionName: string;
  riders: Array<{ entryId: string; name: string }>;
}

/** When the seat was last seen, in words. */
export function seenText(seat: Pick<SeatRow, "bound" | "lastSeenAt">, now: Date): string {
  const h = heartbeatState(seat.lastSeenAt, now);
  if (h.kind === "never") return T.lastSeenNever;
  const when = h.kind === "recent" ? T.lastSeenRecent : T.lastSeenMinutes(h.minutes);
  return `${seat.bound && h.kind === "recent" ? T.connected : T.notConnected} · ${T.lastSeen} ${when}`;
}

export function SeatCard({ seat, eventId, now, riders, act, onIssued }: { seat: SeatRow; eventId: string; now: Date; riders: RiderChoice[]; act: ReturnType<typeof useAction>; onIssued: (i: IssuedPin) => void }) {
  const { pending, run } = act;
  const [shown, setShown] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [scores, setScores] = useState(seat.scores);
  useEffect(() => setScores(seat.scores), [seat.scores]);
  const [assigning, setAssigning] = useState(seat.spotterEntries !== null);
  const [picked, setPicked] = useState<Set<string>>(new Set(seat.spotterEntries ?? []));

  async function togglePin() {
    if (shown) return setShown(null);
    setPinError(null);
    const r = await revealPin(seat.id);
    if (r.ok) setShown(r.pin);
    else setPinError(r.error);
  }

  return (
    <li className="panel flex flex-col gap-3" data-testid="seat-card" data-seat-name={seat.name}>
      <div className="flex flex-wrap items-center gap-3">
        <input
          key={seat.name}
          aria-label={`${T.rename}: ${seat.name}`}
          defaultValue={seat.name}
          className="min-w-48 flex-1 !text-lg !font-extrabold"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== seat.name) run(() => updateSeat(seat.id, { name: v }), T.saved);
          }}
        />
        <span className="rounded border-2 border-[#111] px-2 py-1 font-bold">{T.roles[seat.role] ?? seat.role}</span>
        <span className="font-bold" data-testid="seat-status">
          {seat.active ? T.active : T.switchedOff}
        </span>
      </div>
      <p className="font-semibold" data-testid="seat-seen">
        {seenText(seat, now)}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" onClick={togglePin} disabled={pending} data-testid="show-pin" aria-pressed={Boolean(shown)}>
          {shown ? T.hidePin : T.showPin}
        </button>
        {shown ? (
          <span className="font-mono text-3xl font-extrabold tracking-[0.25em]" data-testid="shown-pin">
            {shown}
          </span>
        ) : null}
        <ConfirmButton
          label={T.regenerate}
          question={T.regenerateQuestion(seat.name)}
          confirmLabel={T.regenerateYes}
          cancelLabel={copy.common.cancel}
          pending={pending}
          onConfirm={() => {
            setShown(null);
            run(() => regeneratePin(seat.id), undefined, (r) => onIssued(r.issued));
          }}
        />
        <a className="btn" href={`/org/events/${eventId}/officials/cards?seat=${seat.id}`} target="_blank" rel="noopener noreferrer">
          {T.printOne}
        </a>
      </div>
      {pinError ? (
        <p role="alert" className="field-error">
          {copy.common.problem(pinError)}
        </p>
      ) : null}

      {seat.role === "head" ? (
        <span className="flex items-start gap-2">
          <label className="flex items-center gap-3 font-bold">
            <input type="checkbox" checked={scores} disabled={pending} onChange={(e) => { setScores(e.target.checked); run(() => setHeadScores(seat.id, e.target.checked), T.saved); }} />
            {T.headAlsoScores}
          </label>
        </span>
      ) : null}

      {seat.role === "spotter" ? (
        <details open={assigning} data-testid="spotter-assignment">
          <summary className="cursor-pointer font-bold">{assigning ? T.spotterAssigned : T.spotterFree}</summary>
          <div className="mt-2 flex flex-col gap-2">
            <p className="font-semibold">{T.spotterHelp}</p>
            <label className="flex items-center gap-3 font-bold">
              <input type="radio" name={`spot-${seat.id}`} checked={!assigning} onChange={() => { setAssigning(false); run(() => saveSpotterAssignment(seat.id, null), T.spotterSaved); }} />
              {T.spotterFree}
            </label>
            <label className="flex items-center gap-3 font-bold">
              <input type="radio" name={`spot-${seat.id}`} checked={assigning} onChange={() => setAssigning(true)} />
              {T.spotterAssigned}
            </label>
            {assigning ? (
              <>
                {riders.map((d) => (
                  <fieldset key={d.divisionId} className="flex flex-col gap-1">
                    <legend className="font-bold">{d.divisionName}</legend>
                    {d.riders.map((r) => (
                      <label key={r.entryId} className="flex items-center gap-3 font-semibold">
                        <input type="checkbox" checked={picked.has(r.entryId)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(r.entryId); else n.delete(r.entryId); return n; })} />
                        {r.name}
                      </label>
                    ))}
                  </fieldset>
                ))}
                <div>
                  <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => saveSpotterAssignment(seat.id, [...picked]), T.spotterSaved)}>
                    {copy.common.save} · {T.spotterRiders(picked.size)}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </details>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn" disabled={pending} onClick={() => run(() => updateSeat(seat.id, { active: !seat.active }), T.saved)}>
          {seat.active ? T.deactivate : T.activate}
        </button>
        <ConfirmButton label={T.delete} question={T.deleteQuestion(seat.name)} confirmLabel={T.deleteYes} cancelLabel={copy.common.cancel} pending={pending} danger onConfirm={() => run(() => deleteSeat(seat.id), T.deleted)} />
      </div>
    </li>
  );
}
