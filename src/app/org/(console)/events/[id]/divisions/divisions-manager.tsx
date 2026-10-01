"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";
import type { PresetRow } from "@/lib/presets/options";
import type { IdentificationScheme } from "@/lib/schemas/identification";
import type { LocalBlock, VocabularyJson } from "@/lib/trick-base";
import { copy } from "@/lib/ui-copy";
import { addDivision, deleteDivision, duplicateDivision, moveDivision, renameDivision, saveDivisionDescription } from "./actions";
import { DivisionIdentification } from "./division-identification";
import { LiveSettingsPanel } from "./live-settings-panel";
import { TrickBasePanel } from "./trick-base-panel";
import { RulesPanel } from "./rules-panel";

export interface DivisionRow {
  id: string;
  name: string;
  sort_order: number;
  scoring_model_id: string | null;
  scoring_overrides: unknown;
  format_template_id: string | null;
  format_params: unknown;
  /** The level, shown on the registration page. */
  description: string | null;
  /** The division's own Rider label scheme; null = the event's. */
  identification: { scheme: IdentificationScheme; basedOn?: string } | null;
  trickBase: unknown;
  /** `divisions.live_settings`: percentages and the heat-end summary card. */
  liveSettings: unknown;
  /** A heat of this division has started (trick base blocks can then be added but not removed). */
  started: boolean;
  /** Any heat exists (a division with heats cannot be deleted). */
  hasHeats: boolean;
  /** A heat has started and nobody unlocked the rules. */
  locked: boolean;
  /** The division's confirmed riders in seed order (the custom ladder builder names seats after them). */
  riders: Array<{ id: string; name: string }>;
  /** The draw is locked (Draw step). */
  drawLocked: boolean;
}

/** The categories the division's scoring model names (for the Trick base panel). */
function categoriesOf(model: PresetRow | undefined): Array<{ key: string; label: string }> {
  const list = (model?.json as { categories?: Array<{ key?: unknown; label?: unknown }> } | undefined)?.categories;
  return Array.isArray(list) ? list.flatMap((c) => (typeof c.key === "string" ? [{ key: c.key, label: typeof c.label === "string" ? c.label : c.key }] : [])) : [];
}

type Tab = "scoring" | "format" | "identification" | "trickbase";

export function DivisionsManager({
  eventId,
  organisationId,
  eventScheme,
  allowOverride,
  schemes,
  vocabulary,
  localBlocks: initialLocalBlocks,
  initialDivisions,
  initialScoring,
  initialFormats,
}: {
  eventId: string;
  organisationId: string;
  eventScheme: IdentificationScheme;
  allowOverride: boolean;
  schemes: IdentificationScheme[];
  vocabulary: VocabularyJson | null;
  localBlocks: LocalBlock[];
  initialDivisions: DivisionRow[];
  initialScoring: PresetRow[];
  initialFormats: PresetRow[];
}) {
  const router = useRouter();
  const [divisions, setDivisions] = useState(initialDivisions);
  const [scoring, setScoring] = useState(initialScoring);
  const [localBlocks, setLocalBlocks] = useState(initialLocalBlocks);
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
      setDivisions((ds) => [...ds, { id: res.id, name: newName.trim(), sort_order: res.sortOrder, scoring_model_id: null, scoring_overrides: {}, format_template_id: null, format_params: {}, description: null, identification: null, trickBase: {}, liveSettings: {}, started: false, hasHeats: false, locked: false, riders: [], drawLocked: false }]);
      setOpenId(res.id);
      setNewName("");
      toast({ title: copy.divisions.added });
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
      setDivisions((ds) => [...ds, { ...src, id: res.id, name: res.name, sort_order: Math.max(...ds.map((d) => d.sort_order)) + 1, started: false, hasHeats: false, locked: false, riders: [], drawLocked: false }]);
      setOpenId(res.id);
      toast({ title: copy.divisions.duplicated(res.name) });
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
      toast({ title: copy.divisions.deleted });
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
      toast({ title: copy.divisions.renamed });
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p role="alert" className="panel field-error">
          {copy.common.problem(error)}
        </p>
      ) : null}

      {sorted.length === 0 ? <p className="panel text-lg font-semibold">{copy.divisions.none}</p> : null}

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
                    aria-label={copy.divisions.nameOf(i + 1)}
                    value={renaming[d.id] ?? d.name}
                    onChange={(e) => setRenaming((r) => ({ ...r, [d.id]: e.target.value }))}
                    onBlur={() => renaming[d.id] !== undefined && renaming[d.id].trim() !== d.name && rename(d.id)}
                    className="min-w-0 flex-1 !text-lg !font-extrabold"
                  />
                </div>
                <button type="button" className="btn" disabled={pending || i === 0} aria-label={copy.divisions.moveUp(d.name)} onClick={() => move(d.id, -1)}>
                  {copy.common.up}
                </button>
                <button type="button" className="btn" disabled={pending || i === sorted.length - 1} aria-label={copy.divisions.moveDown(d.name)} onClick={() => move(d.id, 1)}>
                  {copy.common.down}
                </button>
                <button type="button" className="btn" disabled={pending} onClick={() => duplicate(d.id)}>
                  {copy.divisions.duplicate}
                </button>
                {confirmDelete === d.id ? (
                  <>
                    <button type="button" className="btn btn-danger" disabled={pending} onClick={() => remove(d.id)}>
                      {copy.divisions.confirmDelete(d.name)}
                    </button>
                    <button type="button" className="btn" onClick={() => setConfirmDelete(null)}>
                      {copy.common.cancel}
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn btn-danger" disabled={pending || d.hasHeats} title={d.hasHeats ? copy.divisions.hasHeatsTitle : undefined} onClick={() => setConfirmDelete(d.id)}>
                    {copy.divisions.delete}
                  </button>
                )}
                <button type="button" className="btn btn-primary" aria-expanded={open} onClick={() => setOpenId(open ? null : d.id)}>
                  {open ? copy.common.close : copy.divisions.editRules}
                </button>
              </div>
              {d.hasHeats ? <p className="font-semibold">{copy.divisions.hasHeats}</p> : null}
              <div className="flex flex-col gap-1">
                <label htmlFor={`desc-${d.id}`} className="font-bold">
                  {copy.divisions.descriptionLabel}
                </label>
                <input
                  id={`desc-${d.id}`}
                  key={d.description ?? ""}
                  defaultValue={d.description ?? ""}
                  maxLength={300}
                  placeholder={copy.divisions.descriptionPlaceholder}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v === (d.description ?? "")) return;
                    start(async () => {
                      const res = await saveDivisionDescription(d.id, v);
                      if (!res.ok) return fail(res.error);
                      setDivisions((ds) => ds.map((x) => (x.id === d.id ? { ...x, description: v || null } : x)));
                      toast({ title: copy.divisions.descriptionSaved });
                    });
                  }}
                />
                <p className="text-sm font-semibold">{copy.divisions.descriptionHint}</p>
              </div>
              <p className="font-semibold">
                {copy.divisions.summary(sModel ? sModel.name : copy.divisions.notChosen, fTemplate ? fTemplate.name : copy.divisions.notChosen, d.locked)}
              </p>

              {open ? (
                <div className="flex flex-col gap-4 border-t-2 border-[#111] pt-4">
                  <div role="tablist" aria-label={copy.divisions.tabsLabel(d.name)} className="flex gap-2">
                    {(["scoring", "format", "identification", "trickbase"] as const).map((t) => (
                      <button key={t} type="button" role="tab" aria-selected={tab === t} className={`btn ${tab === t ? "btn-primary" : ""}`} onClick={() => setTab(t)}>
                        {t === "scoring" ? copy.divisions.tabScoring : t === "format" ? copy.divisions.tabFormat : t === "identification" ? copy.divisions.tabIdentification : copy.divisions.tabTrickBase}
                      </button>
                    ))}
                  </div>
                  {tab === "scoring" ? (
                    <RulesPanel
                      key={`s-${d.id}`}
                      eventId={eventId}
                      kind="scoring_model"
                      division={d}
                      presets={scoring}
                      organisationId={organisationId}
                      onPresetAdded={(row) => setScoring((s) => [...s, row])}
                      onDivisionChange={(p) => patch(d.id, p)}
                      advancedExtra={<LiveSettingsPanel key={`l-${d.id}`} divisionId={d.id} initial={d.liveSettings} readOnly={false} />}
                    />
                  ) : tab === "trickbase" ? (
                    vocabulary ? (
                      <TrickBasePanel
                        key={`t-${d.id}`}
                        eventId={eventId}
                        divisionId={d.id}
                        vocabulary={vocabulary}
                        localBlocks={localBlocks}
                        onBlockAdded={(b) => setLocalBlocks((l) => [...l, b])}
                        trickBase={d.trickBase}
                        started={d.started}
                        modelCategories={categoriesOf(sModel)}
                      />
                    ) : (
                      <p className="panel font-semibold">{copy.trickBase.errors.noVocabulary}</p>
                    )
                  ) : tab === "identification" ? (
                    <DivisionIdentification
                      key={`i-${d.id}`}
                      eventId={eventId}
                      divisionId={d.id}
                      organisationId={organisationId}
                      eventScheme={eventScheme}
                      allowOverride={allowOverride}
                      presets={schemes}
                      initial={d.identification}
                      onSaved={(stored) => setDivisions((ds) => ds.map((x) => (x.id === d.id ? { ...x, identification: stored } : x)))}
                    />
                  ) : (
                    <RulesPanel
                      key={`f-${d.id}`}
                      eventId={eventId}
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
          <label htmlFor="new-division">{copy.divisions.newName}</label>
          <input id="new-division" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={copy.divisions.newPlaceholder} className="w-72" />
        </div>
        <button type="submit" className="btn btn-primary" disabled={pending || newName.trim().length < 2}>
          {copy.divisions.add}
        </button>
      </form>
    </div>
  );
}
