"use client";

import { FieldLabel } from "@/components/help-button";
import { withoutRoundLengths, withRoundLength } from "@/lib/format-ui/ladder-kind";
import { copy, help } from "@/lib/ui-copy";

const P = copy.formatSimple.perRound;

export interface RoundLength {
  id: string;
  shortName: string;
  name: string;
  /** The length the ladder's own settings give this round. */
  defaultMin: number;
}

/** "Heat length per round": optional overrides, pre-filled from the ladder's own lengths. Breaks stay global. */
export function PerRoundLengths({ working, rounds, onChange, readOnly }: { working: Record<string, unknown>; rounds: RoundLength[]; onChange: (v: unknown) => void; readOnly?: boolean }) {
  const own = (working.roundDurationMin as Record<string, number> | undefined) ?? {};
  return (
    <fieldset className="flex flex-col gap-2" data-testid="per-round-lengths" disabled={readOnly}>
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
