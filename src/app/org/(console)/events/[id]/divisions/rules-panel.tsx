"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { LadderDiagram } from "@/components/ladder-diagram";
import { Button, disabledWhen } from "@/components/org/button";
import { NumberField } from "@/components/org/number-field";
import { SettingRow } from "@/components/org/setting-row";
import { SettingsPanel } from "@/components/org/settings-panel";
import { SchemaForm, type NewItem, type SelectOptions } from "@/components/schema-form/schema-form";
import { toast } from "@/hooks/use-toast";
import { issuesToMap } from "@/lib/form/path";
import { advanceTargets, newRound } from "@/lib/format-ui/custom";
import { addRoundAfter } from "@/lib/format-ui/custom-ladder";
import { GENERATOR, heatSizes, KIND_PRESET_KEY, KINDS, paramOf, withHeatName, withLadderKind, withRoundName, type GeneratedKind } from "@/lib/format-ui/ladder-kind";
import { previewFormat } from "@/lib/format-ui/preview";
import { formatSentence } from "@/lib/format-ui/sentence";
import { countFields, countVisible } from "@/lib/schema-form/count";
import { scoringMoreHidden, SCORING_FLAT_PATHS } from "@/lib/scoring-ui/visibility";
import { exportPreset, type PresetKind } from "@/lib/presets/io";
import { presetGroups, type PresetRow } from "@/lib/presets/options";
import { FormatTemplateSchema, type FormatTemplate } from "@/lib/schemas/format-template";
import { ScoringModelSchema } from "@/lib/schemas/scoring-model";
import { friendlyMessage, schemaToNodes } from "@/lib/schema-form/nodes";
import { describeScoringModel } from "@/lib/scoring-ui/describe";
import { diffOverrides, effectiveOverrides, FORMAT_NULLABLE, mergeOverrides, sameOverrides, SCORING_NULLABLE } from "@/lib/scoring-ui/overrides";
import { copy, FORMAT_HIDDEN, FORMAT_LABELS, help, orgCopy, SCORING_HIDDEN, SCORING_LABELS } from "@/lib/ui-copy";
import { expandFormat, drawToLadder, designDifference, ladderTemplate, LadderConvertError, newLadder, previewRiders, type CustomLadder, type Entrant } from "@/lib/engine/ladder";
import { generateDraw } from "../draw/actions";
import { importPreset, savePreset, saveDivisionRules, unlockRules } from "./actions";
import type { DivisionRow } from "./divisions-manager";
import { CustomBuilder } from "./custom-builder";
import { LadderBuilder } from "./ladder-builder";
import { FormatSimple, ladderKindOf } from "./format-simple";
import { timingRows, TIMING_MORE_HIDDEN } from "@/lib/format-ui/timing";
import { PerRoundLengths, WarmUpField } from "./per-round-lengths";
import { ScoringSimple } from "./scoring-simple";

const R = copy.rules;

/** Settings the Simple part of the screen already shows; "Show all settings" adds everything else below them. */
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
  "generator.params.smallFinalSize",
  "generator.params.qualifyingRounds",
  "generator.params.heatsPerRider",
  "generator.params.pointsTable",
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
  eventId,
  division,
  presets,
  organisationId,
  onPresetAdded,
  onDivisionChange,
  advancedExtra,
}: {
  kind: PresetKind;
  eventId: string;
  division: DivisionRow;
  presets: PresetRow[];
  organisationId: string;
  onPresetAdded: (row: PresetRow) => void;
  onDivisionChange: (patch: Partial<DivisionRow>) => void;
  /** Shown under "Show all settings" of the Scoring tab (the division's live-screen settings). */
  advancedExtra?: React.ReactNode;
}) {
  const scoring = kind === "scoring_model";
  const nullable = scoring ? SCORING_NULLABLE : FORMAT_NULLABLE;
  const savedPresetId = scoring ? division.scoring_model_id : division.format_template_id;
  const savedOverrides = scoring ? division.scoring_overrides : division.format_params;

  const [presetId, setPresetId] = useState<string | null>(savedPresetId);
  const [custom, setCustom] = useState(false); // an unsaved custom ladder
  const [showPresetTools, setShowPresetTools] = useState(false);
  const [riders, setRiders] = useState(division.riders.length || 14);
  const [message, setMessage] = useState<Message>(null);
  const [presetName, setPresetName] = useState("");
  const [reason, setReason] = useState("");
  const [pasted, setPasted] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [startFromError, setStartFromError] = useState<string | null>(null);

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
  // what the saved overrides really change on the saved preset: an override equal to the preset's own value is not a change (no phantom "Unsaved changes")
  const savedEffective = useMemo(() => {
    if (!baseParsed || presetId !== savedPresetId) return savedOverrides;
    const merged = parseWith(kind, mergeOverrides(baseParsed, savedOverrides, nullable));
    return effectiveOverrides(baseParsed, savedOverrides, merged.success ? merged.data : null, nullable);
  }, [baseParsed, presetId, savedPresetId, savedOverrides, kind, nullable]);
  const unsaved = presetId !== savedPresetId || !sameOverrides(overrides, savedEffective);

  const groups = presetGroups(presets, presetId);
  const model = check?.success && scoring ? (check.data as Parameters<typeof describeScoringModel>[0]) : null;
  const template = check?.success && !scoring ? (check.data as FormatTemplate) : null;
  const preview = useMemo(() => (template ? previewFormat(template, riders) : null), [template, riders]);
  const isFixed = !scoring && ladderKindOf(working) === "custom";
  const isLadder = !scoring && ladderKindOf(working) === "ladder";
  // the riders the ladder is designed for: as many as the "Preview with" number says (the division's real riders first, placeholders after)
  const builderRiders = useMemo(() => previewRiders(division.riders, riders), [division.riders, riders]);
  // what "Apply to draw" does differently from the design (the draw always uses the division's real confirmed riders)
  const difference = useMemo(() => designDifference(riders, division.riders.length), [riders, division.riders.length]);
  // the rounds of "Heat length per round": those of the preview, pre-filled with the single settings' heat length (see perRoundRows)
  const perRound = useMemo(() => (working && template ? timingRows(working as Record<string, unknown>, riders) : []), [working, template, riders]);

  function choose(id: string) {
    const row = presets.find((p) => p.id === id);
    const parsed = row ? parseWith(kind, row.json) : null;
    setPresetId(id || null);
    setCustom(false);
    setMessage(null);
    setWorking(parsed?.success ? parsed.data : null);
  }

  /** A ladder card: load that type's built-in format (its newest version); without one in the list, swap the generator of what is open. */
  function pickKind(k: GeneratedKind) {
    if (ladderKindOf(working) === k) return;
    const type = GENERATOR[k];
    const matches = presets.filter((p) => !p.organisation_id && (p.json as { generator?: { type?: string } } | null)?.generator?.type === type);
    const row = [...matches].sort((a, b) => Number(b.key === KIND_PRESET_KEY[k]) - Number(a.key === KIND_PRESET_KEY[k]) || b.version - a.version)[0];
    if (row) return choose(row.id);
    if (working) setValue(withLadderKind(working as Record<string, unknown>, k));
  }

  /** The "Custom ladder" card: an empty whiteboard for this division (nothing is saved until you save or apply). */
  function pickLadder() {
    if (ladderKindOf(working) === "ladder") return;
    setPresetId(null);
    setCustom(true);
    setWorking(FormatTemplateSchema.parse(ladderTemplate(newLadder(3, 2, 4), { name: R.ladderDefaultName })));
    setMessage(null);
  }

  /** "Start from Knockout and edit": any generated format becomes a ladder you can change seat by seat. */
  function startFrom(kindKey: string) {
    setStartFromError(null);
    const k = kindKey as GeneratedKind;
    const type = GENERATOR[k];
    const matches = presets.filter((p) => !p.organisation_id && (p.json as { generator?: { type?: string } } | null)?.generator?.type === type);
    const row = [...matches].sort((a, b) => Number(b.key === KIND_PRESET_KEY[k]) - Number(a.key === KIND_PRESET_KEY[k]) || b.version - a.version)[0];
    const parsed = row ? FormatTemplateSchema.safeParse(row.json) : null;
    if (!parsed?.success) return setStartFromError(R.startFromMissing);
    try {
      const entrants: Entrant[] = builderRiders.map((r) => ({ id: r.id, name: r.name }));
      const draw = expandFormat(parsed.data, entrants, { identification: "name-callout" });
      const ladder = drawToLadder(draw);
      const t = ladderTemplate(ladder, { name: R.ladderFrom(parsed.data.name), basedOn: parsed.data.id, timing: parsed.data.timing });
      setWorking(FormatTemplateSchema.parse(t));
      setMessage(null);
    } catch (e) {
      setStartFromError(e instanceof LadderConvertError ? e.message : (e as Error).message);
    }
  }

  /** "Apply to draw": saves the ladder as your format (a new version when it is one of yours), makes it the division's format and draws. */
  function applyToDraw() {
    if (!working) return;
    setMessage(null);
    start(async () => {
      const name = (presetName.trim() || (owned && baseRow ? baseRow.name : `${division.name} ladder`)).slice(0, 80);
      let id = presetId;
      if (!id || unsaved || custom) {
        const res = await savePreset({ kind, organisationId, name, json: working, newVersionOfKey: owned && !custom && baseRow ? baseRow.key : undefined });
        if (!res.ok) return report(res, "");
        onPresetAdded(res.row);
        id = res.row.id;
        setPresetId(id);
        setCustom(false);
      }
      const applied = await saveDivisionRules({ divisionId: division.id, kind, presetId: id, overrides: {} });
      if (!applied.ok) return report(applied, "");
      onDivisionChange({ format_template_id: id, format_params: {} });
      const drawn = await generateDraw(division.id, false);
      if (!drawn.ok) return setMessage({ kind: "error", text: drawn.error });
      toast({ title: copy.builder.applied(division.name), ...(difference ? { description: copy.builder.difference(difference) } : {}) });
      router.push(`/org/events/${eventId}/draw?division=${division.id}`);
    });
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

  const gate = disabledWhen;
  const kindTitle = (): string => {
    const k = ladderKindOf(working);
    if (k === "ladder") return copy.formatSimple.customLadder.title;
    if (k === "custom") return typeof (working as { name?: unknown } | null)?.name === "string" ? String((working as { name: string }).name) : copy.formatSimple.customLadder.title;
    return copy.formatSimple.types[k as GeneratedKind].title;
  };
  const sentence = scoring
    ? model
      ? describeScoringModel(model)
      : R.chooseFirst(R.scoringWord)
    : preview?.ok && working
      ? formatSentence({ kindTitle: kindTitle(), heatSize: heatSizes(working as Record<string, unknown>)?.target, advance: paramOf(working as Record<string, unknown>, "advancePerHeat") as number | undefined, finalSize: paramOf(working as Record<string, unknown>, "finalSize") as number | undefined, riders, rounds: preview.rounds.length, totalMin: preview.totalMinutes })
      : (preview?.sentence ?? R.chooseFirst(R.formatWord));

  const loadMenu = {
    builtIn: groups.system.map((o) => ({ id: o.id, label: o.label })),
    mine: groups.organisation.map((o) => ({ id: o.id, label: o.label })),
    onLoad: choose,
    onSaveAsPreset: () => setShowPresetTools(true),
    disabledReason: locked ? R.loadLocked : undefined,
  };

  const banner = locked ? (
    <div role="note" data-testid="rules-locked" className="flex flex-col gap-2 border-b border-beach-line bg-beach-surface px-4 py-3">
      <p className="text-body font-semibold">{R.lockedTitle}</p>
      <p className="text-small font-medium text-beach-muted">{R.lockedText}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`reason-${idSuffix}`} className="text-small font-semibold">
            {R.reason}
          </label>
          <input id={`reason-${idSuffix}`} value={reason} onChange={(e) => setReason(e.target.value)} className="h-[var(--org-ctl)] w-96 max-w-full rounded-[8px] border border-beach-border bg-transparent px-3 text-body font-semibold" />
        </div>
        <Button variant="danger" onClick={unlock} {...gate(pending ? copy.common.saving : reason.trim().length < 5 ? R.unlockNeedsReason : null)}>
          {R.unlock}
        </Button>
      </div>
    </div>
  ) : null;

  const simple = (
    <div className="org-new flex min-w-0 flex-col gap-3 py-2">
      {scoring && baseRow && baseParsed && typeof baseParsed.description === "string" ? <p className="text-small font-medium text-beach-muted">{baseParsed.description}</p> : null}
      {!working && !custom && scoring ? <p className="text-body font-semibold">{R.chooseFirst(R.scoringWord)}</p> : null}
      {working && scoring ? <ScoringSimple working={working} onChange={setValue} errors={errors} readOnly={locked} /> : null}

      {!scoring ? (
        <div className="flex min-w-0 flex-col gap-3" data-testid="format-card" aria-label={R.formatWord}>
          <FormatSimple
            working={(working as Record<string, unknown> | null) ?? null}
            onChange={setValue}
            onPickKind={pickKind}
            onPickLadder={pickLadder}
            errors={errors}
            readOnly={locked}
            minHeats={preview?.ok ? preview.minHeatsPerRider : null}
          />
          {custom ? <p className="text-body font-semibold">{R.customUnsaved}</p> : null}
          {working && isFixed ? <CustomBuilder working={working as Record<string, unknown>} onChange={setValue} riders={riders} readOnly={locked} /> : null}

          {working ? (
            <SettingRow id="preview-with" label={copy.formatSimple.previewWith} explanation={help["format.preview"].text} example={help["format.preview"].example ?? ""}>
              <span className="inline-flex flex-wrap items-center gap-2">
                <NumberField id={`riders-${division.id}`} label={copy.formatSimple.previewWith} min={1} max={200} value={riders} onChange={setRiders} />
                <span className="text-body font-medium text-beach-muted">{copy.formatSimple.riders}</span>
                {!isLadder
                  ? [8, 14, 24].map((n) => (
                      <Button key={n} variant="secondary" onClick={() => setRiders(n)}>
                        {String(n)}
                      </Button>
                    ))
                  : null}
              </span>
            </SettingRow>
          ) : null}

          {working && isLadder ? (
            <div className="flex flex-col gap-3">
              <WarmUpField working={working as Record<string, unknown>} onChange={setValue} readOnly={locked} />
              <LadderBuilder
                ladder={(working as { ladder: CustomLadder }).ladder}
                onChange={(l) => setValue({ ...(working as Record<string, unknown>), ladder: l })}
                riders={builderRiders}
                confirmedCount={division.riders.length}
                readOnly={locked}
                startFromOptions={KINDS.map((k) => ({ kind: k, label: copy.formatSimple.types[k].title }))}
                onStartFrom={startFrom}
                startFromError={startFromError}
              >
                {({ complete }) => (
                  <div className="panel flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`lname-${division.id}`} className="font-semibold">
                        {copy.builder.nameLabel}
                      </label>
                      <input id={`lname-${division.id}`} value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder={copy.builder.namePlaceholder} />
                    </div>
                    <button type="button" className="btn" disabled={pending || !valid || presetName.trim().length < 2 || locked} onClick={() => saveAsPreset(false)}>
                      {copy.builder.saveDraft}
                    </button>
                    {division.drawLocked ? <p className="font-semibold">{copy.builder.drawLocked}</p> : division.started ? <p className="font-semibold">{copy.builder.drawStarted}</p> : null}
                    {division.hasHeats && !division.drawLocked && !division.started ? (
                      <ConfirmButton label={copy.builder.applyToDraw} question={copy.builder.applyQuestion} confirmLabel={copy.builder.applyYes} cancelLabel={copy.common.cancel} disabled={!complete || division.riders.length === 0} pending={pending} onConfirm={applyToDraw} />
                    ) : (
                      <button type="button" className="btn btn-primary" disabled={pending || !complete || division.riders.length === 0 || division.drawLocked || division.started || locked} onClick={applyToDraw}>
                        {copy.builder.applyToDraw}
                      </button>
                    )}
                    {!complete ? <p className="text-sm font-semibold">{copy.builder.applyBlocked}</p> : division.riders.length === 0 ? <p className="text-sm font-semibold">{copy.builder.applyNoRiders}</p> : null}
                    {difference && division.riders.length > 0 ? (
                      <p className="text-sm font-semibold" data-testid="apply-difference">
                        {copy.builder.difference(difference)}
                      </p>
                    ) : null}
                  </div>
                )}
              </LadderBuilder>
            </div>
          ) : null}

          {working && !isLadder ? (
            <div className="flex flex-col gap-3" aria-label={copy.formatSimple.previewLabel}>
              {preview ? (
                <>
                  <LadderDiagram
                    columns={preview.ladder}
                    onRenameRound={locked ? undefined : (id, name) => setValue(withRoundName(working as Record<string, unknown>, id, name))}
                    onRenameHeat={locked ? undefined : (id, name) => setValue(withHeatName(working as Record<string, unknown>, id, name))}
                    onAddRound={isFixed && !locked ? (afterId) => setValue(addRoundAfter(working as never, afterId)) : undefined}
                  />
                  <div className="flex flex-col gap-1">
                    <p className="text-body font-semibold" data-testid="format-preview" aria-live="polite">
                      {preview.sentence}
                    </p>
                    {preview.ok && preview.finalNote ? (
                      <p className="text-body font-medium" data-testid="final-note">
                        {preview.finalNote}
                      </p>
                    ) : null}
                    {preview.ok ? (
                      <p className="text-body font-medium" data-testid="min-heats">
                        {copy.formatSimple.minHeats(preview.minHeatsPerRider)}
                      </p>
                    ) : null}
                    {preview.ok && preview.timeSentence ? (
                      <p className="text-body font-medium" data-testid="time-sentence">
                        {preview.timeSentence}
                      </p>
                    ) : null}
                    {preview.ok ? <p className="text-small font-medium text-beach-muted">{copy.formatSimple.ridingTime(preview.ridingMinutes)}</p> : null}
                    {preview.warnings.map((w) => (
                      <p key={w} className="text-body font-semibold">
                        {copy.formatSimple.warning(w)}
                      </p>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-body font-semibold">{copy.formatSimple.fixFirst}</p>
              )}
            </div>
          ) : null}

          {working && !isLadder ? <PerRoundLengths working={working as Record<string, unknown>} rounds={perRound} onChange={setValue} readOnly={locked} emptyReason={template ? undefined : copy.formatSimple.perRound.emptyInvalid} /> : null}
        </div>
      ) : null}
    </div>
  );

  const advancedFields = scoring
    ? countVisible(scoringNodes, working, { hidden: SCORING_HIDDEN, hiddenPaths: scoringMoreHidden(working), flatPaths: SCORING_FLAT_PATHS })
    : countFields(formatNodes, (working as { kind?: string } | null)?.kind === "fixed" ? [...FORMAT_HIDDEN, "generator", "ladder", "roundDurationMin", "roundWarmUpMin", "roundBreakAfterHeatMin", "roundNames", "heatNames"] : [...FORMAT_HIDDEN, "rounds", "ladder", "roundDurationMin", "roundWarmUpMin", "roundBreakAfterHeatMin", "roundNames", "heatNames"], [...(isFixed ? [] : FORMAT_SIMPLE_PATHS), ...(isLadder ? [] : TIMING_MORE_HIDDEN)]);
  const advanced = working ? (
    <div className="org-new flex min-w-0 flex-col gap-3 py-2">
      {scoring ? (
        <>
          <SchemaForm node={scoringNodes} value={working} onChange={setValue} errors={errors} readOnly={locked} selectOptions={selectOptions} hiddenPaths={scoringMoreHidden(working)} flatPaths={SCORING_FLAT_PATHS} />
          {advancedExtra}
        </>
      ) : (
        <>
          {isFixed ? <p className="text-body font-semibold">{R.fixedRoundsNote}</p> : null}
          <SchemaForm
            node={formatNodes}
            value={working}
            onChange={setValue}
            errors={errors}
            readOnly={locked}
            hidden={
              (working as { kind?: string }).kind === "fixed"
                ? ["generator", "ladder", "roundDurationMin", "roundWarmUpMin", "roundBreakAfterHeatMin", "roundNames", "heatNames"]
                : (working as { kind?: string }).kind === "ladder"
                  ? ["generator", "rounds", "ladder", "roundDurationMin", "roundWarmUpMin", "roundBreakAfterHeatMin", "roundNames", "heatNames"]
                  : ["rounds", "ladder", "roundDurationMin", "roundWarmUpMin", "roundBreakAfterHeatMin", "roundNames", "heatNames"]
            }
            selectOptions={selectOptions}
            newItem={newItem}
            hiddenPaths={[...(isFixed ? [] : FORMAT_SIMPLE_PATHS), ...(isLadder ? [] : TIMING_MORE_HIDDEN)]}
          />
        </>
      )}
    </div>
  ) : null;

  const messages =
    Object.keys(errors).length > 0 || message ? (
      <div className="flex flex-col gap-2">
        {Object.keys(errors).length > 0 ? (
          <div role="alert" className="rounded-[8px] border border-beach-border bg-beach-surface px-3 py-2">
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
          <div role={message.kind === "error" ? "alert" : "status"} className="rounded-[8px] border border-beach-border bg-beach-surface px-3 py-2">
            <p className={message.kind === "error" ? "field-error" : "font-semibold"}>{message.kind === "error" ? copy.common.problem(message.text) : copy.common.toastDone(message.text)}</p>
            {message.problems && message.problems.length > 0 ? (
              <ul className="list-disc pl-6 font-semibold">
                {message.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    ) : null;

  const saveTools =
    working && !locked ? (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={saveForDivision} {...gate(pending ? copy.common.saving : !valid ? R.saveInvalid : !presetId || custom ? R.saveFirst : null)}>
            {pending ? copy.common.saving : R.saveFor(noun, division.name)}
          </Button>
          {unsaved && presetId && !custom ? <span className="text-body font-semibold">{copy.common.unsaved}</span> : null}
          {custom ? <span className="text-body font-semibold">{R.saveFirst}</span> : null}
          {!custom && baseParsed && unsaved ? (
            <Button variant="quiet" onClick={() => choose(presetId ?? "")}>
              {R.discard}
            </Button>
          ) : null}
          {!showPresetTools ? (
            <Button variant="quiet" onClick={() => setShowPresetTools(true)}>
              {orgCopy.settings.saveAsPreset}
            </Button>
          ) : null}
        </div>

        {showPresetTools ? (
          <div className="flex flex-col gap-3 rounded-[8px] border border-beach-line p-3" data-testid="preset-tools">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor={`pname-${idSuffix}`} className="text-small font-semibold">
                  {scoring ? R.newPresetLabel : R.newFormatLabel}
                </label>
                <input id={`pname-${idSuffix}`} value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder={R.presetPlaceholder} className="h-[var(--org-ctl)] w-72 max-w-full rounded-[8px] border border-beach-border bg-transparent px-3 text-body font-semibold" />
              </div>
              <Button variant="secondary" onClick={() => saveAsPreset(false)} {...gate(pending ? copy.common.saving : !valid ? R.saveInvalid : presetName.trim().length < 2 ? R.presetNeedsName : null)}>
                {scoring ? R.saveNewPreset : R.saveMyFormat}
              </Button>
              {owned && !custom ? (
                <Button variant="secondary" onClick={() => saveAsPreset(true)} {...gate(pending ? copy.common.saving : !valid ? R.saveInvalid : null)}>
                  {R.saveNewVersion(baseRow?.name ?? "")}
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={download} {...gate(!valid ? R.saveInvalid : null)}>
                {R.export}
              </Button>
              <label className="inline-flex min-h-[var(--org-ctl)] cursor-pointer items-center rounded-[8px] border border-beach-border bg-beach-bg px-3 text-body font-semibold">
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
              <Button variant="secondary" onClick={() => setShowPaste((v) => !v)}>
                {showPaste ? R.pasteHide : R.pasteShow}
              </Button>
            </div>
            {showPaste ? (
              <div className="flex flex-col gap-2">
                <label htmlFor={`paste-${idSuffix}`} className="text-small font-semibold">
                  {R.pasteLabel}
                </label>
                <textarea id={`paste-${idSuffix}`} rows={8} value={pasted} onChange={(e) => setPasted(e.target.value)} className="rounded-[8px] border border-beach-border bg-transparent p-2 font-mono" />
                <div>
                  <Button variant="secondary" onClick={() => doImport(pasted)} {...gate(pending ? copy.common.saving : pasted.trim() === "" ? R.pasteEmpty : null)}>
                    {R.pasteImport}
                  </Button>
                </div>
              </div>
            ) : null}
            <p className="text-small font-medium text-beach-muted">{R.importNote}</p>
          </div>
        ) : null}
      </div>
    ) : null;

  const footer =
    messages || saveTools ? (
      <div className="org-new flex flex-col gap-3">
        {messages}
        {saveTools}
      </div>
    ) : undefined;

  return (
    <section className="min-w-0" aria-label={`${scoring ? copy.divisions.tabScoring : copy.divisions.tabFormat}: ${division.name}`}>
      <SettingsPanel
        testId={scoring ? "scoring-panel" : "format-panel"}
        sentenceTestId={scoring ? "model-sentence" : "format-sentence"}
        title={`${division.name} · ${scoring ? copy.divisions.tabScoring : copy.divisions.tabFormat}`}
        sentence={sentence}
        loadMenu={loadMenu}
        banner={banner}
        simple={simple}
        advanced={advanced}
        advancedCount={advancedFields}
        storageKey={`bigair.org-more-${kind}`}
        footer={footer}
      />
    </section>
  );
}
