"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";
import type { PresetRow } from "@/lib/presets/options";
import { addDivision, deleteDivision, duplicateDivision, moveDivision, renameDivision } from "./actions";
import { RulesPanel } from "./rules-panel";

export interface DivisionRow {
  id: string;
  name: string;
  sort_order: number;
  scoring_model_id: string | null;
  scoring_overrides: unknown;
  format_template_id: string | null;
  format_params: unknown;
  /** Any heat exists (a division with heats cannot be deleted). */
  hasHeats: boolean;
  /** A heat has started and nobody unlocked the rules. */
  locked: boolean;
}

type Tab = "scoring" | "format";

export function DivisionsManager({
  eventId,
  organisationId,
  initialDivisions,
  initialScoring,
  initialFormats,
}: {
  eventId: string;
  organisationId: string;
  initialDivisions: DivisionRow[];
  initialScoring: PresetRow[];
  initialFormats: PresetRow[];
}) {
  const router = useRouter();
  const [divisions, setDivisions] = useState(initialDivisions);
  const [scoring, setScoring] = useState(initialScoring);
  const [formats, setFormats] = useState(initialFormats);
  const [openId, setOpenId] = useState<string | null>(initialDivisions[0]?.id ?? null);
  const [tab, setTab] = useState<Tab>("scoring");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const patch = (id: string, p: Partial<DivisionRow>) => {
    setDivisions((ds) => ds.map((d) => (d.id === id ? { ...d, ...p } : d)));
    router.refresh(); // the left rail's "what is missing" list follows
  };
  const fail = (text: string) => setError(text);
  const sorted = [...divisions].sort((a, b) => a.sort_order - b.sort_order);

  function add() {
    setError(null);
    start(async () => {
      const res = await addDivision(eventId, newName);
      if (!res.ok) return fail(res.error);
      setDivisions((ds) => [...ds, { id: res.id, name: newName.trim(), sort_order: res.sortOrder, scoring_model_id: null, scoring_overrides: {}, format_template_id: null, format_params: {}, hasHeats: false, locked: false }]);
      setOpenId(res.id);
      setNewName("");
      toast({ title: "Division added" });
      router.refresh();
    });
  }

  function move(id: string, dir: -1 | 1) {
    setError(null);
    start(async () => {
      const res = await moveDivision(id, dir);
      if (!res.ok) return fail(res.error);
      setDivisions((ds) => ds.map((d) => ({ ...d, sort_order: res.order.indexOf(d.id) + 1 })));
    });
  }

  function duplicate(id: string) {
    setError(null);
    start(async () => {
      const res = await duplicateDivision(id);
      if (!res.ok) return fail(res.error);
      const src = divisions.find((d) => d.id === id)!;
      setDivisions((ds) => [...ds, { ...src, id: res.id, name: res.name, sort_order: Math.max(...ds.map((d) => d.sort_order)) + 1, hasHeats: false, locked: false }]);
      setOpenId(res.id);
      toast({ title: `Duplicated as “${res.name}”` });
      router.refresh();
    });
  }

  function remove(id: string) {
    setError(null);
    setConfirmDelete(null);
    start(async () => {
      const res = await deleteDivision(id);
      if (!res.ok) return fail(res.error);
      setDivisions((ds) => ds.filter((d) => d.id !== id));
      if (openId === id) setOpenId(null);
      toast({ title: "Division deleted" });
      router.refresh();
    });
  }

  function rename(id: string) {
    const name = renaming[id];
    if (name === undefined) return;
    setError(null);
    start(async () => {
      const res = await renameDivision(id, name);
      if (!res.ok) return fail(res.error);
      setDivisions((ds) => ds.map((d) => (d.id === id ? { ...d, name: name.trim() } : d)));
      setRenaming(({ [id]: _gone, ...rest }) => {
        void _gone;
        return rest;
      });
      toast({ title: "Division renamed" });
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p role="alert" className="panel field-error">
          ✖ {error}
        </p>
      ) : null}

      {sorted.length === 0 ? <p className="panel text-lg font-semibold">No divisions yet. Add the first one below (for example “Pro Men”).</p> : null}

      <ol className="flex flex-col gap-4">
        {sorted.map((d, i) => {
          const open = openId === d.id;
          const sModel = scoring.find((p) => p.id === d.scoring_model_id);
          const fTemplate = formats.find((p) => p.id === d.format_template_id);
          return (
            <li key={d.id} className="panel flex flex-col gap-4" data-testid="division-card">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-lg font-extrabold">{i + 1}.</span>
                <div className="flex min-w-56 flex-1 items-center gap-2">
                  <input
                    aria-label={`Name of division ${i + 1}`}
                    value={renaming[d.id] ?? d.name}
                    onChange={(e) => setRenaming((r) => ({ ...r, [d.id]: e.target.value }))}
                    onBlur={() => renaming[d.id] !== undefined && renaming[d.id].trim() !== d.name && rename(d.id)}
                    className="min-w-0 flex-1 !text-lg !font-extrabold"
                  />
                </div>
                <button type="button" className="btn" disabled={pending || i === 0} aria-label={`Move ${d.name} up`} onClick={() => move(d.id, -1)}>
                  ↑
                </button>
                <button type="button" className="btn" disabled={pending || i === sorted.length - 1} aria-label={`Move ${d.name} down`} onClick={() => move(d.id, 1)}>
                  ↓
                </button>
                <button type="button" className="btn" disabled={pending} onClick={() => duplicate(d.id)}>
                  Duplicate
                </button>
                {confirmDelete === d.id ? (
                  <>
                    <button type="button" className="btn btn-danger" disabled={pending} onClick={() => remove(d.id)}>
                      Yes, delete {d.name}
                    </button>
                    <button type="button" className="btn" onClick={() => setConfirmDelete(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn btn-danger" disabled={pending || d.hasHeats} title={d.hasHeats ? "This division already has heats" : undefined} onClick={() => setConfirmDelete(d.id)}>
                    Delete
                  </button>
                )}
                <button type="button" className="btn btn-primary" aria-expanded={open} onClick={() => setOpenId(open ? null : d.id)}>
                  {open ? "Close" : "Edit scoring & format"}
                </button>
              </div>
              {d.hasHeats ? <p className="font-semibold">This division has heats, so it cannot be deleted.</p> : null}
              <p className="font-semibold">
                Scoring: <strong>{sModel ? sModel.name : "not chosen yet"}</strong> · Format: <strong>{fTemplate ? fTemplate.name : "not chosen yet"}</strong>
                {d.locked ? " · 🔒 locked" : ""}
              </p>

              {open ? (
                <div className="flex flex-col gap-4 border-t-2 border-[#111] pt-4">
                  <div role="tablist" aria-label={`${d.name} settings`} className="flex gap-2">
                    {(["scoring", "format"] as const).map((t) => (
                      <button key={t} type="button" role="tab" aria-selected={tab === t} className={`btn ${tab === t ? "btn-primary" : ""}`} onClick={() => setTab(t)}>
                        {t === "scoring" ? "Scoring" : "Format"}
                      </button>
                    ))}
                  </div>
                  {tab === "scoring" ? (
                    <RulesPanel
                      key={`s-${d.id}`}
                      kind="scoring_model"
                      division={d}
                      presets={scoring}
                      organisationId={organisationId}
                      onPresetAdded={(row) => setScoring((s) => [...s, row])}
                      onDivisionChange={(p) => patch(d.id, p)}
                    />
                  ) : (
                    <RulesPanel
                      key={`f-${d.id}`}
                      kind="format_template"
                      division={d}
                      presets={formats}
                      organisationId={organisationId}
                      onPresetAdded={(row) => setFormats((s) => [...s, row])}
                      onDivisionChange={(p) => patch(d.id, p)}
                    />
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      <form
        className="panel flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="new-division">New division name</label>
          <input id="new-division" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Pro Men" className="w-72" />
        </div>
        <button type="submit" className="btn btn-primary" disabled={pending || newName.trim().length < 2}>
          + Add division
        </button>
      </form>
    </div>
  );
}
