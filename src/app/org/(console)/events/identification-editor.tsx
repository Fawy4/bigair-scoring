"use client";

import { useState, useTransition } from "react";
import { FieldLabel } from "@/components/help-button";
import { RiderLabel } from "@/components/rider-label";
import { toast } from "@/hooks/use-toast";
import { moveIn, removeIn, setIn } from "@/lib/form/path";
import { riderLabelModel } from "@/lib/identification/rider-label";
import { defaultScheme, lycraScheme, PrimaryIdentifierSchema, SecondaryIdentifierSchema, usesLycras, type IdentificationScheme } from "@/lib/schemas/identification";
import { copy, help } from "@/lib/ui-copy";
import { saveIdentificationPreset } from "./actions";

const T = copy.ident;
const SAMPLE = {
  name: "Sam Sample",
  nationality: "EG",
  sponsor: "Sample Co.",
  slotColour: "red",
  identifiers: { vest_colour: "red", bib: 14, kite: { brand: "North", model: "Orbit", size: 9, colours: "blue/white" }, rashguard_colour: "blue", helmet_colour: "black" },
};

export interface IdentificationValue {
  scheme: IdentificationScheme;
  basedOn?: string;
  allowDivisionOverride: boolean;
}

/** Pick a preset, edit palette / secondary fields / call-out / fallback, allow a per-division override, save as preset. */
export function IdentificationEditor({
  value,
  onChange,
  presets,
  organisationId,
  errors,
  division,
}: {
  value: IdentificationValue;
  onChange: (v: IdentificationValue) => void;
  presets: IdentificationScheme[];
  organisationId: string;
  errors: string[];
  /** Used inside one division: no "allow per-division override" switch, and the heading says so. */
  division?: boolean;
}) {
  const s = value.scheme;
  const [presetName, setPresetName] = useState("");
  const [presetError, setPresetError] = useState<string | null>(null);
  const [list, setList] = useState(presets);
  const [pending, start] = useTransition();
  const set = (path: (string | number)[], v: unknown) => onChange({ ...value, scheme: setIn(s, path, v) });
  const toggle = <K extends "secondary" | "kiteFields">(field: K, item: string) => {
    const cur = (s[field] as string[]) ?? [];
    set([field], cur.includes(item) ? cur.filter((x) => x !== item) : [...cur, item]);
  };

  function pickPreset(id: string) {
    const p = list.find((x) => x.id === id);
    if (p) onChange({ ...value, scheme: structuredClone(p), basedOn: p.id });
  }

  /** "Will riders wear coloured lycras?" picks the matching ready-made scheme. */
  function answerLycras(yes: boolean) {
    if (yes === usesLycras(s)) return;
    const next = yes ? lycraScheme() : defaultScheme();
    onChange({ ...value, scheme: structuredClone(next), basedOn: next.id });
  }

  function savePreset() {
    setPresetError(null);
    start(async () => {
      const res = await saveIdentificationPreset({ organisationId, name: presetName, scheme: s });
      if (res.ok) {
        const saved = { ...structuredClone(s), id: `org:${res.key}`, name: res.name };
        setList((l) => [...l.filter((x) => x.id !== saved.id), saved]);
        onChange({ ...value, basedOn: saved.id });
        setPresetName("");
        toast({ title: T.presetSaved(res.name) });
      } else setPresetError(res.error);
    });
  }

  const lycras = usesLycras(s);
  const isName = s.primary === "name";
  const callout = riderLabelModel(s, SAMPLE).callout;

  return (
    <fieldset className="panel flex flex-col gap-5">
      <legend className="px-1 text-xl font-extrabold">{division ? T.divisionHeading : T.heading}</legend>
      <p className="font-semibold">{division ? T.divisionIntro : T.intro}</p>

      <fieldset className="flex flex-col gap-2">
        <legend>
          <FieldLabel as="span" text={T.lycraQuestion} help={help["ident.lycraQuestion"]} />
        </legend>
        <label className="flex items-center gap-3 font-bold">
          <input type="radio" name="lycras" checked={lycras} onChange={() => answerLycras(true)} />
          {T.lycraYes}
        </label>
        <label className="flex items-center gap-3 font-bold">
          <input type="radio" name="lycras" checked={isName} onChange={() => answerLycras(false)} />
          {T.lycraNo}
        </label>
        <p className="text-sm font-semibold">{T.lycraHint}</p>
      </fieldset>

      <div className="flex flex-col gap-1">
        <FieldLabel htmlFor="ident-preset" text={T.preset} help={help["ident.preset"]} />
        <select id="ident-preset" value={value.basedOn ?? ""} onChange={(e) => pickPreset(e.target.value)}>
          {value.basedOn && !list.some((p) => p.id === value.basedOn) ? <option value={value.basedOn}>{value.basedOn}</option> : null}
          {!value.basedOn ? <option value="">{T.custom}</option> : null}
          {list.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {s.description ? <p className="text-sm font-semibold">{s.description}</p> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="ident-primary" text={T.primary} help={help["ident.primary"]} />
          <select id="ident-primary" value={s.primary} onChange={(e) => set(["primary"], e.target.value)}>
            {PrimaryIdentifierSchema.options.map((o) => (
              <option key={o} value={o}>
                {T.identifiers[o]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="ident-fallback" text={T.fallback} help={help["ident.fallback"]} />
          <select id="ident-fallback" value={s.fallbackPrimary ?? ""} onChange={(e) => set(["fallbackPrimary"], e.target.value || undefined)}>
            <option value="">{T.noFallback}</option>
            {PrimaryIdentifierSchema.options
              .filter((o) => o !== s.primary)
              .map((o) => (
                <option key={o} value={o}>
                  {T.identifiers[o]}
                </option>
              ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="ident-callout" text={T.callout} help={help["ident.callout"]} />
          <select id="ident-callout" value={s.calloutLabel} onChange={(e) => set(["calloutLabel"], e.target.value)}>
            {Object.entries(T.callouts).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="ident-vest" text={T.lycras} help={help["ident.lycras"]} />
          <select id="ident-vest" value={s.vestAssignment} onChange={(e) => set(["vestAssignment"], e.target.value)}>
            {Object.entries(T.lycraAssign).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="ident-bib" text={T.bibs} help={help["ident.bibs"]} />
          <select id="ident-bib" value={s.bibNumbering} onChange={(e) => set(["bibNumbering"], e.target.value)}>
            {Object.entries(T.bibNumbering).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <fieldset className="flex flex-col gap-1">
          <legend>
            <FieldLabel as="span" text={T.secondary} help={help["ident.secondary"]} />
          </legend>
          {SecondaryIdentifierSchema.options.map((o) => (
            <label key={o} className="flex items-center gap-3 font-semibold">
              <input type="checkbox" checked={s.secondary.includes(o)} onChange={() => toggle("secondary", o)} />
              {T.identifiers[o]}
            </label>
          ))}
        </fieldset>
        <fieldset className="flex flex-col gap-1">
          <legend>
            <FieldLabel as="span" text={T.kiteFields} help={help["ident.kiteFields"]} />
          </legend>
          {(["brand", "model", "size", "colours"] as const).map((o) => (
            <label key={o} className="flex items-center gap-3 font-semibold">
              <input type="checkbox" checked={s.kiteFields.includes(o)} onChange={() => toggle("kiteFields", o)} />
              {T.kite[o]}
            </label>
          ))}
        </fieldset>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend>
          <FieldLabel as="span" text={T.palette} help={help["ident.palette"]} />
        </legend>
        {s.palette.map((c, i) => (
          <div key={c.key} className="flex flex-wrap items-center gap-2">
            <input type="color" aria-label={T.colourPicker(c.label)} value={c.hex} onChange={(e) => set(["palette", i, "hex"], e.target.value)} className="!min-h-[48px] w-14 p-1" />
            <input aria-label={T.colourName(i + 1)} value={c.label} onChange={(e) => set(["palette", i, "label"], e.target.value)} className="w-40" />
            <button type="button" className="btn" aria-label={T.colourUp(c.label)} disabled={i === 0} onClick={() => onChange({ ...value, scheme: moveIn(s, ["palette"], i, i - 1) })}>
              {copy.common.up}
            </button>
            <button type="button" className="btn" aria-label={T.colourDown(c.label)} disabled={i === s.palette.length - 1} onClick={() => onChange({ ...value, scheme: moveIn(s, ["palette"], i, i + 1) })}>
              {copy.common.down}
            </button>
            <button type="button" className="btn btn-danger" aria-label={T.colourRemove(c.label)} disabled={s.palette.length === 1} onClick={() => onChange({ ...value, scheme: removeIn(s, ["palette", i]) })}>
              {copy.common.remove}
            </button>
          </div>
        ))}
        <div>
          <button
            type="button"
            className="btn"
            onClick={() => {
              let n = s.palette.length + 1;
              while (s.palette.some((c) => c.key === `colour_${n}`)) n++;
              set(["palette", s.palette.length], { key: `colour_${n}`, label: T.newColour(n), hex: "#888888" });
            }}
          >
            {T.addColour}
          </button>
        </div>
      </fieldset>

      {division ? null : (
        <span className="flex items-start gap-2">
          <label className="flex items-center gap-3 font-bold">
            <input type="checkbox" checked={value.allowDivisionOverride} onChange={(e) => onChange({ ...value, allowDivisionOverride: e.target.checked })} />
            {T.allowOverride}
          </label>
        </span>
      )}

      <div className="flex flex-wrap items-center gap-4" aria-live="polite">
        <span className="text-base font-bold">{T.preview}</span>
        <RiderLabel scheme={s} rider={SAMPLE} size="lg" />
        <span className="font-semibold">
          {T.previewCallout} <strong>{callout}</strong>
        </span>
      </div>

      {errors.length > 0 ? (
        <ul role="alert" className="field-error list-disc pl-6">
          {errors.map((e) => (
            <li key={e}>{copy.common.problem(e)}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 border-t-2 border-[#111] pt-4">
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="ident-save-name" text={T.saveName} help={help["ident.savePreset"]} />
          <input id="ident-save-name" value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder={T.presetName} className="w-64" />
        </div>
        <button type="button" className="btn" onClick={savePreset} disabled={pending || presetName.trim().length < 2}>
          {pending ? copy.common.saving : T.savePreset}
        </button>
        {presetError ? (
          <p role="alert" className="field-error w-full">
            {copy.common.problem(presetError)}
          </p>
        ) : null}
      </div>
    </fieldset>
  );
}
