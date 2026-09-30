"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "@/hooks/use-toast";
import { FEEDBACK_TAGS } from "@/lib/feedback/format";
import type { NoteRow } from "@/lib/feedback/load";
import { copy } from "@/lib/ui-copy";
import { updateNote } from "./manage-actions";

const T = copy.feedback;
const th = "border-2 border-[#111] bg-[#eee] p-2 text-left";
const td = "border-2 border-[#111] p-2 align-top";

/** The notes as a table; the owner can also change a note's kind and mark it done or open again. */
export function NotesList({ notes, canManage }: { notes: NoteRow[]; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const change = (id: string, patch: { status?: "open" | "done"; tag?: string }) => {
    setError(null);
    start(async () => {
      const r = await updateNote(id, patch);
      if (r.ok) {
        toast({ title: T.updated });
        router.refresh();
      } else setError(r.error);
    });
  };

  if (notes.length === 0) return <p className="panel font-semibold" data-testid="no-notes">{T.listNone}</p>;
  return (
    <div className="flex flex-col gap-3">
      {error ? <p role="alert" className="panel field-error">{copy.common.problem(error)}</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" data-testid="notes">
          <thead>
            <tr>
              <th className={th}>{T.columns.note}</th>
              <th className={th}>{T.columns.tag}</th>
              <th className={th}>{T.columns.status}</th>
              <th className={th}>{T.columns.where}</th>
              <th className={th}>{T.columns.who}</th>
              <th className={th}>{T.columns.when}</th>
              <th className={th}>{T.columns.exported}</th>
              {canManage ? <th className={th}>{T.columns.actions}</th> : null}
            </tr>
          </thead>
          <tbody>
            {notes.map((n) => (
              <tr key={n.id} data-testid="note-row" className={n.status === "done" ? "opacity-70" : ""}>
                <td className={td}>
                  <p className="max-w-md whitespace-pre-wrap font-semibold">{n.body}</p>
                  {n.screenshotUrl ? (
                    <a href={n.screenshotUrl} target="_blank" rel="noopener noreferrer" className="font-bold underline">
                      {T.screenshotLink}
                    </a>
                  ) : null}
                </td>
                <td className={td}>
                  {canManage ? (
                    <select aria-label={`${T.changeTag}: ${n.body.slice(0, 30)}`} value={n.tag} disabled={pending} onChange={(e) => change(n.id, { tag: e.target.value })}>
                      {FEEDBACK_TAGS.map((t) => (
                        <option key={t} value={t}>
                          {T.tags[t]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    T.tags[n.tag]
                  )}
                </td>
                <td className={`${td} font-bold`}>{T.statuses[n.status]}</td>
                <td className={td}>{[n.pageLabel, n.organisationName, n.eventName, n.divisionName, n.heatLabel].filter(Boolean).join(" · ")}</td>
                <td className={td}>{T.roles[n.role] ?? n.role}</td>
                <td className={td}>{n.createdAt.slice(0, 10)}</td>
                <td className={td}>{n.exportedAt ? T.exportedOn(n.exportedAt.slice(0, 10)) : T.notExported}</td>
                {canManage ? (
                  <td className={td}>
                    <button type="button" className="btn" disabled={pending} onClick={() => change(n.id, { status: n.status === "open" ? "done" : "open" })}>
                      {n.status === "open" ? T.markDone : T.reopen}
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
