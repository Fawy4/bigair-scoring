"use client";

import { FieldLabel, HelpButton } from "@/components/help-button";
import { getIn, setIn } from "@/lib/form/path";
import { ladderKindOf, withLadderKind, GENERATOR, type LadderKind } from "@/lib/format-ui/ladder-kind";
import { copy, help } from "@/lib/ui-copy";

const T = copy.formatSimple;

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
          { path: p("heatSize"), label: T.ridersPerHeat, help: "format.heatSize" },
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
        main: [
          { path: p("r1HeatSize"), label: T.ridersPerHeat, help: "format.heatSize" },
          { path: p("finalSize"), label: T.finalSize, help: "format.finalSize" },
        ],
        lengths: [
          { path: p("r1Min"), label: T.lengthR1, help: "format.length" },
          { path: p("repMin"), label: T.lengthRep, help: "format.length" },
          { path: p("koMin"), label: T.lengthKo, help: "format.length" },
          { path: p("finalMin"), label: T.lengthFinal, help: "format.length" },
        ],
      };
    case "pools":
      return {
        main: [
          { path: p("heatSize"), label: T.ridersPerPool, help: "format.heatSize" },
          { path: p("finalists"), label: T.finalists, help: "format.finalists" },
        ],
        lengths: [
          { path: p("poolMin"), label: T.lengthPool, help: "format.length" },
          { path: p("finalMin"), label: T.lengthFinal, help: "format.length" },
        ],
      };
    default:
      return { main: [], lengths: [] };
  }
}

/** The three-way ladder choice with its numbers. `compact` (Show all settings) keeps only the choice; the rest is in the full form. */
export function FormatSimple({
  working,
  onChange,
  errors,
  readOnly,
  compact,
}: {
  working: Record<string, unknown>;
  onChange: (v: unknown) => void;
  errors: Record<string, string>;
  readOnly?: boolean;
  compact?: boolean;
}) {
  const kind = ladderKindOf(working);
  const num = (v: string): number | "" => (v === "" ? "" : Number(v));
  const set = (path: string[], v: unknown) => onChange(setIn(working, path, v));
  const shown = fieldsFor(kind);

  const numberInput = (f: NumberField) => {
    const id = `fs-${f.path.join("-")}`;
    const value = getIn(working, f.path);
    const e = errors[f.path.join(".")];
    return (
      <div key={id} className="flex flex-col gap-1">
        <FieldLabel htmlFor={id} text={f.label} help={help[f.help]} />
        <input id={id} type="number" min={1} step="any" value={typeof value === "number" ? value : ""} onChange={(ev) => set(f.path, num(ev.target.value))} className="w-28" aria-invalid={Boolean(e)} />
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
          </div>
        ))}
        {kind === "custom" ? <p className="panel font-semibold">{T.customActive}</p> : null}
      </div>

      {!compact && kind !== "custom" ? (
        <>
          <div className="flex flex-wrap gap-4">{shown.main.map(numberInput)}</div>
          {kind === "second_chance" ? <p className="font-semibold">{T.secondChanceFixed}</p> : null}
          <fieldset className="flex flex-col gap-2">
            <legend className="text-base font-extrabold">{T.heatLengths}</legend>
            <div className="flex flex-wrap gap-4">{shown.lengths.map(numberInput)}</div>
          </fieldset>
          <div className="flex flex-wrap gap-4">
            {numberInput({ path: ["timing", "defaultBreakAfterHeatMin"], label: T.breakHeat, help: "format.breakHeat" })}
            {numberInput({ path: ["timing", "defaultBreakAfterRoundMin"], label: T.breakRound, help: "format.breakRound" })}
          </div>
          <p className="text-sm font-semibold">{T.breaksNote}</p>
        </>
      ) : null}
    </fieldset>
  );
}

export { ladderKindOf };
