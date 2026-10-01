"use client";

import { useEffect, useRef, useState } from "react";
import { NumberField } from "@/components/org/number-field";
import { SelectField } from "@/components/org/setting-controls";
import { SettingRow } from "@/components/org/setting-row";
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
import { HelpTip } from "@/components/org/help-tip";

const T = copy.formatSimple;

/** A number the format uses, shown as a label above its input. */
interface FormatNumber {
  key: string;
  label: string;
  help: string;
  /** Empty means "automatic" (the key is removed). */
  optional?: boolean;
  min?: number;
}

/** The numbers each ladder type uses after the three sizing numbers. */
function extraFields(kind: LadderKind): FormatNumber[] {
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
  onPickLadder,
  errors,
  readOnly,
  minHeats,
}: {
  /** The format being edited; null until one is chosen. */
  working: Record<string, unknown> | null;
  onChange: (v: unknown) => void;
  onPickKind: (kind: GeneratedKind) => void;
  /** The "Custom ladder" card: start a ladder drawn seat by seat. */
  onPickLadder: () => void;
  errors: Record<string, string>;
  readOnly?: boolean;
  /** From the preview: the fewest heats any rider rides with the current numbers. The chosen card's tag follows it. */
  minHeats?: number | null;
}) {
  const kind: LadderKind | null = working ? ladderKindOf(working) : null;
  const sizes = working ? heatSizes(working) : null;
  const err = (key: string) => errors[`generator.params.${key}`];

  const tagFor = (k: GeneratedKind) => (kind === k && typeof minHeats === "number" ? minHeats >= 2 : AT_LEAST_TWO[k]) ? T.tags.atLeastTwo : T.tags.canBeOut;

  /** One number of the format as a setting row: label, one line, a “?” with an example, and a box as wide as its largest number. */
  const row = (id: string, label: string, helpKey: string, control: React.ReactNode, error?: string) => (
    <div key={id}>
      <SettingRow id={id} label={label} explanation={help[helpKey].line ?? help[helpKey].text} detail={help[helpKey].line ? help[helpKey].text : undefined} example={help[helpKey].example ?? ""}>
        {control}
      </SettingRow>
      {error ? <p className="field-error">{copy.common.problem(error)}</p> : null}
    </div>
  );

  const numberInput = (f: FormatNumber) => {
    if (!working) return null;
    const value = paramOf(working, f.key);
    return row(
      `fs-${f.key}`,
      f.label,
      f.help,
      <NumberField
        id={`fs-${f.key}`}
        label={f.label}
        min={f.min ?? 1}
        max={200}
        value={typeof value === "number" ? value : null}
        placeholder={f.optional ? T.advanceAuto : undefined}
        onChange={(v) => onChange(withParam(working, f.key, v))}
        onClear={() => onChange(withParam(working, f.key, ""))}
        disabled={readOnly}
      />,
      err(f.key),
    );
  };

  const target = kind && kind !== "custom" && kind !== "ladder" ? TARGET_KEY[kind] : null;

  const card = (selected: boolean, radio: React.ReactNode, tag: React.ReactNode, tip: React.ReactNode, explain: string | null) => (
    <div className={`flex flex-col rounded-[8px] border pl-3 ${selected ? "border-beach-accent bg-beach-surface" : "border-beach-line"}`} data-selected={selected}>
      <div className="flex items-center justify-between gap-2">
        {radio}
        {tip}
      </div>
      <p className="-mt-2 pb-1 text-small font-semibold text-beach-muted">{tag}</p>
      {explain ? (
        <p className="pb-1 pr-3 text-small font-medium text-beach-muted" data-testid="kind-explain">
          {explain}
        </p>
      ) : null}
    </div>
  );

  return (
    <fieldset disabled={readOnly} className="org-new flex min-w-0 flex-col gap-2">
      <legend className="sr-only">{T.typeLegend}</legend>
      <div className="flex flex-col gap-2">
        <span className="sr-only">{T.typeHeading}</span>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2" role="radiogroup" aria-label={T.typeHeading}>
          {KINDS.map((k) => (
            <div key={k}>
              {card(
                kind === k,
                <label className="flex min-h-[var(--org-ctl)] items-center gap-3 text-body font-semibold">
                  <input type="radio" name="ladder-kind" checked={kind === k} onChange={() => onPickKind(k)} />
                  {T.types[k].title}
                </label>,
                <span data-testid={`tag-${k}`}>{tagFor(k)}</span>,
                <HelpTip what={T.types[k].title} text={T.types[k].explain} example={T.types[k].example} />,
                kind === k ? T.types[k].explain : null,
              )}
            </div>
          ))}
          {card(
            kind === "ladder",
            <label className="flex min-h-[var(--org-ctl)] items-center gap-3 text-body font-semibold">
              <input type="radio" name="ladder-kind" checked={kind === "ladder"} onChange={() => onPickLadder()} />
              {T.customLadder.title}
            </label>,
            <span data-testid="tag-ladder">{T.customLadder.tag}</span>,
            <HelpTip what={T.customLadder.title} text={T.customLadder.explain} example={T.customLadder.example} />,
            kind === "ladder" ? T.customLadder.explain : null,
          )}
        </div>
        {kind === "custom" ? <p className="rounded-[8px] border border-beach-line bg-beach-surface px-3 py-2 text-body font-semibold">{T.customActive}</p> : null}
      </div>

      {working && kind && kind !== "custom" && kind !== "ladder" ? (
        <div aria-label={T.numbersLabel} role="group" data-testid="format-numbers" className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
          {kind === "single_final" || !sizes ? (
            <p className="py-2 text-body font-semibold">{T.noNumbers}</p>
          ) : (
            <>
              {target
                ? row(
                    `fs-${target}`,
                    kind === "pools" ? T.ridersPerPool : T.ridersPerHeat,
                    "format.heatSize",
                    <SizeField id={`fs-${target}`} label={kind === "pools" ? T.ridersPerPool : T.ridersPerHeat} value={typeof paramOf(working, target) === "number" ? (paramOf(working, target) as number) : sizes.target} onCommit={(v) => onChange(withHeatTarget(working, v))} />,
                    err(target),
                  )
                : null}
              {row("fs-min-riders", T.minRiders, "format.minHeat", <SizeField id="fs-min-riders" label={T.minRiders} value={sizes.min} onCommit={(v) => onChange(withMinRiders(working, v))} />, err("minHeatSize"))}
              {row("fs-max-riders", T.maxRiders, "format.maxHeat", <SizeField id="fs-max-riders" label={T.maxRiders} value={sizes.max} onCommit={(v) => onChange(withMaxRiders(working, v))} />, err("maxHeatSize"))}
              {extraFields(kind).map((f) => numberInput(f))}
              {kind === "second_chance"
                ? row(
                    "fs-second-chance",
                    T.secondChancePlaces,
                    "format.secondChancePlaces",
                    <SelectField
                      id="fs-second-chance"
                      label={T.secondChancePlaces}
                      value={String(getIn(working, ["generator", "params", "secondChancePlaces"]) ?? "")}
                      onChange={(v) => onChange(withSecondChancePlaces(working, v === "" ? "" : Number(v)))}
                      options={[["", T.secondChanceAll], ...[1, 2, 3, 4].map((n) => [String(n), T.secondChanceDepth(n)] as [string, string])]}
                    />,
                  )
                : null}
              {kind === "round_robin" ? <PointsTable working={working} onChange={onChange} invalid={Boolean(err("pointsTable"))} row={row} /> : null}
            </>
          )}
        </div>
      ) : null}
    </fieldset>
  );
}

/** "Points table": 1st, 2nd, 3rd … separated by commas; empty = heat size + 1 − place. Keeps what you type until it is a valid list. */
function PointsTable({ working, onChange, invalid, row }: { working: Record<string, unknown>; onChange: (v: unknown) => void; invalid: boolean; row: (id: string, label: string, helpKey: string, control: React.ReactNode, error?: string) => React.ReactNode }) {
  const stored = paramOf(working, "pointsTable");
  const shown = Array.isArray(stored) ? stored.join(", ") : "";
  const [text, setText] = useState(shown);
  const [bad, setBad] = useState(false);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(shown);
  }, [shown]);
  return row(
    "fs-points-table",
    T.pointsTable,
    "format.pointsTable",
    <input
      id="fs-points-table"
      aria-label={T.pointsTable}
      value={text}
      placeholder={T.pointsPlaceholder}
      className="h-[var(--org-ctl)] w-40 rounded-[8px] border border-beach-border bg-beach-bg px-3 text-digit font-semibold tabular-nums text-right"
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
    />,
    bad ? T.pointsInvalid : undefined,
  );
}

export { ladderKindOf, GENERATOR };

/** A size box (target, minimum or maximum): a NumberField that shows the effective value (a default follows the target). */
function SizeField({ id, label, value, onCommit }: { id: string; label: string; value: number; onCommit: (v: number) => void }) {
  return <NumberField id={id} label={label} value={value} min={1} max={99} onChange={onCommit} />;
}
