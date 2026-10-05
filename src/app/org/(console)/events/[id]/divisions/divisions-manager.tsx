"use client";

import { ResetDivisionButton } from "../reset-buttons";
import { useState, useTransition } from "react";
import { saveMasterPreset } from "@/app/admin/actions";
import { useRefreshSoon } from "@/lib/use-refresh-soon";
import { toast } from "@/hooks/use-toast";
import type { PresetRow } from "@/lib/presets/options";
import type { IdentificationScheme } from "@/lib/schemas/identification";
import type { LocalBlock, VocabularyJson } from "@/lib/trick-base";
import { ChevronDown, ChevronUp, Copy, Trash2 } from "lucide-react";
import { Button, disabledWhen } from "@/components/org/button";
import { EmptyState } from "@/components/org/data-table";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";
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
  hiddenBuiltIns,
  defaultBuiltIns,
  canSaveAsBuiltIn,
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
  /** Built-in presets this organisation hid from its Load… menus (by key), and the owner's DEFAULT built-in of each kind. */
  hiddenBuiltIns: { scoring_model: string[]; format_template: string[] };
  defaultBuiltIns: { scoring_model: string | null; format_template: string | null };
  /** The platform owner is opened as this organisation: "Save as built-in" is offered next to "Save as preset". */
  canSaveAsBuiltIn?: boolean;
}) {
  const refreshSoon = useRefreshSoon();
  const [divisions, setDivisions] = useState(initialDivisions);
  const [scoring, setScoring] = useState(initialScoring);
  const [localBlocks, setLocalBlocks] = useState(initialLocalBlocks);
  const [formats, setFormats] = useState(initialFormats);
  const [hidden, setHidden] = useState(hiddenBuiltIns);
  const [openId, setOpenId] = useState<string | null>(initialDivisions[0]?.id ?? null);
  const [tab, setTab] = useState<Tab>("scoring");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const patch = (id: string, p: Partial<DivisionRow>) => {
    setDivisions((ds) => ds.map((d) => (d.id === id ? { ...d, ...p } : d)));
    refreshSoon(); // the left rail's "what is missing" list follows
  };
  const fail = (text: string) => setError(text);
  const saveBuiltIn = async (kind: "scoring_model" | "format_template", name: string, json: unknown) => {
    const res = await saveMasterPreset({ kind, key: null, name, json });
    return res.ok ? { ok: true as const, message: copy.rules.builtInSaved(name.trim()) } : { ok: false as const, error: res.error };
  };
  const sorted = [...divisions].sort((a, b) => a.sort_order - b.sort_order);

  function add() {
    setError(null);
    start(async () => {
      const res = await addDivision(eventId, newName);
      if (!res.ok) return fail(res.error);
      setDivisions((ds) => [...ds, { id: res.id, name: newName.trim(), sort_order: res.sortOrder, scoring_model_id: res.scoringModelId, scoring_overrides: {}, format_template_id: null, format_params: {}, description: null, identification: null, trickBase: {}, liveSettings: {}, started: false, hasHeats: false, locked: false, riders: [], drawLocked: false }]);
      setOpenId(res.id);
      setNewName("");
      toast({ title: copy.divisions.added });
      refreshSoon();
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
      refreshSoon();
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
      refreshSoon();
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
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="rounded-card border border-beach-failed p-3 text-body font-semibold text-beach-failed">
          {copy.common.problem(error)}
        </p>
      ) : null}

      {sorted.length === 0 ? <EmptyState title={copy.divisions.none} body={copy.divisions.noneBody} /> : null}

      <ol className="flex flex-col gap-3">
        {sorted.map((d, i) => {
          const open = openId === d.id;
          const sModel = scoring.find((p) => p.id === d.scoring_model_id);
          const fTemplate = formats.find((p) => p.id === d.format_template_id);
          const tabName = (t: Tab) => (t === "scoring" ? copy.divisions.tabScoring : t === "format" ? copy.divisions.tabFormat : t === "identification" ? copy.divisions.tabIdentification : copy.divisions.tabTrickBase);
          return (
            <li key={d.id} className="flex flex-col rounded-card border border-beach-line bg-beach-bg" data-testid="division-card">
              <div className="flex flex-wrap items-center gap-2 p-3">
                <span className="w-6 text-body font-semibold text-beach-muted">{i + 1}.</span>
                <input
                  aria-label={copy.divisions.nameOf(i + 1)}
                  value={renaming[d.id] ?? d.name}
                  onChange={(e) => setRenaming((r) => ({ ...r, [d.id]: e.target.value }))}
                  onBlur={() => renaming[d.id] !== undefined && renaming[d.id].trim() !== d.name && rename(d.id)}
                  className="min-w-56 max-w-md flex-1 !font-semibold"
                />
                <div className="ml-auto flex flex-wrap items-center gap-1">
                  <Button variant="quiet" iconOnly icon={ChevronUp} aria-label={copy.divisions.moveUp(d.name)} {...disabledWhen(pending ? copy.common.saving : i === 0 && copy.divisions.firstDivision)} onClick={() => move(d.id, -1)} />
                  <Button variant="quiet" iconOnly icon={ChevronDown} aria-label={copy.divisions.moveDown(d.name)} {...disabledWhen(pending ? copy.common.saving : i === sorted.length - 1 && copy.divisions.lastDivision)} onClick={() => move(d.id, 1)} />
                  <Button variant="quiet" icon={Copy} {...disabledWhen(pending && copy.common.saving)} onClick={() => duplicate(d.id)}>
                    {copy.divisions.duplicate}
                  </Button>
                  {confirmDelete === d.id ? (
                    <>
                      <Button variant="danger" icon={Trash2} {...disabledWhen(pending && copy.common.saving)} onClick={() => remove(d.id)}>
                        {copy.divisions.confirmDelete(d.name)}
                      </Button>
                      <Button variant="quiet" onClick={() => setConfirmDelete(null)}>
                        {copy.common.cancel}
                      </Button>
                    </>
                  ) : (
                    <Button variant="quiet" icon={Trash2} {...disabledWhen(pending ? copy.common.saving : d.hasHeats && copy.divisions.hasHeatsTitle)} onClick={() => setConfirmDelete(d.id)}>
                      {copy.divisions.delete}
                    </Button>
                  )}
                  <Button variant={open ? "secondary" : "primary"} aria-expanded={open} onClick={() => setOpenId(open ? null : d.id)}>
                    {open ? copy.common.close : copy.divisions.editRules}
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-2 px-3 pb-3">
                <p className="text-small font-medium text-beach-muted">
                  {copy.divisions.summary(sModel ? sModel.name : copy.divisions.notChosen, fTemplate ? fTemplate.name : copy.divisions.notChosen, d.locked)}
                  {d.hasHeats ? ` ${copy.divisions.hasHeats}` : ""}
                </p>
                <ResetDivisionButton divisionId={d.id} name={d.name} hasHeats={d.hasHeats} />
                <div className="flex flex-col gap-1">
                  <label htmlFor={`desc-${d.id}`} className="text-small font-semibold">
                    {copy.divisions.descriptionLabel}
                  </label>
                  <input
                    id={`desc-${d.id}`}
                    key={d.description ?? ""}
                    defaultValue={d.description ?? ""}
                    maxLength={300}
                    placeholder={copy.divisions.descriptionPlaceholder}
                    className="max-w-xl"
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
                  <p className="text-small font-medium text-beach-muted">{copy.divisions.descriptionHint}</p>
                </div>
              </div>

              {open ? (
                <div className="flex flex-col gap-3 border-t border-beach-line p-3">
                  <div role="tablist" aria-label={copy.divisions.tabsLabel(d.name)} className="flex flex-wrap gap-1 border-b border-beach-line">
                    {(["scoring", "format", "identification", "trickbase"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        role="tab"
                        aria-selected={tab === t}
                        className={cn("-mb-px min-h-[var(--org-ctl)] border-b px-3 text-body font-semibold", tab === t ? "border-beach-accent text-beach-ink" : "border-transparent text-beach-muted hover:text-beach-ink")}
                        onClick={() => setTab(t)}
                      >
                        {tabName(t)}
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
                      onPresetsChange={setScoring}
                      saveAsBuiltIn={canSaveAsBuiltIn ? saveBuiltIn : undefined}
                      hiddenKeys={hidden.scoring_model}
                      onHiddenChange={(keys) => setHidden((h) => ({ ...h, scoring_model: keys }))}
                      defaultKey={defaultBuiltIns.scoring_model}
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
                      <p className="rounded-card border border-beach-line p-3 text-body font-semibold">{copy.trickBase.errors.noVocabulary}</p>
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
                      onPresetsChange={setFormats}
                      saveAsBuiltIn={canSaveAsBuiltIn ? saveBuiltIn : undefined}
                      hiddenKeys={hidden.format_template}
                      onHiddenChange={(keys) => setHidden((h) => ({ ...h, format_template: keys }))}
                      defaultKey={defaultBuiltIns.format_template}
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
        className="flex flex-wrap items-end gap-3 rounded-card border border-beach-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="new-division" className="text-small font-semibold">{copy.divisions.newName}</label>
          <input id="new-division" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={copy.divisions.newPlaceholder} className="w-72" />
        </div>
        <Button type="submit" variant="secondary" {...disabledWhen(pending ? copy.common.saving : newName.trim().length < 2 && copy.divisions.nameTooShort)}>
          {copy.divisions.add}
        </Button>
      </form>
    </div>
  );
}
