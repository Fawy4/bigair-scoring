"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "@/hooks/use-toast";
import { copy } from "@/lib/ui-copy";
import { deleteMasterPreset, renameMasterPreset, setMasterPresetDefault, setMasterPresetRetired } from "../actions";

const c = copy.admin.presets;
const M = c.manage;

export interface MasterListRow {
  key: string;
  name: string;
  latestVersion: number;
  hasDraft: boolean;
  retired: boolean;
  isDefault: boolean;
}

type Mode = "rename" | "delete" | null;

/** One kind's built-in presets (scoring or format) with everything the owner can do to each, one tap away. Staff see the list and Edit (drafts) only. */
export function MasterList({ kind, slug, rows, isOwner }: { kind: "scoring_model" | "format_template"; slug: string; rows: MasterListRow[]; isOwner: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<{ key: string; mode: Mode } | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState<{ key: string; kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const run = (key: string, work: () => Promise<{ ok: true; text?: string } | { ok: false; error: string }>) =>
    start(async () => {
      const res = await work();
      if (!res.ok) return setNote({ key, kind: "error", text: res.error });
      setOpen(null);
      setNote(res.text ? { key, kind: "ok", text: res.text } : null);
      if (res.text) toast({ title: res.text });
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.key} className="panel flex flex-col gap-3" data-testid={`master-${kind}-${r.key}`} data-retired={r.retired || undefined}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xl font-semibold">
                  {r.name}
                  {r.isDefault ? <span className="ml-2 rounded-[6px] border border-beach-border px-2 text-base">{M.defaultTag}</span> : null}
                  {r.retired ? <span className="ml-2 rounded-[6px] border border-beach-border px-2 text-base">{M.retiredTag}</span> : null}
                  {r.hasDraft ? <span className="ml-2 rounded-[6px] border border-beach-border px-2 text-base">{M.draftTag}</span> : null}
                </p>
                <p className="font-semibold">
                  {r.key} · v{r.latestVersion}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/admin/presets/${slug}/${encodeURIComponent(r.key)}`} className="btn" aria-label={c.edit(r.name)}>
                  {M.edit}
                </Link>
                {isOwner ? (
                  <>
                    <button type="button" className="btn" aria-expanded={open?.key === r.key && open.mode === "rename"} onClick={() => { setName(r.name); setOpen(open?.key === r.key && open.mode === "rename" ? null : { key: r.key, mode: "rename" }); }}>
                      {M.rename}
                    </button>
                    {r.retired ? (
                      <button type="button" className="btn" disabled={pending} onClick={() => run(r.key, async () => { const res = await setMasterPresetRetired({ kind, key: r.key, retired: false }); return res.ok ? { ok: true, text: M.restored(r.name) } : res; })}>
                        {M.restore}
                      </button>
                    ) : (
                      <>
                        {r.isDefault ? null : (
                          <button type="button" className="btn" disabled={pending} onClick={() => run(r.key, async () => { const res = await setMasterPresetDefault({ kind, key: r.key }); return res.ok ? { ok: true, text: M.madeDefault(r.name) } : res; })}>
                            {M.setDefault}
                          </button>
                        )}
                        <button type="button" className="btn" disabled={pending} onClick={() => run(r.key, async () => { const res = await setMasterPresetRetired({ kind, key: r.key, retired: true }); return res.ok ? { ok: true, text: M.retired(r.name) } : res; })}>
                          {M.retire}
                        </button>
                      </>
                    )}
                    <button type="button" className="btn" aria-expanded={open?.key === r.key && open.mode === "delete"} onClick={() => setOpen(open?.key === r.key && open.mode === "delete" ? null : { key: r.key, mode: "delete" })}>
                      {M.delete}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
            {open?.key === r.key && open.mode === "rename" ? (
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(r.key, async () => { const res = await renameMasterPreset({ kind, key: r.key, name }); return res.ok ? { ok: true, text: M.renamed(name.trim()) } : res; });
                }}
              >
                <div className="flex flex-col gap-1">
                  <label htmlFor={`rename-${r.key}`} className="font-semibold">
                    {M.nameLabel}
                  </label>
                  <input id={`rename-${r.key}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="w-80 max-w-full" />
                </div>
                <button type="submit" className="btn btn-primary" disabled={pending}>
                  {M.renameSave}
                </button>
              </form>
            ) : null}
            {open?.key === r.key && open.mode === "delete" ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="font-semibold">{M.deleteConfirm(r.name)}</p>
                <button type="button" className="btn btn-danger" disabled={pending} onClick={() => run(r.key, async () => { const res = await deleteMasterPreset({ kind, key: r.key }); return res.ok ? { ok: true, text: M.deleted(r.name) } : res; })}>
                  {M.deleteYes}
                </button>
                <button type="button" className="btn" onClick={() => setOpen(null)}>
                  {M.cancel}
                </button>
              </div>
            ) : null}
            {note?.key === r.key ? (
              <p role={note.kind === "error" ? "alert" : "status"} data-testid="master-note" className={note.kind === "error" ? "field-error" : "font-semibold"}>
                {note.kind === "error" ? copy.common.problem(note.text) : note.text}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <div>
        <Link href={`/admin/presets/${slug}/new`} className="btn btn-primary" data-testid={`add-${kind}`}>
          {M.add}
        </Link>
      </div>
    </div>
  );
}
