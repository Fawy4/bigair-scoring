"use client";

import { useState, useTransition } from "react";
import { RiderChip } from "@/components/rider-chip";
import { toast } from "@/hooks/use-toast";
import { chipModel } from "@/lib/identification/chip";
import { moveIn, removeIn, setIn } from "@/lib/form/path";
import { IDENTIFIER_LABELS, PrimaryIdentifierSchema, SecondaryIdentifierSchema, type IdentificationScheme } from "@/lib/schemas/identification";
import { saveIdentificationPreset } from "./actions";

const SAMPLE = {
  name: "Sam Sample",
  nationality: "EG",
  sponsor: "Sample Co.",
  slotColour: "red",
  identifiers: { vest_colour: "red", bib: 14, kite: { brand: "North", model: "Orbit", size: 9, colours: "blue/white" }, rashguard_colour: "blue", helmet_colour: "black" },
};

const CALLOUTS = { colour: "The colour (“Red”)", number: "The number (“14”)", kite: "The kite (“Blue Orbit”)" } as const;
const VEST = { per_heat_slot: "Vest colour changes every heat (each slot has a colour)", fixed_per_rider: "One colour per rider for the whole event", none: "No vests" } as const;
const BIB = { none: "No numbers", per_event: "Numbers are unique in the whole event", per_division: "Numbers are unique inside each division" } as const;

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
}: {
  value: IdentificationValue;
  onChange: (v: IdentificationValue) => void;
  presets: IdentificationScheme[];
  organisationId: string;
  errors: string[];
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

  function savePreset() {
    setPresetError(null);
    start(async () => {
      const res = await saveIdentificationPreset({ organisationId, name: presetName, scheme: s });
      if (res.ok) {
        const saved = { ...structuredClone(s), id: `org:${res.key}`, name: res.name };
        setList((l) => [...l.filter((x) => x.id !== saved.id), saved]);
        onChange({ ...value, basedOn: saved.id });
        setPresetName("");
        toast({ title: `Preset “${res.name}” saved` });
      } else setPresetError(res.error);
    });
  }

  return (
    <fieldset className="panel flex flex-col gap-5">
      <legend className="px-1 text-xl font-extrabold">Rider identification</legend>
      <p className="font-semibold">How officials recognise a rider from the beach. Every screen shows the same rider chip built from this scheme.</p>

      <div className="flex flex-col gap-1">
        <label htmlFor="ident-preset">Start from a preset</label>
        <select id="ident-preset" value={value.basedOn ?? ""} onChange={(e) => pickPreset(e.target.value)}>
          {value.basedOn && !list.some((p) => p.id === value.basedOn) ? <option value={value.basedOn}>{value.basedOn}</option> : null}
          {!value.basedOn ? <option value="">Custom (edited)</option> : null}
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
          <label htmlFor="ident-primary">Big label on every chip (primary)</label>
          <select id="ident-primary" value={s.primary} onChange={(e) => set(["primary"], e.target.value)}>
            {PrimaryIdentifierSchema.options.map((o) => (
              <option key={o} value={o}>
                {IDENTIFIER_LABELS[o]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ident-fallback">If the primary is missing on the day (fallback)</label>
          <select id="ident-fallback" value={s.fallbackPrimary ?? ""} onChange={(e) => set(["fallbackPrimary"], e.target.value || undefined)}>
            <option value="">No fallback</option>
            {PrimaryIdentifierSchema.options
              .filter((o) => o !== s.primary)
              .map((o) => (
                <option key={o} value={o}>
                  {IDENTIFIER_LABELS[o]}
                </option>
              ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ident-callout">The spotter calls out</label>
          <select id="ident-callout" value={s.calloutLabel} onChange={(e) => set(["calloutLabel"], e.target.value)}>
            {Object.entries(CALLOUTS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ident-vest">Vests</label>
          <select id="ident-vest" value={s.vestAssignment} onChange={(e) => set(["vestAssignment"], e.target.value)}>
            {Object.entries(VEST).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ident-bib">Bib / sail numbers</label>
          <select id="ident-bib" value={s.bibNumbering} onChange={(e) => set(["bibNumbering"], e.target.value)}>
            {Object.entries(BIB).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <fieldset className="flex flex-col gap-1">
          <legend className="text-base">Small details on the chip (secondary)</legend>
          {SecondaryIdentifierSchema.options.map((o) => (
            <label key={o} className="flex items-center gap-3 font-semibold">
              <input type="checkbox" checked={s.secondary.includes(o)} onChange={() => toggle("secondary", o)} />
              {IDENTIFIER_LABELS[o]}
            </label>
          ))}
        </fieldset>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-base">Kite details to record</legend>
          {(["brand", "model", "size", "colours"] as const).map((o) => (
            <label key={o} className="flex items-center gap-3 font-semibold capitalize">
              <input type="checkbox" checked={s.kiteFields.includes(o)} onChange={() => toggle("kiteFields", o)} />
              {o}
            </label>
          ))}
        </fieldset>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-base">Colour palette (in slot order; colours are always written out as text too)</legend>
        {s.palette.map((c, i) => (
          <div key={c.key} className="flex flex-wrap items-center gap-2">
            <input type="color" aria-label={`${c.label} colour`} value={c.hex} onChange={(e) => set(["palette", i, "hex"], e.target.value)} className="!min-h-[48px] w-14 p-1" />
            <input aria-label={`Name of colour ${i + 1}`} value={c.label} onChange={(e) => set(["palette", i, "label"], e.target.value)} className="w-40" />
            <button type="button" className="btn" aria-label={`Move ${c.label} up`} disabled={i === 0} onClick={() => onChange({ ...value, scheme: moveIn(s, ["palette"], i, i - 1) })}>
              ↑
            </button>
            <button type="button" className="btn" aria-label={`Move ${c.label} down`} disabled={i === s.palette.length - 1} onClick={() => onChange({ ...value, scheme: moveIn(s, ["palette"], i, i + 1) })}>
              ↓
            </button>
            <button type="button" className="btn btn-danger" aria-label={`Remove ${c.label}`} disabled={s.palette.length === 1} onClick={() => onChange({ ...value, scheme: removeIn(s, ["palette", i]) })}>
              Remove
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
              set(["palette", s.palette.length], { key: `colour_${n}`, label: `Colour ${n}`, hex: "#888888" });
            }}
          >
            + Add colour
          </button>
        </div>
      </fieldset>

      <label className="flex items-center gap-3 font-bold">
        <input type="checkbox" checked={value.allowDivisionOverride} onChange={(e) => onChange({ ...value, allowDivisionOverride: e.target.checked })} />
        Allow a different scheme for individual divisions
      </label>

      <div className="flex flex-wrap items-center gap-4" aria-live="polite">
        <span className="text-base font-bold">Preview:</span>
        <RiderChip scheme={s} rider={SAMPLE} size="lg" />
        <span className="font-semibold">
          Spotter calls out: <strong>{previewCallout(s)}</strong>
        </span>
      </div>

      {errors.length > 0 ? (
        <ul role="alert" className="field-error list-disc pl-6">
          {errors.map((e) => (
            <li key={e}>✖ {e}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 border-t-2 border-[#111] pt-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="ident-save-name">Save this scheme as a preset</label>
          <input id="ident-save-name" value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Preset name" className="w-64" />
        </div>
        <button type="button" className="btn" onClick={savePreset} disabled={pending || presetName.trim().length < 2}>
          {pending ? "Saving…" : "Save as preset"}
        </button>
        {presetError ? (
          <p role="alert" className="field-error w-full">
            ✖ {presetError}
          </p>
        ) : null}
      </div>
    </fieldset>
  );
}

function previewCallout(s: IdentificationScheme): string {
  return chipModel(s, SAMPLE).callout;
}
