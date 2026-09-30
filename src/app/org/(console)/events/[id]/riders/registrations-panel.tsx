"use client";

import { useState } from "react";
import { copy } from "@/lib/ui-copy";
import { decideRegistration } from "./actions";
import { fullName, type EntryRow } from "./types";
import { useAction } from "./use-action";

const T = copy.riders;

/** Registrations from the public page: Approve makes the rider confirmed, Decline keeps an optional reason. */
export function RegistrationsPanel({ entries }: { entries: EntryRow[] }) {
  const { pending, error, run } = useAction();
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const waiting = entries.filter((e) => e.status === "registered");
  const declined = entries.filter((e) => e.status === "declined");

  return (
    <section className="panel flex flex-col gap-3" aria-labelledby="regs-h" data-testid="registrations-panel">
      <h2 id="regs-h" className="text-xl font-extrabold">
        {T.registrationsHeading}
      </h2>
      {waiting.length === 0 ? <p className="font-semibold">{T.registrationsNone}</p> : <p className="font-bold">{T.registrationsWaiting(waiting.length)}</p>}
      {error ? <p role="alert" className="field-error">{copy.common.problem(error)}</p> : null}
      <ul className="flex flex-col gap-3">
        {waiting.map((e) => (
          <li key={e.id} className="flex flex-col gap-2 rounded-lg border-2 border-[#111] p-3" data-testid="registration">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-lg font-extrabold">{fullName(e)}</span>
              <span className="font-semibold">{[e.nationality, e.email, e.phone, e.sponsor].filter(Boolean).join(" · ")}</span>
              {e.photoLink ? (
                <a href={e.photoLink} target="_blank" rel="noopener noreferrer" className="font-bold underline">
                  {copy.registration.photo}
                </a>
              ) : null}
              <span className="text-sm font-semibold">{T.registeredOn(e.createdAt.slice(0, 10))}</span>
            </div>
            {e.identifiers.kite || e.identifiers.rashguard_colour ? (
              <p className="font-semibold">
                {[e.identifiers.kite ? [e.identifiers.kite.brand, e.identifiers.kite.model, e.identifiers.kite.size, e.identifiers.kite.colours].filter(Boolean).join(" ") : "", e.identifiers.rashguard_colour ? `${copy.riderLabel.rashguard}: ${e.identifiers.rashguard_colour}` : ""].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            {declining === e.id ? (
              <div role="group" aria-label={T.decline} className="flex flex-col gap-2">
                <label htmlFor={`reason-${e.id}`} className="font-bold">
                  {T.declineReason}
                </label>
                <input id={`reason-${e.id}`} value={reason} onChange={(ev) => setReason(ev.target.value)} maxLength={300} className="max-w-md" />
                <div className="flex flex-wrap gap-3">
                  <button type="button" className="btn btn-danger" disabled={pending} onClick={() => run(() => decideRegistration(e.id, "decline", reason), T.declined, () => { setDeclining(null); setReason(""); })}>
                    {T.declineConfirm}
                  </button>
                  <button type="button" className="btn" onClick={() => setDeclining(null)}>
                    {copy.common.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => decideRegistration(e.id, "approve"), T.approved)}>
                  {T.approve}
                </button>
                <button type="button" className="btn" disabled={pending} onClick={() => { setDeclining(e.id); setReason(""); }}>
                  {T.decline}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {declined.length > 0 ? (
        <details>
          <summary className="cursor-pointer font-bold">{T.declinedHeading(declined.length)}</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {declined.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 font-semibold">
                <span className="font-bold">{fullName(e)}</span>
                {e.declineReason ? <span>{e.declineReason}</span> : null}
                <button type="button" className="btn" disabled={pending} onClick={() => run(() => decideRegistration(e.id, "approve"), T.approved)}>
                  {T.approve}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
