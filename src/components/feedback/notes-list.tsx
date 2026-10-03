"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "@/hooks/use-toast";
import { FEEDBACK_TAGS } from "@/lib/feedback/format";
import type { NoteRow } from "@/lib/feedback/load";
import { copy } from "@/lib/ui-copy";
import { updateNote, updateNotes } from "./manage-actions";

const T = copy.feedback;
const th = "border border-beach-line bg-beach-surface p-2 text-left";
const td = "border border-beach-line p-2 align-top";

/** The notes as a table; the owner can also change a note's kind and mark it done or open again. */
export function NotesList({ notes, canManage }: { notes: NoteRow[]; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [asking, setAsking] = useState<"done" | "open" | null>(null);
  const [changed, setChanged] = useState<number | null>(null);
  // only notes that are still in the filtered list count as selected (a filter change or a refresh drops the rest)
  const ids = notes.map((n) => n.id);
  const chosen = ids.filter((id) => selected.has(id));
  const allChosen = ids.length > 0 && chosen.length === ids.length;
  const toggle = (id: string) =>
    setSelected((old) => {
      const next = new Set(old);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const bulk = (status: "open" | "done") => {
    setError(null);
    start(async () => {
      const r = await updateNotes(chosen, status);
      setAsking(null);
      if (r.ok) {
        setChanged(r.changed);
        setSelected(new Set());
        router.refresh();
      } else setError(r.error);
    });
  };

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
      {canManage ? (
        <div className="panel flex flex-wrap items-center gap-3" data-testid="bulk-bar">
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" data-testid="select-all" checked={allChosen} onChange={() => setSelected(allChosen ? new Set() : new Set(ids))} />
            {T.selectAll}
          </label>
          <span className="font-semibold" data-testid="selected-count">
            {T.selectedCount(chosen.length)}
          </span>
          {asking ? (
            <span className="flex flex-wrap items-center gap-2" data-testid="bulk-ask">
              <span className="font-semibold">{asking === "done" ? T.bulkAskDone(chosen.length) : T.bulkAskReopen(chosen.length)}</span>
              <button type="button" className="btn btn-primary" disabled={pending} data-testid="bulk-yes" onClick={() => bulk(asking)}>
                {T.bulkYes}
              </button>
              <button type="button" className="btn" disabled={pending} data-testid="bulk-no" onClick={() => setAsking(null)}>
                {T.bulkNo}
              </button>
            </span>
          ) : (
            <>
              <button type="button" className="btn" disabled={pending || chosen.length === 0} data-testid="bulk-done" onClick={() => (setChanged(null), setAsking("done"))}>
                {T.bulkDone}
              </button>
              <button type="button" className="btn" disabled={pending || chosen.length === 0} data-testid="bulk-reopen" onClick={() => (setChanged(null), setAsking("open"))}>
                {T.bulkReopen}
              </button>
            </>
          )}
          {changed !== null ? (
            <span role="status" className="font-semibold" data-testid="bulk-result">
              {T.bulkChanged(changed)}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" data-testid="notes">
          <thead>
            <tr>
              {canManage ? <th className={th} aria-label={T.selectAll} /> : null}
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
                {canManage ? (
                  <td className={td}>
                    <input type="checkbox" data-testid="note-select" aria-label={T.selectNote(n.body.slice(0, 30))} checked={selected.has(n.id)} onChange={() => toggle(n.id)} />
                  </td>
                ) : null}
                <td className={td}>
                  <p className="max-w-md whitespace-pre-wrap font-semibold">{n.body}</p>
                  {n.screenshotUrl ? (
                    <a href={n.screenshotUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
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
                <td className={`${td} font-semibold`}>{T.statuses[n.status]}</td>
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
