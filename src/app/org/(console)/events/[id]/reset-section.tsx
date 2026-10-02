"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "@/hooks/use-toast";
import { copy } from "@/lib/ui-copy";

const T = copy.resetParts;

/** What the confirmation shows: the sentence of what will happen, anything that blocks it (each with its fix), a note, and whether a written reason is needed. */
export interface SectionView {
  lines: string[];
  blockers: string[];
  note?: string;
  reasonNeeded: boolean;
}

/**
 * One reset button with one confirmation, for a part of the event (a division, a run order). It loads what the reset would do (from the database or from
 * what the screen already has), shows it, and runs once. A reset the database refuses leaves the button where it is and says why, with the fix.
 */
export function ResetSection({
  testId,
  openLabel,
  title,
  intro,
  confirmLabel,
  load,
  run,
  idleReason,
}: {
  testId: string;
  openLabel: string;
  title: string;
  intro: string;
  confirmLabel: string;
  load: () => Promise<{ ok: true; view: SectionView } | { ok: false; error: string }>;
  run: (reason: string | undefined) => Promise<{ ok: true; message: string } | { ok: false; error: string }>;
  /** When there is nothing to reset: the button stays, off, and says so. */
  idleReason?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<SectionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const close = () => {
    setOpen(false);
    setData(null);
    setReason("");
    setError(null);
  };
  const begin = () => {
    setOpen(true);
    setError(null);
    start(async () => {
      const r = await load();
      if (r.ok) setData(r.view);
      else setError(r.error);
    });
  };
  const confirm = () =>
    start(async () => {
      setError(null);
      const r = await run(data?.reasonNeeded ? reason : undefined);
      if (r.ok) {
        toast({ title: r.message });
        close();
        router.refresh();
      } else setError(r.error);
    });

  if (idleReason) {
    return (
      <div className="flex flex-col items-start gap-1">
        <button type="button" className="btn" disabled data-testid={`${testId}-open`} aria-describedby={`${testId}-why`}>
          {openLabel}
        </button>
        <p id={`${testId}-why`} className="text-small font-medium">
          {idleReason}
        </p>
      </div>
    );
  }
  if (!open) {
    return (
      <button type="button" className="btn btn-danger" onClick={begin} data-testid={`${testId}-open`}>
        {openLabel}
      </button>
    );
  }
  const blocked = Boolean(data && data.blockers.length > 0);
  const needReason = Boolean(data?.reasonNeeded && reason.trim().length < 5);
  return (
    <div data-testid={`${testId}-panel`} role="group" aria-label={title} className="panel flex w-full flex-col gap-3 border-2">
      <h4 className="font-extrabold">{title}</h4>
      <p className="font-medium">{intro}</p>
      {!data && !error ? <p className="font-medium">{T.loading}</p> : null}
      {data ? (
        <>
          {data.lines.map((l) => (
            <p key={l} className="font-semibold" data-testid={`${testId}-line`}>
              {l}
            </p>
          ))}
          {data.note ? (
            <p data-testid={`${testId}-note`} className="font-bold">
              {data.note}
            </p>
          ) : null}
          {blocked ? (
            <div role="alert" data-testid={`${testId}-blocked`} className="flex flex-col gap-1 font-semibold">
              <p>{T.blocked}</p>
              <ul className="list-disc pl-6">
                {data.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {data.reasonNeeded ? (
            <div className="flex flex-col gap-1">
              <label htmlFor={`${testId}-reason`} className="font-bold">
                {T.reasonLabel}
              </label>
              <p className="text-small font-medium">{T.reasonWhy}</p>
              <input id={`${testId}-reason`} data-testid={`${testId}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full max-w-xl" />
            </div>
          ) : null}
        </>
      ) : null}
      {error ? (
        <p role="alert" data-testid={`${testId}-error`} className="font-bold">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-start gap-2">
        <button type="button" className="btn btn-danger" onClick={confirm} data-testid={`${testId}-confirm`} disabled={!data || pending || blocked || needReason} aria-describedby={`${testId}-confirm-why`}>
          {pending ? T.working : confirmLabel}
        </button>
        <button type="button" className="btn" onClick={close}>
          {copy.common.cancel}
        </button>
      </div>
      {!data || pending || blocked || needReason ? (
        <p id={`${testId}-confirm-why`} className="text-small font-medium">
          {!data ? T.loading : pending ? T.working : blocked ? T.blocked : T.needReason}
        </p>
      ) : null}
    </div>
  );
}
