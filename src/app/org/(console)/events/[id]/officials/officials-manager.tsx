"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { panelShortfalls } from "@/lib/officials/panel-check";
import { copy } from "@/lib/ui-copy";
import { addSeat, approveSeat, declineSeat, savePanel, type IssuedPin } from "./actions";
import { Button, disabledWhen } from "@/components/org/button";
import { OfficialsTable } from "./officials-table";
import { PinBox } from "./pin-box";
import { SeatCard, type RiderChoice, type SeatRow } from "./seat-card";
import { useAction } from "../riders/use-action";

const T = copy.officials;

export interface PanelRow {
  id: string;
  name: string;
  minJudges: number;
  hasScoringModel: boolean;
  seatIds: string[];
}

export function OfficialsManager({ eventId, eventName, seats, panels, riders, colours }: { eventId: string; eventName: string; seats: SeatRow[]; panels: PanelRow[]; riders: RiderChoice[]; colours: Array<{ key: string; label: string }> }) {
  const act = useAction();
  const { pending, error, setError, run } = act;
  const [issued, setIssued] = useState<IssuedPin | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState<"judge" | "head" | "spotter" | "announcer">("judge");
  const [headScores, setHeadScores] = useState(true);
  const [now, setNow] = useState(() => new Date());
  // a tick shows at once; the server's answer replaces it when the page data comes back
  const [ticks, setTicks] = useState<Record<string, string[]>>({});
  useEffect(() => setTicks({}), [panels]);

  // "last seen" stays fresh: the page asks again every 30 seconds while it is open
  useEffect(() => {
    const t = setInterval(() => act.run(async () => ({ ok: true as const })), 30_000);
    const tick = setInterval(() => setNow(new Date()), 10_000);
    return () => {
      clearInterval(t);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = seats.filter((s) => s.status === "active");
  const pendingSeats = seats.filter((s) => s.status === "pending");
  const scorers = active.filter((s) => s.role === "judge" || s.role === "head");
  const shown = useMemo(() => panels.map((p) => ({ ...p, seatIds: ticks[p.id] ?? p.seatIds })), [panels, ticks]);
  const shortfalls = useMemo(() => panelShortfalls(shown.filter((p) => p.hasScoringModel).map((p) => ({ name: p.name, minJudges: p.minJudges, assigned: p.seatIds.length }))), [shown]);

  return (
    <div className="flex flex-col gap-6">
      {issued ? <PinBox issued={issued} eventName={eventName} onClose={() => setIssued(null)} /> : null}
      {error ? (
        <p role="alert" className="panel field-error">
          {copy.common.problem(error)}{" "}
          <button type="button" className="btn ml-2" onClick={() => setError(null)}>
            {copy.common.dismiss}
          </button>
        </p>
      ) : null}

      <section className="flex flex-col gap-3 rounded-card border border-beach-line p-4" aria-labelledby="add-seat-h">
        <h2 id="add-seat-h">
          {T.addHeading}
        </h2>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addSeat({ eventId, name, role, headAlsoScores: role === "head" ? headScores : undefined }), undefined, (r) => {
              setIssued(r.issued);
              setName("");
            });
          }}
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="seat-name" className="text-small font-semibold">
              {T.name}
            </label>
            <input id="seat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={T.namePlaceholder} className="w-64" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="seat-role" className="text-small font-semibold">
              {T.role}
            </label>
            <select id="seat-role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
              {Object.entries(T.roles).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {role === "head" ? (
            <label className="flex items-center gap-3 font-semibold">
              <input type="checkbox" checked={headScores} onChange={(e) => setHeadScores(e.target.checked)} />
              {T.headAlsoScores}
            </label>
          ) : null}
          <Button type="submit" variant="secondary" {...disabledWhen(pending ? copy.common.saving : name.trim().length < 2 && copy.divisions.nameTooShort)} data-testid="add-seat">
            {T.add}
          </Button>
        </form>
        {role === "head" ? <p className="text-sm font-semibold">{T.headAlsoScoresHelp}</p> : null}
      </section>

      {pendingSeats.length > 0 ? (
        <section className="panel flex flex-col gap-3" aria-labelledby="pending-h" data-testid="pending-seats">
          <h2 id="pending-h" className="text-xl font-semibold">
            {T.pendingHeading}
          </h2>
          <ul className="flex flex-col gap-3">
            {pendingSeats.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-beach-line p-3" data-testid="pending-seat">
                <span className="text-lg font-semibold">{s.name}</span>
                <span className="font-semibold">{T.pendingLine(T.roles[s.role] ?? s.role, s.phone)}</span>
                <span className="font-semibold">{T.statusPending}</span>
                <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => approveSeat(s.id), undefined, (r) => setIssued(r.issued))}>
                  {T.approve}
                </button>
                <button type="button" className="btn" disabled={pending} onClick={() => run(() => declineSeat(s.id), T.declined)}>
                  {T.decline}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="seats-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="seats-h">{copy.wizard.steps.officials.replace(/^\d+\.\s*/, "")}</h2>
          {active.length > 0 ? (
            <Button variant="quiet" href={`/org/events/${eventId}/officials/cards`} target="_blank" data-testid="print-cards">
              {T.printAll}
            </Button>
          ) : null}
        </div>
        <OfficialsTable seats={active} now={now} act={act} />
        {active.length > 0 ? <h3 className="pt-2">{T.cardsHeading}</h3> : null}
        <ul className="flex flex-col gap-3">
          {active.map((s) => (
            <SeatCard key={s.id} seat={s} eventId={eventId} now={now} riders={riders} colours={colours} act={act} onIssued={setIssued} />
          ))}
        </ul>
      </section>

      <section className="panel flex flex-col gap-3" aria-labelledby="panels-h" data-testid="panels">
        <h2 id="panels-h" className="text-xl font-semibold">
          {T.panelsHeading}
        </h2>
        <p className="font-semibold">{T.panelsHelp}</p>
        {shown.length === 0 ? <p className="font-semibold">{T.panelsNoDivisions}</p> : scorers.length === 0 ? <p className="font-semibold">{T.panelsNoJudges}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="border border-beach-line bg-beach-surface p-2 text-left">{T.role}</th>
                  {shown.map((p) => (
                    <th key={p.id} className="border border-beach-line bg-beach-surface p-2 text-left">
                      <span className="block">{p.name}</span>
                      <span className="block text-sm font-semibold" data-testid={`panel-count-${p.name}`}>
                        {T.panelCount(p.seatIds.length, p.minJudges)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scorers.map((s) => (
                  <tr key={s.id}>
                    <th scope="row" className="border border-beach-line p-2 text-left">
                      {s.name} <span className="font-semibold">({T.roles[s.role]})</span>
                    </th>
                    {shown.map((p) => {
                      const on = p.seatIds.includes(s.id);
                      return (
                        <td key={p.id} className="border border-beach-line p-2 text-center">
                          <input
                            type="checkbox"
                            aria-label={`${s.name}: ${p.name}`}
                            checked={on}
                            disabled={pending}
                            className="h-6 w-6"
                            onChange={(e) => {
                              const next = scorers.filter((x) => (x.id === s.id ? e.target.checked : p.seatIds.includes(x.id))).map((x) => x.id);
                              setTicks((t) => ({ ...t, [p.id]: next }));
                              run(() => savePanel(p.id, next), T.panelsSaved);
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {shortfalls.length > 0 ? (
          <div role="note" data-testid="panel-warnings" className="rounded-lg border border-beach-line p-3">
            <p className="font-semibold">⚠ {T.shortfallHeading}</p>
            <ul className="list-disc pl-6 font-semibold">
              {shortfalls.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : shown.some((p) => p.hasScoringModel) && scorers.length > 0 ? (
          <p className="font-semibold" data-testid="panel-ok">
            {T.panelsOk}
          </p>
        ) : null}
        <p className="text-sm font-semibold">
          <Link href={`/org/events/${eventId}/divisions`} className="underline">
            {copy.wizard.steps.divisions}
          </Link>
        </p>
      </section>
    </div>
  );
}
