"use client";

import { Button } from "@/components/org/button";
import { HelpTip } from "@/components/org/help-tip";
import { NumberField } from "@/components/org/number-field";
import { SettingRow } from "@/components/org/setting-row";
import { warmUpOf, withWarmUp } from "@/lib/format-ui/ladder-kind";
import { timingDefaults, withoutRoundTiming, withTimingCell, withTimingDefault, type TimingField, type TimingRow } from "@/lib/format-ui/timing";
import { copy, help } from "@/lib/ui-copy";

const P = copy.formatSimple.perRound;

/**
 * "Timing per round" (Polish 2, item 10): the one place for heat timing. The first line ("Every round") holds the division's warm-up, heat length and break after
 * each heat; one row per round of the preview below, each pre-filled with that round's numbers; a box changed gives the round its own (blank follows the first
 * line). The break after the last heat of a round sits under the table. The preview's time sentence follows at once. These are the starting plan: the run order
 * can still change each heat. With no rows it says why, in a sentence, instead of showing an empty frame.
 */
export function PerRoundLengths({ working, rounds, onChange, readOnly, emptyReason }: { working: Record<string, unknown>; rounds: TimingRow[]; onChange: (v: unknown) => void; readOnly?: boolean; emptyReason?: string }) {
  const d = timingDefaults(working);
  const anyOwn = rounds.some((r) => r.warmUp.own || r.length.own || r.breakAfter.own);
  const box = (id: string | undefined, label: string, value: number, min: number, set: (v: number | "") => void) => (
    <NumberField id={id} label={label} min={min} max={999} step={0.5} value={value} disabled={readOnly} onChange={(v) => set(v)} onClear={() => set("")} />
  );
  const cell = (r: TimingRow, field: TimingField, id: string | undefined, label: string, min: number, ownWord: string) => (
    <td className="px-3 py-1 text-right">
      <span className="inline-flex items-center justify-end gap-2">
        {r[field].own ? <span className="text-small font-medium text-beach-muted">{ownWord}</span> : null}
        {box(id, label, r[field].value, min, (v) => onChange(withTimingCell(working, r.id, field, v, r.defaults[field])))}
      </span>
    </td>
  );
  return (
    <fieldset className="org-new flex min-w-0 flex-col gap-2" data-testid="per-round-lengths" disabled={readOnly}>
      <legend className="flex items-center gap-1 text-body font-semibold">
        {P.heading}
        <HelpTip what={P.heading} text={help["format.perRound"].text} example={help["format.perRound"].example} />
      </legend>
      <p className="text-small font-medium text-beach-muted" data-testid="per-round-note">
        {P.noteTable}
      </p>
      <div className="overflow-x-auto rounded-card border border-beach-line">
        <table className="w-full min-w-[30rem] border-collapse text-body" data-testid="per-round-table">
          <caption className="sr-only">{P.heading}</caption>
          <thead>
            <tr className="bg-beach-surface text-left text-small font-semibold text-beach-muted">
              <th scope="col" className="px-3 py-2">
                {P.colRound}
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                {P.colWarmUp}
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                {P.colLength}
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                {P.colBreak}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr data-testid="per-round-row-all" className="border-t border-beach-line bg-beach-surface">
              <th scope="row" className="px-3 py-1 text-left font-semibold">
                {P.everyRound}
                <span className="block text-small font-medium text-beach-muted">{P.everyRoundHint}</span>
              </th>
              <td className="px-3 py-1 text-right">{box("warm-up-single", P.allWarmUp, warmUpOf(working), 0, (v) => onChange(withWarmUp(working, v)))}</td>
              <td className="px-3 py-1 text-right">{box("timing-all-length", P.allLength, d.length, 1, (v) => onChange(withTimingDefault(working, "length", v)))}</td>
              <td className="px-3 py-1 text-right">{box("timing-all-break", P.allBreak, d.breakAfterHeat, 0, (v) => onChange(withTimingDefault(working, "breakAfter", v)))}</td>
            </tr>
            {rounds.map((r) => (
              <tr key={r.id} data-testid={`per-round-row-${r.id}`} className="border-t border-beach-line">
                <th scope="row" className="px-3 py-1 text-left font-semibold">
                  {P.row(r.shortName, r.name)}
                </th>
                {cell(r, "warmUp", undefined, copy.formatSimple.warmUp.rowLabel(r.shortName), 0, copy.formatSimple.warmUp.own)}
                {cell(r, "length", `pr-${r.id}`, P.rowLabel(r.shortName), 1, P.own)}
                {cell(r, "breakAfter", undefined, P.breakRowLabel(r.shortName), 0, P.ownBreak)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rounds.length === 0 ? (
        <p className="rounded-[8px] border border-beach-line bg-beach-surface px-3 py-2 text-body font-semibold" data-testid="per-round-empty">
          {emptyReason ?? P.empty}
        </p>
      ) : null}
      <SettingRow id="break-after-round" label={P.breakAfterRound} explanation={help["format.breakRound"].text} example={help["format.breakRound"].example ?? ""}>
        {box("timing-break-round", P.breakAfterRound, d.breakAfterRound, 0, (v) => onChange(withTimingDefault(working, "breakAfterRound", v)))}
      </SettingRow>
      {anyOwn ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => onChange(withoutRoundTiming(working))}>
            {P.resetAll}
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}

/** "Warm-up before each heat (minutes)": one number for the division, default 0 (a custom ladder sets each round's in its builder). */
export function WarmUpField({ working, onChange, readOnly }: { working: Record<string, unknown>; onChange: (v: unknown) => void; readOnly?: boolean }) {
  const W = copy.formatSimple.warmUp;
  return (
    <SettingRow id="warm-up" label={W.heading} explanation={W.note} example={help["format.warmUp"].example ?? ""}>
      <NumberField id="warm-up-single" label={W.heading} min={0} max={999} step={0.5} value={warmUpOf(working)} disabled={readOnly} onChange={(v) => onChange(withWarmUp(working, v))} onClear={() => onChange(withWarmUp(working, ""))} />
    </SettingRow>
  );
}
