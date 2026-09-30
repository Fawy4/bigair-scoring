"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { FieldLabel, HelpButton } from "@/components/help-button";
import { LadderDiagram } from "@/components/ladder-diagram";
import { SchemaForm, type NewItem, type SelectOptions } from "@/components/schema-form/schema-form";
import { toast } from "@/hooks/use-toast";
import { issuesToMap } from "@/lib/form/path";
import { advanceTargets, newCustomFormat, newRound } from "@/lib/format-ui/custom";
import { previewFormat } from "@/lib/format-ui/preview";
import { exportPreset, type PresetKind } from "@/lib/presets/io";
import { presetGroups, type PresetRow } from "@/lib/presets/options";
import { FormatTemplateSchema, type FormatTemplate } from "@/lib/schemas/format-template";
import { ScoringModelSchema } from "@/lib/schemas/scoring-model";
import { friendlyMessage, schemaToNodes } from "@/lib/schema-form/nodes";
import { describeScoringModel } from "@/lib/scoring-ui/describe";
import { diffOverrides, FORMAT_NULLABLE, mergeOverrides, sameOverrides, SCORING_NULLABLE } from "@/lib/scoring-ui/overrides";
import { copy, FORMAT_HIDDEN, FORMAT_LABELS, help, SCORING_HIDDEN, SCORING_LABELS } from "@/lib/ui-copy";
import { importPreset, savePreset, saveDivisionRules, unlockRules } from "./actions";
import type { DivisionRow } from "./divisions-manager";
import { FormatSimple, ladderKindOf } from "./format-simple";
import { ScoringSimple } from "./scoring-simple";

const R = copy.rules;

/** Settings the Simple part of the screen already shows; "Show all settings" adds everything else below them. */
const SCORING_SIMPLE_PATHS = ["heat.maxAttemptsPerRider", "panel.minJudges", "panel.aggregate"];
const FORMAT_SIMPLE_PATHS = [
  "generator.params.heatSize",
  "generator.params.minHeatSize",
  "generator.params.maxHeatSize",
  "generator.params.secondChancePlaces",
  "generator.params.uneven",
  "generator.params.advancePerHeat",
  "generator.params.finalSize",
  "generator.params.finalists",
  "generator.params.r1HeatSize",
  "generator.params.earlyMin",
  "generator.params.semiMin",
  "generator.params.finalMin",
  "generator.params.r1Min",
  "generator.params.repMin",
  "generator.params.koMin",
  "generator.params.poolMin",
  "timing.defaultBreakAfterHeatMin",
  "timing.defaultBreakAfterRoundMin",
];
const scoringNodes = schemaToNodes(ScoringModelSchema, SCORING_LABELS, SCORING_HIDDEN);
const formatNodes = schemaToNodes(FormatTemplateSchema, FORMAT_LABELS, FORMAT_HIDDEN);

type Message = { kind: "ok" | "error"; text: string; problems?: string[] } | null;

function parseWith(kind: PresetKind, json: unknown) {
  return (kind === "scoring_model" ? ScoringModelSchema : FormatTemplateSchema).safeParse(json);
}

/** One rules editor for either the scoring model or the format of a division (docs/06 §1 step 2). */
export function RulesPanel({
  kind,
  division,
  presets,
  organisationId,
  onPresetAdded,
  onDivisionChange,
}: {
  kind: PresetKind;
  division: DivisionRow;
  presets: PresetRow[];
  organisationId: string;
  onPresetAdded: (row: PresetRow) => void;
  onDivisionChange: (patch: Partial<DivisionRow>) => void;
}) {
  const scoring = kind === "scoring_model";
  const nullable = scoring ? SCORING_NULLABLE : FORMAT_NULLABLE;
  const savedPresetId = scoring ? division.scoring_model_id : division.format_template_id;
  const savedOverrides = scoring ? division.scoring_overrides : division.format_params;

  const [presetId, setPresetId] = useState<string | null>(savedPresetId);
  const [custom, setCustom] = useState(false); // an unsaved custom ladder
  const [showAll, setShowAll] = useState(false);
  const [riders, setRiders] = useState(14);
  const [message, setMessage] = useState<Message>(null);
  const [presetName, setPresetName] = useState("");
  const [reason, setReason] = useState("");
  const [pasted, setPasted] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  const baseRow = presets.find((p) => p.id === presetId) ?? null;
  const baseParsed = useMemo(() => {
    if (!baseRow) return null;
    const r = parseWith(kind, baseRow.json);
    return r.success ? (r.data as Record<string, unknown>) : null;
  }, [baseRow, kind]);

  const [working, setWorking] = useState<unknown>(() => {
    if (!baseParsed) return null;
    const merged = parseWith(kind, mergeOverrides(baseParsed, savedOverrides, nullable));
    return merged.success ? merged.data : baseParsed;
  });

  const locked = division.locked;
  const check = useMemo(() => (working ? parseWith(kind, working) : null), [working, kind]);
  const errors = useMemo(() => (check && !check.success ? issuesToMap(check.error.issues) : {}), [check]);
  const valid = Boolean(check?.success);
  const overrides = useMemo(() => (baseParsed && working ? diffOverrides(baseParsed, working, nullable) : {}), [baseParsed, working, nullable]);
  const unsaved = presetId !== savedPresetId || !sameOverrides(overrides, savedOverrides);

  const groups = presetGroups(presets, presetId);
  const model = check?.success && scoring ? (check.data as Parameters<typeof describeScoringModel>[0]) : null;
  const template = check?.success && !scoring ? (check.data as FormatTemplate) : null;
  const preview = useMemo(() => (template ? previewFormat(template, riders) : null), [template, riders]);
  const isFixed = !scoring && ladderKindOf(working) === "custom";
  // the single settings' heat length of every round of the preview (without the per-round overrides)
  const defaultLengths = useMemo(() => {
    if (!template || isFixed) return new Map<string, number>();
    const plain = previewFormat({ ...template, roundDurationMin: undefined }, riders);
    return new Map(plain.rounds.map((r) => [r.id, Number(r.heatMin.split("–")[0])]));
  }, [template, isFixed, riders]);
  const perRound = (preview?.rounds ?? []).filter((r) => r.heats > 0).map((r) => ({ id: r.id, shortName: r.shortName, name: r.name, defaultMin: defaultLengths.get(r.id) ?? Number(r.heatMin.split("–")[0]) }));

  function choose(id: string) {
    const row = presets.find((p) => p.id === id);
    const parsed = row ? parseWith(kind, row.json) : null;
    setPresetId(id || null);
    setCustom(false);
    setMessage(null);
    setWorking(parsed?.success ? parsed.data : null);
  }

  function report(res: { ok: boolean; error?: string; problems?: string[] }, okText: string) {
    if (res.ok) {
      setMessage({ kind: "ok", text: okText });
      toast({ title: okText });
    } else setMessage({ kind: "error", text: res.error ?? copy.divisions.errors.failed, problems: res.problems });
  }

  function saveForDivision() {
    if (!presetId) return;
    setMessage(null);
    start(async () => {
      const res = await saveDivisionRules({ divisionId: division.id, kind, presetId, overrides });
      if (res.ok) onDivisionChange(scoring ? { scoring_model_id: presetId, scoring_overrides: overrides } : { format_template_id: presetId, format_params: overrides });
      report(res, R.savedFor(scoring ? "scoring" : "format", division.name));
    });
  }

  function saveAsPreset(newVersion: boolean) {
    setMessage(null);
    start(async () => {
      const name = newVersion ? (baseRow?.name ?? presetName) : presetName;
      const res = await savePreset({ kind, organisationId, name, json: working, newVersionOfKey: newVersion ? baseRow?.key : undefined });
      if (!res.ok) return report(res, "");
      onPresetAdded(res.row);
      const applied = await saveDivisionRules({ divisionId: division.id, kind, presetId: res.row.id, overrides: {} });
      if (applied.ok) {
        onDivisionChange(scoring ? { scoring_model_id: res.row.id, scoring_overrides: {} } : { format_template_id: res.row.id, format_params: {} });
        setPresetId(res.row.id);
        setCustom(false);
        setPresetName("");
      }
      report(applied, newVersion ? R.versionSavedUsing(res.row.name, res.row.version, division.name) : R.presetSavedUsing(res.row.name, division.name));
    });
  }

  function doImport(text: string) {
    setMessage(null);
    start(async () => {
      const res = await importPreset({ kind, organisationId, text });
      if (!res.ok) return report(res, "");
      onPresetAdded(res.row);
      choose(res.row.id);
      setShowPaste(false);
      setPasted("");
      report({ ok: true }, R.imported(res.row.name));
    });
  }

  function download() {
    if (!working) return;
    const { filename, text } = exportPreset(working, baseRow?.name ?? copy.presets.exportName);
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function unlock() {
    start(async () => {
      const res = await unlockRules(division.id, reason);
      if (res.ok) {
        onDivisionChange({ locked: false });
        setReason("");
      }
      report(res, R.unlocked);
    });
  }

  const selectOptions: SelectOptions = (pattern, root, path) => {
    const r = root as { categories?: Array<{ key: string }>; rounds?: Array<{ id: string }> };
    if (pattern === "heat.counting.perCategoryMax") return (r.categories ?? []).map((c) => c.key);
    const ids = (r.rounds ?? []).map((x) => x.id);
    if (pattern === "rounds.*.advance.*.to") return advanceTargets(ids, ids[Number(path[1])] ?? "");
    if (pattern === "rounds.*.crossHeat.to") return ids;
    if (pattern === "rounds.*.entrantsFrom.*.round") return ids.filter((id) => id !== ids[Number(path[1])]);
    if (pattern === "flagOut.rounds.*") return ids.length ? ids : null;
    return null;
  };

  const newItem: NewItem = (pattern, root) => {
    const rounds = ((root as { rounds?: Array<{ id: string }> }).rounds ?? []).map((r) => r.id);
    if (pattern === "rounds") return newRound(rounds, rounds[rounds.length - 1] ?? null);
    if (pattern === "rounds.*.advance") return { places: "rest", to: "eliminated" };
    return undefined;
  };

  const owned = baseRow?.organisation_id === organisationId;
  const setValue = (v: unknown) => {
    setWorking(v);
    setMessage(null);
  };
  const noun = scoring ? "scoring" : "format";
  const idSuffix = `${kind}-${division.id}`;

  return (
    <section className="flex flex-col gap-5" aria-label={`${scoring ? copy.divisions.tabScoring : copy.divisions.tabFormat}: ${division.name}`}>
      {locked ? (
        <div className="panel flex flex-col gap-3" role="note">
          <p className="text-lg font-bold">{R.lockedTitle}</p>
          <p className="font-semibold">{R.lockedText}</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={`reason-${idSuffix}`}>{R.reason}</label>
              <input id={`reason-${idSuffix}`} value={reason} onChange={(e) => setReason(e.target.value)} className="w-96 max-w-full" />
            </div>
            <button type="button" className="btn btn-danger" disabled={pending || reason.trim().length < 5} onClick={unlock}>
              {R.unlock}
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <FieldLabel htmlFor={`preset-${idSuffix}`} text={scoring ? R.scoringPreset : R.formatPreset} help={help[scoring ? "scoring.preset" : "format.preset"]} />
        <select id={`preset-${idSuffix}`} value={custom ? "" : (presetId ?? "")} disabled={locked} onChange={(e) => choose(e.target.value)}>
          <option value="">{custom ? R.customUnsaved : copy.common.choose}</option>
          {groups.organisation.length > 0 ? (
            <optgroup label={R.myPresets}>
              {groups.organisation.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ) : null}
          <optgroup label={R.builtIn}>
            {groups.system.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </optgroup>
        </select>
        {baseRow && baseParsed && typeof baseParsed.description === "string" ? <p className="text-sm font-semibold">{baseParsed.description}</p> : null}
      </div>

      {model ? (
        <p className="panel text-lg font-bold" data-testid="model-sentence" aria-live="polite">
          {describeScoringModel(model)}
        </p>
      ) : null}

      {working ? (
        <div className="flex flex-col gap-1">
          <span className="flex items-start gap-2">
            <label className="flex items-center gap-3 font-bold">
              <input type="checkbox" checked={showAll} disabled={locked} onChange={(e) => setShowAll(e.target.checked)} />
              {R.showAll}
            </label>
            <HelpButton what={R.showAll} help={help["rules.showAll"]} />
          </span>
          <p className="text-sm font-semibold">{R.showAllHint}</p>
        </div>
      ) : null}

      {!working && !custom ? <p className="font-semibold">{R.chooseFirst(scoring ? R.scoringWord : R.formatWord)}</p> : null}

      {working && scoring ? <ScoringSimple working={working} onChange={setValue} errors={errors} readOnly={locked} /> : null}
      {working && scoring && showAll ? (
        <SchemaForm node={scoringNodes} value={working} onChange={setValue} errors={errors} readOnly={locked} selectOptions={selectOptions} hiddenPaths={SCORING_SIMPLE_PATHS} />
      ) : null}

      {working && !scoring ? (
        <>
          <FormatSimple working={working as Record<string, unknown>} onChange={setValue} errors={errors} readOnly={locked} rounds={perRound} />
          {isFixed && !showAll ? <p className="panel font-semibold">{R.fixedRoundsNote}</p> : null}
          {showAll ? (
            <SchemaForm
              node={formatNodes}
              value={working}
              onChange={setValue}
              errors={errors}
              readOnly={locked}
              hidden={(working as { kind?: string }).kind === "fixed" ? ["generator", "roundDurationMin"] : ["rounds", "roundDurationMin"]}
              selectOptions={selectOptions}
              newItem={newItem}
              hiddenPaths={isFixed ? [] : FORMAT_SIMPLE_PATHS}
            />
          ) : null}
          <div className="panel flex flex-col gap-3" aria-label={copy.formatSimple.previewLabel}>
            <div className="flex flex-wrap items-center gap-3">
              <FieldLabel htmlFor={`riders-${division.id}`} text={copy.formatSimple.previewWith} help={help["format.preview"]} />
              <input id={`riders-${division.id}`} type="number" min={1} max={200} value={riders} onChange={(e) => setRiders(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} className="w-24" />
              <span className="font-bold">{copy.formatSimple.riders}</span>
              {[8, 14, 24].map((n) => (
                <button key={n} type="button" className="btn" onClick={() => setRiders(n)}>
                  {n}
                </button>
              ))}
            </div>
            {preview ? (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <div className="flex flex-col gap-2">
                  <p className="text-lg font-bold" data-testid="format-preview" aria-live="polite">
                    {preview.sentence}
                  </p>
                  {preview.ok ? (
                    <p className="font-bold" data-testid="min-heats">
                      {copy.formatSimple.minHeats(preview.minHeatsPerRider)}
                    </p>
                  ) : null}
                  {preview.ok ? <p className="font-semibold">{copy.formatSimple.ridingTime(preview.ridingMinutes)}</p> : null}
                  {preview.warnings.map((w) => (
                    <p key={w} className="font-bold">
                      {copy.formatSimple.warning(w)}
                    </p>
                  ))}
                </div>
                <LadderDiagram columns={preview.ladder} />
              </div>
            ) : (
              <p className="font-semibold">{copy.formatSimple.fixFirst}</p>
            )}
          </div>
        </>
      ) : null}

      {!scoring && !locked ? (
        <div>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setPresetId(null);
              setCustom(true);
              setWorking(FormatTemplateSchema.parse(newCustomFormat()));
              setShowAll(true);
              setMessage(null);
            }}
          >
            {copy.formatSimple.startCustom}
          </button>
          <p className="mt-1 text-sm font-semibold">{copy.formatSimple.startCustomHint}</p>
        </div>
      ) : null}

      {Object.keys(errors).length > 0 ? (
        <div role="alert" className="panel">
          <p className="field-error">{R.fixTitle}</p>
          <ul className="list-disc pl-6 font-semibold">
            {Object.entries(errors)
              .slice(0, 8)
              .map(([k, m]) => (
                <li key={k}>
                  {k.replace(/\./g, " › ")}: {friendlyMessage(m)}
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      {message ? (
        <div role={message.kind === "error" ? "alert" : "status"} className="panel">
          <p className={message.kind === "error" ? "field-error" : "font-bold"}>{message.kind === "error" ? copy.common.problem(message.text) : copy.common.toastDone(message.text)}</p>
          {message.problems && message.problems.length > 0 ? (
            <ul className="list-disc pl-6 font-semibold">
              {message.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {working && !locked ? (
        <div className="flex flex-col gap-4 border-t-2 border-[#111] pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" disabled={pending || !valid || !presetId || custom} onClick={saveForDivision}>
              {pending ? copy.common.saving : R.saveFor(noun, division.name)}
            </button>
            {unsaved && presetId && !custom ? <span className="font-bold">{copy.common.unsaved}</span> : null}
            {custom ? <span className="font-bold">{R.saveFirst}</span> : null}
            {!custom && baseParsed && unsaved ? (
              <button type="button" className="btn" onClick={() => choose(presetId ?? "")}>
                {R.discard}
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={`pname-${idSuffix}`}>{R.newPresetLabel}</label>
              <input id={`pname-${idSuffix}`} value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder={R.presetPlaceholder} className="w-72" />
            </div>
            <button type="button" className="btn" disabled={pending || !valid || presetName.trim().length < 2} onClick={() => saveAsPreset(false)}>
              {R.saveNewPreset}
            </button>
            {owned && !custom ? (
              <button type="button" className="btn" disabled={pending || !valid} onClick={() => saveAsPreset(true)}>
                {R.saveNewVersion(baseRow?.name ?? "")}
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn" disabled={!valid} onClick={download}>
              {R.export}
            </button>
            <label className="btn cursor-pointer">
              {R.import}
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                aria-label={R.importAria(noun)}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) doImport(await file.text());
                  if (fileInput.current) fileInput.current.value = "";
                }}
              />
            </label>
            <button type="button" className="btn" onClick={() => setShowPaste((v) => !v)}>
              {showPaste ? R.pasteHide : R.pasteShow}
            </button>
          </div>
          {showPaste ? (
            <div className="flex flex-col gap-2">
              <label htmlFor={`paste-${idSuffix}`}>{R.pasteLabel}</label>
              <textarea id={`paste-${idSuffix}`} rows={8} value={pasted} onChange={(e) => setPasted(e.target.value)} className="font-mono" />
              <div>
                <button type="button" className="btn" disabled={pending || pasted.trim() === ""} onClick={() => doImport(pasted)}>
                  {R.pasteImport}
                </button>
              </div>
            </div>
          ) : null}
          <p className="text-sm font-semibold">{R.importNote}</p>
        </div>
      ) : null}
    </section>
  );
}
