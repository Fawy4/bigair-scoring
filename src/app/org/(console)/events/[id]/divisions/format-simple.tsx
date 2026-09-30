"use client";

import { useEffect, useRef, useState } from "react";
import { FieldLabel, HelpButton } from "@/components/help-button";
import { getIn, setIn } from "@/lib/form/path";
import { GENERATOR, heatSizes, ladderKindOf, TARGET_KEY, withHeatTarget, withLadderKind, withMinRiders, withoutRoundLengths, withRoundLength, type LadderKind } from "@/lib/format-ui/ladder-kind";
import { copy, help } from "@/lib/ui-copy";

const T = copy.formatSimple;

/** The tag printed under each ladder type: how many heats a rider is guaranteed. */
const TAG: Record<Exclude<LadderKind, "custom">, string> = { knockout: T.tags.canBeOut, second_chance: T.tags.atLeastTwo, pools: T.tags.canBeOut };

interface NumberField {
  path: string[];
  label: string;
  help: string;
}

function fieldsFor(kind: LadderKind): { main: NumberField[]; lengths: NumberField[] } {
  const p = (k: string) => ["generator", "params", k];
  switch (kind) {
    case "knockout":
      return {
        main: [
          { path: p("advancePerHeat"), label: T.advancePerHeat, help: "format.advance" },
          { path: p("finalSize"), label: T.finalSize, help: "format.finalSize" },
        ],
        lengths: [
          { path: p("earlyMin"), label: T.lengthEarly, help: "format.length" },
          { path: p("semiMin"), label: T.lengthSemi, help: "format.length" },
          { path: p("finalMin"), label: T.lengthFinal, help: "format.length" },
        ],
      };
    case "second_chance":
      return {
        main: [{ path: p("finalSize"), label: T.finalSize, help: "format.finalSize" }],
        lengths: [
          { path: p("r1Min"), label: T.lengthR1, help: "format.length" },
          { path: p("repMin"), label: T.lengthRep, help: "format.length" },
          { path: p("koMin"), label: T.lengthKo, help: "format.length" },
          { path: p("finalMin"), label: T.lengthFinal, help: "format.length" },
        ],
      };
    case "pools":
      return {
        main: [{ path: p("finalists"), label: T.finalists, help: "format.finalists" }],
        lengths: [
          { path: p("poolMin"), label: T.lengthPool, help: "format.length" },
          { path: p("finalMin"), label: T.lengthFinal, help: "format.length" },
        ],
      };
    default:
      return { main: [], lengths: [] };
  }
}

/**
 * The ladder type choice and its plain numbers. These are the Simple settings: they stay on screen when "Show all settings"
 * is on, and the full form appears below them.
 */
export function FormatSimple({
  working,
  onChange,
  errors,
  readOnly,
  rounds = [],
}: {
  /** Rounds of the preview below, with the length the single settings give them. */
  rounds?: Array<{ id: string; shortName: string; name: string; defaultMin: number }>;
  working: Record<string, unknown>;
  onChange: (v: unknown) => void;
  errors: Record<string, string>;
  readOnly?: boolean;
}) {
  const kind = ladderKindOf(working);
  const num = (v: string): number | "" => (v === "" ? "" : Number(v));
  const set = (path: string[], v: unknown) => onChange(setIn(working, path, v));
  const shown = fieldsFor(kind);
  const sizes = heatSizes(working);

  const numberInput = (f: NumberField, onValue?: (v: number | "") => void) => {
    const id = `fs-${f.path.join("-")}`;
    const value = getIn(working, f.path);
    const e = errors[f.path.join(".")];
    return (
      <div key={id} className="flex flex-col gap-1">
        <FieldLabel htmlFor={id} text={f.label} help={help[f.help]} />
        <input
          id={id}
          type="number"
          min={1}
          step="any"
          value={typeof value === "number" ? value : ""}
          onChange={(ev) => (onValue ? onValue(num(ev.target.value)) : set(f.path, num(ev.target.value)))}
          className="w-28"
          aria-invalid={Boolean(e)}
        />
        {e ? <p className="field-error">{copy.common.problem(e)}</p> : null}
      </div>
    );
  };

  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-5">
      <legend className="sr-only">{T.typeLegend}</legend>
      <div className="flex flex-col gap-3">
        <FieldLabel as="span" text={T.typeHeading} help={help["format.type"]} />
        {(Object.keys(GENERATOR) as Array<Exclude<LadderKind, "custom">>).map((k) => (
          <div key={k} className="flex flex-col gap-1 rounded-lg border-2 border-[#111] p-3">
            <span className="flex items-start gap-2">
              <label className="flex items-center gap-3 text-lg font-bold">
                <input type="radio" name="ladder-kind" checked={kind === k} onChange={() => onChange(withLadderKind(working, k))} />
                {T.types[k].title}
              </label>
              <HelpButton what={T.types[k].title} help={{ text: T.types[k].explain, example: T.types[k].example.replace(/^Example:\s*/, "") }} />
            </span>
            <p className="pl-9 font-semibold">{T.types[k].explain}</p>
            <p className="pl-9 text-sm font-semibold">{T.types[k].example}</p>
            <p className="pl-9 text-sm font-extrabold" data-testid={`tag-${k}`}>
              {TAG[k]}
            </p>
          </div>
        ))}
        {kind === "custom" ? <p className="panel font-semibold">{T.customActive}</p> : null}
      </div>

      {kind !== "custom" && sizes ? (
        <>
          <div className="flex flex-wrap gap-4">
            {numberInput({ path: ["generator", "params", TARGET_KEY[kind]], label: kind === "pools" ? T.ridersPerPool : T.ridersPerHeat, help: "format.heatSize" }, (v) => onChange(withHeatTarget(working, v)))}
            <div className="flex flex-col gap-1">
              <FieldLabel htmlFor="fs-min-riders" text={T.minRiders} help={help["format.minHeat"]} />
              <MinRidersInput value={sizes.min} invalid={Boolean(errors["generator.params.minHeatSize"])} onCommit={(v) => onChange(withMinRiders(working, v))} />
              {errors["generator.params.minHeatSize"] ? <p className="field-error">{copy.common.problem(errors["generator.params.minHeatSize"])}</p> : null}
            </div>
            {shown.main.map((f) => numberInput(f))}
          </div>
          {kind === "second_chance" ? <p className="font-semibold">{T.secondChanceFixed}</p> : null}
          <fieldset className="flex flex-col gap-2">
            <legend className="text-base font-extrabold">{T.heatLengths}</legend>
            <div className="flex flex-wrap gap-4">{shown.lengths.map((f) => numberInput(f))}</div>
          </fieldset>
          <div className="flex flex-wrap gap-4">
            {numberInput({ path: ["timing", "defaultBreakAfterHeatMin"], label: T.breakHeat, help: "format.breakHeat" })}
            {numberInput({ path: ["timing", "defaultBreakAfterRoundMin"], label: T.breakRound, help: "format.breakRound" })}
          </div>
          <p className="text-sm font-semibold">{T.breaksNote}</p>
        </>
      ) : null}
      {kind !== "custom" && rounds.length > 0 ? <PerRound working={working} rounds={rounds} onChange={onChange} /> : null}
    </fieldset>
  );
}

/** "Heat length per round": optional overrides, pre-filled from the single setting. Breaks stay global. */
function PerRound({ working, rounds, onChange }: { working: Record<string, unknown>; rounds: Array<{ id: string; shortName: string; name: string; defaultMin: number }>; onChange: (v: unknown) => void }) {
  const own = (working.roundDurationMin as Record<string, number> | undefined) ?? {};
  const P = T.perRound;
  return (
    <fieldset className="flex flex-col gap-2" data-testid="per-round-lengths">
      <legend>
        <FieldLabel as="span" text={P.heading} help={help["format.perRound"]} />
      </legend>
      <p className="text-sm font-semibold">{P.note}</p>
      <table className="w-full max-w-xl border-collapse">
        <tbody>
          {rounds.map((r) => {
            const id = `pr-${r.id}`;
            const custom = own[r.id] !== undefined;
            return (
              <tr key={r.id} className="border-b-2 border-[#111]">
                <th scope="row" className="py-2 pr-3 text-left">
                  <label htmlFor={id}>{P.row(r.shortName, r.name)}</label>
                </th>
                <td className="py-2">
                  <input
                    id={id}
                    aria-label={P.rowLabel(r.shortName)}
                    type="number"
                    min={1}
                    step="any"
                    value={custom ? own[r.id] : r.defaultMin}
                    onChange={(e) => onChange(withRoundLength(working, r.id, e.target.value === "" ? "" : Number(e.target.value), r.defaultMin))}
                    className="w-24"
                  />
                </td>
                <td className="py-2 pl-3 text-sm font-bold">{custom ? P.own : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {Object.keys(own).length > 0 ? (
        <div>
          <button type="button" className="btn" onClick={() => onChange(withoutRoundLengths(working))}>
            {P.reset}
          </button>
        </div>
      ) : null}
    </fieldset>
  );
}

export { ladderKindOf };

/**
 * "Minimum riders per heat". It shows the effective value (the default follows the target), but keeps what you type while you
 * type: clearing the box to enter a new number must not snap back to the default under your fingers.
 */
function MinRidersInput({ value, invalid, onCommit }: { value: number; invalid: boolean; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== ref.current) setText(String(value));
  }, [value]);
  return (
    <input
      ref={ref}
      id="fs-min-riders"
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
