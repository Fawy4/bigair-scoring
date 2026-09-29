"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { SchemaForm, type NewItem, type SelectOptions } from "@/components/schema-form/schema-form";
import { toast } from "@/hooks/use-toast";
import { issuesToMap } from "@/lib/form/path";
import { advanceTargets, newCustomFormat, newRound } from "@/lib/format-ui/custom";
import { previewFormat } from "@/lib/format-ui/preview";
import { exportPreset, type PresetKind } from "@/lib/presets/io";
import { presetGroups, type PresetRow } from "@/lib/presets/options";
import { FormatTemplateSchema, type FormatTemplate } from "@/lib/schemas/format-template";
import { ScoringModelSchema } from "@/lib/schemas/scoring-model";
import { FORMAT_HIDDEN, FORMAT_LABELS, SCORING_HIDDEN, SCORING_LABELS } from "@/lib/schema-form/labels";
import { friendlyMessage, schemaToNodes } from "@/lib/schema-form/nodes";
import { describeScoringModel } from "@/lib/scoring-ui/describe";
import { diffOverrides, FORMAT_NULLABLE, mergeOverrides, sameOverrides, SCORING_NULLABLE } from "@/lib/scoring-ui/overrides";
import { importPreset, savePreset, saveDivisionRules, unlockRules } from "./actions";
import type { DivisionRow } from "./divisions-manager";
import { ScoringSimple } from "./scoring-simple";

const scoringNodes = schemaToNodes(ScoringModelSchema, SCORING_LABELS, SCORING_HIDDEN);
const formatNodes = schemaToNodes(FormatTemplateSchema, FORMAT_LABELS, FORMAT_HIDDEN);

type Level = "simple" | "advanced";
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
  const [custom, setCustom] = useState(false); // an unsaved custom format
  const [level, setLevel] = useState<Level>("simple");
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
    } else setMessage({ kind: "error", text: res.error ?? "That did not work.", problems: res.problems });
  }

  function saveForDivision() {
    if (!presetId) return;
    setMessage(null);
    start(async () => {
      const res = await saveDivisionRules({ divisionId: division.id, kind, presetId, overrides });
      if (res.ok) onDivisionChange(scoring ? { scoring_model_id: presetId, scoring_overrides: overrides } : { format_template_id: presetId, format_params: overrides });
      report(res, `${scoring ? "Scoring" : "Format"} saved for ${division.name}`);
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
      report(applied, newVersion ? `Saved “${res.row.name}” as version ${res.row.version}; ${division.name} now uses it` : `Preset “${res.row.name}” saved; ${division.name} now uses it`);
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
      report({ ok: true }, `Imported “${res.row.name}” as a new preset. Press “Save for this division” to use it.`);
    });
  }

  function download() {
    if (!working) return;
    const { filename, text } = exportPreset(working, baseRow?.name ?? "my-preset");
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
      report(res, "Unlocked. Your reason was written to the audit log.");
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

  return (
    <section className="flex flex-col gap-5" aria-label={`${scoring ? "Scoring" : "Format"} of ${division.name}`}>
      {locked ? (
        <div className="panel flex flex-col gap-3" role="note">
          <p className="text-lg font-bold">🔒 Scoring and format are locked: a heat of this division has started.</p>
          <p className="font-semibold">Changing rules mid-event affects results already entered. To change them anyway, write down why. It is kept in the audit log.</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={`reason-${kind}-${division.id}`}>Reason for unlocking</label>
              <input id={`reason-${kind}-${division.id}`} value={reason} onChange={(e) => setReason(e.target.value)} className="w-96 max-w-full" />
            </div>
            <button type="button" className="btn btn-danger" disabled={pending || reason.trim().length < 5} onClick={unlock}>
              Unlock scoring and format
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor={`preset-${kind}-${division.id}`}>{scoring ? "Scoring preset" : "Format"}</label>
        <select id={`preset-${kind}-${division.id}`} value={custom ? "" : (presetId ?? "")} disabled={locked} onChange={(e) => choose(e.target.value)}>
          <option value="">{custom ? "Custom format (not saved yet)" : "Choose…"}</option>
          {groups.organisation.length > 0 ? (
            <optgroup label="My organisation’s presets">
              {groups.organisation.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ) : null}
          <optgroup label="Built-in presets">
            {groups.system.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </optgroup>
        </select>
        {baseRow && baseParsed && "description" in baseParsed && typeof baseParsed.description === "string" ? <p className="text-sm font-semibold">{baseParsed.description}</p> : null}
      </div>

      {model ? (
        <p className="panel text-lg font-bold" data-testid="model-sentence" aria-live="polite">
          {describeScoringModel(model)}
        </p>
      ) : null}

      {scoring && working ? (
        <fieldset className="flex flex-wrap gap-4" disabled={locked}>
          <legend className="sr-only">Level of detail</legend>
          {(["simple", "advanced"] as const).map((l) => (
            <label key={l} className="flex items-center gap-2 font-bold">
              <input type="radio" name={`level-${division.id}`} checked={level === l} onChange={() => setLevel(l)} />
              {l === "simple" ? "Simple: the common settings" : "Advanced: every setting"}
            </label>
          ))}
        </fieldset>
      ) : null}

      {!working && !custom ? <p className="font-semibold">Choose a {scoring ? "scoring preset" : "format"} to see and edit its settings.</p> : null}

      {working && scoring && level === "simple" ? <ScoringSimple working={working} onChange={setValue} errors={errors} readOnly={locked} /> : null}
      {working && scoring && level === "advanced" ? (
        <SchemaForm node={scoringNodes} value={working} onChange={setValue} errors={errors} readOnly={locked} selectOptions={selectOptions} />
      ) : null}
      {working && !scoring ? (
        <>
          <SchemaForm
            node={formatNodes}
            value={working}
            onChange={setValue}
            errors={errors}
            readOnly={locked}
            hidden={(working as { kind?: string }).kind === "fixed" ? ["generator"] : ["rounds"]}
            selectOptions={selectOptions}
            newItem={newItem}
          />
          <div className="panel flex flex-col gap-3" aria-label="Format preview">
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor={`riders-${division.id}`}>Preview with</label>
              <input id={`riders-${division.id}`} type="number" min={1} max={200} value={riders} onChange={(e) => setRiders(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} className="w-24" />
              <span className="font-bold">riders</span>
              {[8, 14, 24].map((n) => (
                <button key={n} type="button" className="btn" onClick={() => setRiders(n)}>
                  {n}
                </button>
              ))}
            </div>
            {preview ? (
              <>
                <p className="text-lg font-bold" data-testid="format-preview" aria-live="polite">
                  {preview.sentence}
                </p>
                {preview.ok ? <p className="font-semibold">About {preview.ridingMinutes} minutes of riding, not counting breaks.</p> : null}
                {preview.warnings.map((w) => (
                  <p key={w} className="font-bold">
                    ⚠ {w}
                  </p>
                ))}
              </>
            ) : (
              <p className="font-semibold">Fix the highlighted settings to see the preview.</p>
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
              const parsed = FormatTemplateSchema.parse(newCustomFormat());
              setPresetId(null);
              setCustom(true);
              setWorking(parsed);
              setMessage(null);
            }}
          >
            + Start a custom format
          </button>
          <p className="mt-1 text-sm font-semibold">Add rounds, heat sizes, durations, breaks, where riders come from and where each place goes. Save it as a preset to use it.</p>
        </div>
      ) : null}

      {Object.keys(errors).length > 0 ? (
        <div role="alert" className="panel">
          <p className="field-error">✖ Some settings need fixing before they can be saved:</p>
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
          <p className={message.kind === "error" ? "field-error" : "font-bold"}>
            {message.kind === "error" ? "✖ " : "✔ "}
            {message.text}
          </p>
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
              {pending ? "Saving…" : `Save ${noun} for ${division.name}`}
            </button>
            {unsaved && presetId && !custom ? <span className="font-bold">● Unsaved changes</span> : null}
            {custom ? <span className="font-bold">Save it as a preset first, then it is used for this division.</span> : null}
            {!custom && baseParsed && unsaved ? (
              <button type="button" className="btn" onClick={() => choose(presetId ?? "")}>
                Discard changes
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={`pname-${kind}-${division.id}`}>Save these settings as a new preset</label>
              <input id={`pname-${kind}-${division.id}`} value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Preset name" className="w-72" />
            </div>
            <button type="button" className="btn" disabled={pending || !valid || presetName.trim().length < 2} onClick={() => saveAsPreset(false)}>
              Save as new preset
            </button>
            {owned && !custom ? (
              <button type="button" className="btn" disabled={pending || !valid} onClick={() => saveAsPreset(true)}>
                Save as new version of “{baseRow?.name}”
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn" disabled={!valid} onClick={download}>
              Export as JSON
            </button>
            <label className="btn cursor-pointer">
              Import a JSON file…
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                aria-label={`Import a ${noun} JSON file`}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) doImport(await file.text());
                  if (fileInput.current) fileInput.current.value = "";
                }}
              />
            </label>
            <button type="button" className="btn" onClick={() => setShowPaste((v) => !v)}>
              {showPaste ? "Hide paste box" : "Paste JSON instead"}
            </button>
          </div>
          {showPaste ? (
            <div className="flex flex-col gap-2">
              <label htmlFor={`paste-${kind}-${division.id}`}>Paste the JSON here</label>
              <textarea id={`paste-${kind}-${division.id}`} rows={8} value={pasted} onChange={(e) => setPasted(e.target.value)} className="font-mono" />
              <div>
                <button type="button" className="btn" disabled={pending || pasted.trim() === ""} onClick={() => doImport(pasted)}>
                  Import pasted JSON
                </button>
              </div>
            </div>
          ) : null}
          <p className="text-sm font-semibold">Imports are always saved as a new preset of your organisation. Nothing existing is overwritten.</p>
        </div>
      ) : null}
    </section>
  );
}

