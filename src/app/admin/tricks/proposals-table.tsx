"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { toast } from "@/hooks/use-toast";
import { copy } from "@/lib/ui-copy";
import { acceptTrickProposal, dismissTrickProposal } from "../actions";

const T = copy.trickBase.admin;
const th = "border border-beach-line bg-beach-surface p-2 text-left";
const td = "border border-beach-line p-2 align-top";

interface Row {
  eventId: string;
  eventName: string;
  organisationName: string;
  family: string;
  key: string;
  label: string;
}

export function ProposalsTable({ rows, isOwner }: { rows: Row[]; isOwner: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: true; label?: string } | { ok: false; error: string }>, message: (label?: string) => string) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast({ title: message(r.label) });
        router.refresh();
      } else setError(r.error);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="panel field-error">
          {copy.common.problem(error)}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" data-testid="proposals">
          <thead>
            <tr>
              <th className={th}>{T.columns.block}</th>
              <th className={th}>{T.columns.family}</th>
              <th className={th}>{T.columns.event}</th>
              <th className={th}>{T.columns.organisation}</th>
              <th className={th}>{T.columns.actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.eventId}-${r.family}-${r.key}`} data-testid="proposal">
                <td className={`${td} font-semibold`}>{r.label}</td>
                <td className={td}>{copy.trickBase.families[r.family as keyof typeof copy.trickBase.families] ?? r.family}</td>
                <td className={td}>{r.eventName}</td>
                <td className={td}>{r.organisationName}</td>
                <td className={td}>
                  {isOwner ? (
                    <div className="flex flex-col gap-2">
                      <ConfirmButton
                        label={T.accept}
                        question={T.acceptQuestion(r.label)}
                        confirmLabel={T.acceptYes}
                        cancelLabel={copy.common.cancel}
                        pending={pending}
                        onConfirm={() => run(() => acceptTrickProposal({ eventId: r.eventId, family: r.family, key: r.key }), (l) => T.accepted(l ?? r.label))}
                      />
                      <button type="button" className="btn" disabled={pending} onClick={() => run(() => dismissTrickProposal({ eventId: r.eventId, family: r.family, key: r.key }), () => T.dismissed)}>
                        {T.dismiss}
                      </button>
                    </div>
                  ) : (
                    <span className="font-semibold">{T.ownerOnly}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
