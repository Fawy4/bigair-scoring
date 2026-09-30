"use client";

import { useEffect, useRef, useState } from "react";
import { FieldLabel, HelpButton } from "@/components/help-button";
import { getIn } from "@/lib/form/path";
import {
  AT_LEAST_TWO,
  GENERATOR,
  heatSizes,
  KINDS,
  ladderKindOf,
  paramOf,
  TARGET_KEY,
  withHeatTarget,
  withMaxRiders,
  withMinRiders,
  withParam,
  withSecondChancePlaces,
  type GeneratedKind,
  type LadderKind,
} from "@/lib/format-ui/ladder-kind";
import { copy, help } from "@/lib/ui-copy";

const T = copy.formatSimple;

/** A number the format uses, shown as a label above its input. */
interface NumberField {
  key: string;
  label: string;
  help: string;
  /** Empty means "automatic" (the key is removed). */
  optional?: boolean;
  min?: number;
}

/** The numbers each ladder type uses after the three sizing numbers. */
function extraFields(kind: LadderKind): NumberField[] {
  switch (kind) {
    case "knockout":
      return [
        { key: "advancePerHeat", label: T.advancePerHeat, help: "format.advance" },
        { key: "finalSize", label: T.finalSize, help: "format.finalSize" },
      ];
    case "second_chance":
      return [{ key: "finalSize", label: T.finalSize, help: "format.finalSize" }];
    case "double_elimination":
      return [
        { key: "advancePerHeat", label: T.advancePerHeat, help: "format.advanceAuto", optional: true },
        { key: "finalSize", label: T.finalSize, help: "format.finalSize" },
      ];
    case "qualifying":
      return [
        { key: "finalSize", label: T.finalSize, help: "format.finalSize" },
        { key: "smallFinalSize", label: T.smallFinalSize, help: "format.smallFinal", min: 0 },
        { key: "qualifyingRounds", label: T.heatsPerRider, help: "format.heatsPerRider" },
      ];
    case "pools":
      return [{ key: "finalists", label: T.finalists, help: "format.finalists" }];
    case "round_robin":
      return [{ key: "heatsPerRider", label: T.heatsPerRider, help: "format.heatsPerRider" }];
    default:
      return [];
  }
}

/**
 * The ladder type choice and the numbers that type uses. These are Simple settings: they stay on screen when "Show all settings"
 * is on. Choosing a card is the parent's job (it loads that type's built-in format); this component only shows and edits.
 */
export function FormatSimple({
  working,
  onChange,
  onPickKind,
  errors,
  readOnly,
  minHeats,
}: {
  /** The format being edited; null until one is chosen. */
  working: Record<string, unknown> | null;
  onChange: (v: unknown) => void;
  onPickKind: (kind: GeneratedKind) => void;
  errors: Record<string, string>;
  readOnly?: boolean;
  /** From the preview: the fewest heats any rider rides with the current numbers. The chosen card's tag follows it. */
  minHeats?: number | null;
}) {
  const kind: LadderKind | null = working ? ladderKindOf(working) : null;
  const sizes = working ? heatSizes(working) : null;
  const err = (key: string) => errors[`generator.params.${key}`];

  const tagFor = (k: GeneratedKind) => (kind === k && typeof minHeats === "number" ? minHeats >= 2 : AT_LEAST_TWO[k]) ? T.tags.atLeastTwo : T.tags.canBeOut;

  const numberInput = (f: NumberField) => {
    if (!working) return null;
    const id = `fs-${f.key}`;
    const value = paramOf(working, f.key);
    return (
      <div key={id} className="flex flex-col gap-1">
        <FieldLabel htmlFor={id} text={f.label} help={help[f.help]} />
        <input
          id={id}
          type="number"
          min={f.min ?? 1}
          step="any"
          placeholder={f.optional ? T.advanceAuto : undefined}
          value={typeof value === "number" ? value : ""}
          onChange={(ev) => onChange(withParam(working, f.key, ev.target.value === "" ? (f.optional ? "" : ("" as const)) : Number(ev.target.value)))}
          className="w-28"
          aria-invalid={Boolean(err(f.key))}
        />
        {err(f.key) ? <p className="field-error">{copy.common.problem(err(f.key))}</p> : null}
      </div>
    );
  };

  const target = kind && kind !== "custom" ? TARGET_KEY[kind] : null;

  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-4">
      <legend className="sr-only">{T.typeLegend}</legend>
      <div className="flex flex-col gap-2">
        <FieldLabel as="span" text={T.typeHeading} help={help["format.type"]} />
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label={T.typeHeading}>
          {KINDS.map((k) => (
            <div key={k} className="flex flex-col gap-1 rounded-lg border-2 border-[#111] p-3" data-selected={kind === k}>
              <span className="flex items-start gap-2">
                <label className="flex items-center gap-3 text-lg font-bold">
                  <input type="radio" name="ladder-kind" checked={kind === k} onChange={() => onPickKind(k)} />
                  {T.types[k].title}
                </label>
                <HelpButton what={T.types[k].title} help={{ text: T.types[k].explain, example: T.types[k].example }} />
              </span>
              <p className="pl-9 text-sm font-semibold">{T.types[k].explain}</p>
              <p className="pl-9 text-sm font-extrabold" data-testid={`tag-${k}`}>
                {tagFor(k)}
              </p>
            </div>
          ))}
        </div>
        {kind === "custom" ? <p className="panel font-semibold">{T.customActive}</p> : null}
      </div>

      {working && kind && kind !== "custom" ? (
        <div className="flex flex-col gap-2" aria-label={T.numbersLabel} role="group">
          {kind === "single_final" || !sizes ? (
            <p className="font-semibold">{T.noNumbers}</p>
          ) : (
            <div className="flex flex-wrap items-end gap-4" data-testid="format-numbers">
              {target ? (
                <div className="flex flex-col gap-1">
                  <FieldLabel htmlFor={`fs-${target}`} text={kind === "pools" ? T.ridersPerPool : T.ridersPerHeat} help={help["format.heatSize"]} />
                  <SizeInput id={`fs-${target}`} value={typeof paramOf(working, target) === "number" ? (paramOf(working, target) as number) : sizes.target} invalid={Boolean(err(target))} onCommit={(v) => onChange(withHeatTarget(working, v))} />
                  {err(target) ? <p className="field-error">{copy.common.problem(err(target))}</p> : null}
                </div>
              ) : null}
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor="fs-min-riders" text={T.minRiders} help={help["format.minHeat"]} />
                <SizeInput id="fs-min-riders" value={sizes.min} invalid={Boolean(err("minHeatSize"))} onCommit={(v) => onChange(withMinRiders(working, v))} />
                {err("minHeatSize") ? <p className="field-error">{copy.common.problem(err("minHeatSize"))}</p> : null}
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor="fs-max-riders" text={T.maxRiders} help={help["format.maxHeat"]} />
                <SizeInput id="fs-max-riders" value={sizes.max} invalid={Boolean(err("maxHeatSize"))} onCommit={(v) => onChange(withMaxRiders(working, v))} />
                {err("maxHeatSize") ? <p className="field-error">{copy.common.problem(err("maxHeatSize"))}</p> : null}
              </div>
              {extraFields(kind).map((f) => numberInput(f))}
              {kind === "second_chance" ? (
                <div className="flex flex-col gap-1">
                  <FieldLabel htmlFor="fs-second-chance" text={T.secondChancePlaces} help={help["format.secondChancePlaces"]} />
                  <select
                    id="fs-second-chance"
                    value={String(getIn(working, ["generator", "params", "secondChancePlaces"]) ?? "")}
                    onChange={(ev) => onChange(withSecondChancePlaces(working, ev.target.value === "" ? "" : Number(ev.target.value)))}
                  >
                    <option value="">{T.secondChanceAll}</option>
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {T.secondChanceDepth(n)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {kind === "round_robin" ? <PointsTable working={working} onChange={onChange} invalid={Boolean(err("pointsTable"))} /> : null}
            </div>
          )}
          {kind !== "single_final" && sizes ? (
            <p className="text-sm font-semibold" data-testid="limits-note">
              {T.limitsNote(sizes.min, sizes.max)}
            </p>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}

/** "Points table": 1st, 2nd, 3rd … separated by commas; empty = heat size + 1 − place. Keeps what you type until it is a valid list. */
function PointsTable({ working, onChange, invalid }: { working: Record<string, unknown>; onChange: (v: unknown) => void; invalid: boolean }) {
  const stored = paramOf(working, "pointsTable");
  const shown = Array.isArray(stored) ? stored.join(", ") : "";
  const [text, setText] = useState(shown);
  const [bad, setBad] = useState(false);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(shown);
  }, [shown]);
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel htmlFor="fs-points-table" text={T.pointsTable} help={help["format.pointsTable"]} />
      <input
        id="fs-points-table"
        value={text}
        placeholder={T.pointsPlaceholder}
        className="w-40"
        aria-invalid={invalid || bad}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          setText(shown);
          setBad(false);
        }}
        onChange={(e) => {
          setText(e.target.value);
          const parts = e.target.value.split(",").map((x) => x.trim()).filter((x) => x !== "");
          const nums = parts.map(Number);
          if (parts.length === 0) {
            setBad(false);
            onChange(withParam(working, "pointsTable", ""));
          } else if (nums.every((n) => Number.isFinite(n) && n >= 0)) {
            setBad(false);
            onChange(withParam(working, "pointsTable", nums));
          } else setBad(true);
        }}
      />
      {bad ? <p className="field-error">{T.pointsInvalid}</p> : null}
    </div>
  );
}

export { ladderKindOf, GENERATOR };

/**
 * A size box (target, minimum or maximum). It shows the effective value (a default follows the target), but keeps what you type
 * while you type: clearing the box to enter a new number must not snap back to the default under your fingers.
 */
function SizeInput({ id, value, invalid, onCommit }: { id: string; value: number; invalid: boolean; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== ref.current) setText(String(value));
  }, [value]);
  return (
    <input
      ref={ref}
      id={id}
      type="number"
      min={1}
      step={1}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value !== "") onCommit(Number(e.target.value));
      }}
      onBlur={() => setText(String(value))}
      className="w-28"
      aria-invalid={invalid}
    />
  );
}
