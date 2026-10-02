"use client";

import { Button } from "@/components/org/button";
import { HelpTip } from "@/components/org/help-tip";
import { NumberField } from "@/components/org/number-field";
import { SettingRow } from "@/components/org/setting-row";
import type { RoundLengthRow } from "@/lib/format-ui/per-round";
import { warmUpOf, withoutRoundLengths, withoutRoundWarmUps, withRoundLength, withRoundWarmUp, withWarmUp } from "@/lib/format-ui/ladder-kind";
import { copy, help } from "@/lib/ui-copy";

const P = copy.formatSimple.perRound;

export type RoundLength = RoundLengthRow;

/**
 * "Heat length per round": a table with one row for each round of the preview, each box pre-filled with the length that round has now.
 * Leaving a box blank (or typing the division's length again) gives the round the division's heat length. Breaks stay global.
 * With no rows it says why, in a sentence, instead of showing an empty frame.
 */
export function PerRoundLengths({ working, rounds, onChange, readOnly, emptyReason }: { working: Record<string, unknown>; rounds: RoundLength[]; onChange: (v: unknown) => void; readOnly?: boolean; emptyReason?: string }) {
  const own = (working.roundDurationMin as Record<string, number> | undefined) ?? {};
  const ownWarm = (working.roundWarmUpMin as Record<string, number> | undefined) ?? {};
  const warm = warmUpOf(working);
  const baseLength = rounds[0]?.defaultMin;
  return (
    <fieldset className="org-new flex min-w-0 flex-col gap-2" data-testid="per-round-lengths" disabled={readOnly}>
      <legend className="flex items-center gap-1 text-body font-semibold">
        {P.heading}
        <HelpTip what={P.heading} text={help["format.perRound"].text} example={help["format.perRound"].example} />
      </legend>
      <p className="text-small font-medium text-beach-muted" data-testid="per-round-note">
        {P.note(baseLength)}
      </p>
      <WarmUpField working={working} onChange={onChange} readOnly={readOnly} />
      {rounds.length === 0 ? (
        <p className="rounded-[8px] border border-beach-line bg-beach-surface px-3 py-2 text-body font-semibold" data-testid="per-round-empty">
          {emptyReason ?? P.empty}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-beach-line">
          <table className="w-full min-w-[22rem] border-collapse text-body" data-testid="per-round-table">
            <caption className="sr-only">{P.heading}</caption>
            <thead>
              <tr className="bg-beach-surface text-left text-small font-semibold text-beach-muted">
                <th scope="col" className="px-3 py-2">
                  {P.colRound}
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  {P.colLength}
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  {P.colWarmUp}
                </th>
              </tr>
            </thead>
            <tbody>
              {rounds.map((r) => {
                const custom = own[r.id] !== undefined;
                return (
                  <tr key={r.id} data-testid={`per-round-row-${r.id}`} className="border-t border-beach-line">
                    <th scope="row" className="px-3 py-1 text-left font-semibold">
                      {P.row(r.shortName, r.name)}
                    </th>
                    <td className="px-3 py-1 text-right">
                      <span className="inline-flex items-center justify-end gap-2">
                        {custom ? <span className="text-small font-medium text-beach-muted">{P.own}</span> : null}
                        <NumberField
                          id={`pr-${r.id}`}
                          label={P.rowLabel(r.shortName)}
                          min={1}
                          max={999}
                          step={0.5}
                          value={custom ? own[r.id] : r.defaultMin}
                          onChange={(v) => onChange(withRoundLength(working, r.id, v, r.defaultMin))}
                          onClear={() => onChange(withRoundLength(working, r.id, "", r.defaultMin))}
                          disabled={readOnly}
                        />
                      </span>
                    </td>
                    <td className="px-3 py-1 text-right">
                      <span className="inline-flex items-center justify-end gap-2">
                        {ownWarm[r.id] !== undefined ? <span className="text-small font-medium text-beach-muted">{copy.formatSimple.warmUp.own}</span> : null}
                        <NumberField
                          label={copy.formatSimple.warmUp.rowLabel(r.shortName)}
                          min={0}
                          max={999}
                          step={0.5}
                          value={ownWarm[r.id] !== undefined ? ownWarm[r.id] : warm}
                          onChange={(v) => onChange(withRoundWarmUp(working, r.id, v, warm))}
                          onClear={() => onChange(withRoundWarmUp(working, r.id, "", warm))}
                          disabled={readOnly}
                        />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {Object.keys(own).length > 0 || Object.keys(ownWarm).length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {Object.keys(own).length > 0 ? (
            <Button variant="secondary" onClick={() => onChange(withoutRoundLengths(working))}>
              {P.reset}
            </Button>
          ) : null}
          {Object.keys(ownWarm).length > 0 ? (
            <Button variant="secondary" onClick={() => onChange(withoutRoundWarmUps(working))}>
              {copy.formatSimple.warmUp.reset}
            </Button>
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
    <SettingRow id="warm-up" label={W.heading} explanation={W.note} example={help["format.warmUp"].example ?? ""}>
      <NumberField id="warm-up-single" label={W.heading} min={0} max={999} step={0.5} value={warmUpOf(working)} disabled={readOnly} onChange={(v) => onChange(withWarmUp(working, v))} onClear={() => onChange(withWarmUp(working, ""))} />
    </SettingRow>
  );
}
