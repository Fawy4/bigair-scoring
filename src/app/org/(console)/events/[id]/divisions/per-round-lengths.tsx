"use client";

import { FieldLabel } from "@/components/help-button";
import type { RoundLengthRow } from "@/lib/format-ui/per-round";
import { warmUpOf, withoutRoundLengths, withoutRoundWarmUps, withRoundLength, withRoundWarmUp, withWarmUp } from "@/lib/format-ui/ladder-kind";
import { copy, help } from "@/lib/ui-copy";

const P = copy.formatSimple.perRound;

export type RoundLength = RoundLengthRow;

/** "Heat length per round": optional overrides, pre-filled from the ladder's own lengths. Breaks stay global. */
export function PerRoundLengths({ working, rounds, onChange, readOnly }: { working: Record<string, unknown>; rounds: RoundLength[]; onChange: (v: unknown) => void; readOnly?: boolean }) {
  const own = (working.roundDurationMin as Record<string, number> | undefined) ?? {};
  const ownWarm = (working.roundWarmUpMin as Record<string, number> | undefined) ?? {};
  const warm = warmUpOf(working);
  return (
    <fieldset className="flex flex-col gap-2" data-testid="per-round-lengths" disabled={readOnly}>
      <legend>
        <FieldLabel as="span" text={P.heading} help={help["format.perRound"]} />
      </legend>
      <p className="text-sm font-semibold">{P.note}</p>
      <WarmUpField working={working} onChange={onChange} readOnly={readOnly} />
      {rounds.length === 0 ? (
        <p className="font-bold" data-testid="per-round-empty">
          {P.empty}
        </p>
      ) : null}
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
                <td className="py-2 pl-3">
                  <input
                    aria-label={copy.formatSimple.warmUp.rowLabel(r.shortName)}
                    type="number"
                    min={0}
                    step="any"
                    value={ownWarm[r.id] !== undefined ? ownWarm[r.id] : warm}
                    onChange={(e) => onChange(withRoundWarmUp(working, r.id, e.target.value === "" ? "" : Number(e.target.value), warm))}
                    className="w-24"
                  />
                </td>
                <td className="py-2 pl-3 text-sm font-bold">{ownWarm[r.id] !== undefined ? copy.formatSimple.warmUp.own : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {Object.keys(own).length > 0 || Object.keys(ownWarm).length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {Object.keys(own).length > 0 ? (
            <button type="button" className="btn" onClick={() => onChange(withoutRoundLengths(working))}>
              {P.reset}
            </button>
          ) : null}
          {Object.keys(ownWarm).length > 0 ? (
            <button type="button" className="btn" onClick={() => onChange(withoutRoundWarmUps(working))}>
              {copy.formatSimple.warmUp.reset}
            </button>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}

/** "Warm-up before each heat (minutes)": one number for the division, default 0; a round can have its own in the table. */
export function WarmUpField({ working, onChange, readOnly }: { working: Record<string, unknown>; onChange: (v: unknown) => void; readOnly?: boolean }) {
  const W = copy.formatSimple.warmUp;
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel htmlFor="warm-up-single" text={W.heading} help={help["format.warmUp"]} />
      <input
        id="warm-up-single"
        type="number"
        min={0}
        step="any"
        disabled={readOnly}
        className="w-28"
        value={warmUpOf(working)}
        onChange={(e) => onChange(withWarmUp(working, e.target.value === "" ? "" : Math.max(0, Number(e.target.value))))}
      />
      <p className="text-sm font-semibold">{W.note}</p>
    </div>
  );
}
