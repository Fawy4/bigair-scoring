"use client";

import { NumberField } from "@/components/org/number-field";
import { FieldLabel } from "@/components/help-button";
import { addRoundAfter, advanceCount, ladderProblems, placeCount, placeTargets, removeRound, renameRoundField, roundsOf, setPlaceTarget, setRoundSizes } from "@/lib/format-ui/custom-ladder";
import { effectiveMaxHeatSize, effectiveMinHeatSize } from "@/lib/engine/ladder/seeding";
import { copy, help } from "@/lib/ui-copy";

const B = copy.customBuilder;

type Template = Parameters<typeof roundsOf>[0];

/** A whole-number box (the defaults follow the target; what you type is kept while you type). */
function NumberBox({ id, value, onCommit }: { id: string; value: number; onCommit: (v: number) => void }) {
  return <NumberField id={id} label={id} min={1} max={10} value={value} onChange={onCommit} />;
}

/**
 * The visual builder for a custom ladder: one card per round with its heat sizes and a dropdown for every place ("1st → Semi-finals",
 * "2nd → Second chance", "the rest → out"). Where riders come from is worked out from those dropdowns. The diagram (with its own
 * "+ Add round" buttons) and the checks below follow every change.
 */
export function CustomBuilder({ working, onChange, riders, readOnly }: { working: Record<string, unknown>; onChange: (v: unknown) => void; riders: number; readOnly?: boolean }) {
  const template = working as unknown as Template;
  const rounds = roundsOf(template);
  const problems = ladderProblems(template, riders);
  const set = (t: Template) => onChange(t);

  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-4" data-testid="custom-builder">
      <legend className="flex items-center gap-2 text-lg font-extrabold">
        <span>{B.heading}</span>
      </legend>
      <p className="font-semibold">{B.intro}</p>
      {rounds.map((r, i) => {
        const laterIds = rounds.slice(i + 1).map((x) => x.id as string);
        const targets = placeTargets(r);
        const target = r.heatSize ?? 4;
        const options = (
          <>
            {rounds.slice(i + 1).map((x) => (
              <option key={x.id} value={x.id}>
                {B.toRound(x.name ?? x.id)}
              </option>
            ))}
            <option value="eliminated">{B.out}</option>
            <option value="final_placing">{B.finalPlacing}</option>
          </>
        );
        const label = r.name ?? r.id;
        return (
          <section key={r.id} className="flex flex-col gap-3 rounded-lg border-2 border-[#111] p-3" aria-label={B.roundHeading(i + 1, label)} data-testid="custom-round">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-lg font-extrabold">{B.roundHeading(i + 1, label)}</h3>
              {rounds.length > 1 ? (
                <button type="button" className="btn btn-danger" aria-label={B.remove(label)} onClick={() => set(removeRound(template, r.id))}>
                  {B.removeLabel}
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor={`cb-name-${r.id}`} className="font-bold">
                  {B.nameLabel}
                </label>
                <input id={`cb-name-${r.id}`} value={r.name ?? ""} className="w-48" onChange={(e) => set(renameRoundField(template, r.id, e.target.value))} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="font-bold">{B.codeLabel}</span>
                <span className="min-h-[48px] py-3 font-extrabold">{r.id}</span>
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor={`cb-target-${r.id}`} text={copy.formatSimple.ridersPerHeat} help={help["format.heatSize"]} />
                <NumberBox id={`cb-target-${r.id}`} value={target} onCommit={(v) => set(setRoundSizes(template, r.id, { target: v }))} />
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor={`cb-min-${r.id}`} text={copy.formatSimple.minRiders} help={help["format.minHeat"]} />
                <NumberBox id={`cb-min-${r.id}`} value={effectiveMinHeatSize(target, r.minHeatSize)} onCommit={(v) => set(setRoundSizes(template, r.id, { min: v }))} />
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor={`cb-max-${r.id}`} text={copy.formatSimple.maxRiders} help={help["format.maxHeat"]} />
                <NumberBox id={`cb-max-${r.id}`} value={effectiveMaxHeatSize(target, r.maxHeatSize)} onCommit={(v) => set(setRoundSizes(template, r.id, { max: v }))} />
              </div>
            </div>
            <p className="font-bold" data-testid="advance-count">
              {B.advancing(advanceCount(r, laterIds))}
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {targets.places.map((to, k) => {
                const place = copy.ladder.place(k + 1, k + 1);
                return (
                  <div key={k} className="flex flex-col gap-1">
                    <FieldLabel htmlFor={`cb-${r.id}-p${k + 1}`} text={place} help={help["format.place"]} />
                    <select id={`cb-${r.id}-p${k + 1}`} aria-label={B.placeAria(label, place)} value={to} onChange={(e) => set(setPlaceTarget(template, r.id, k + 1, e.target.value))}>
                      {options}
                    </select>
                  </div>
                );
              })}
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor={`cb-${r.id}-rest`} text={B.restLabel} help={help["format.place"]} />
                <select id={`cb-${r.id}-rest`} aria-label={B.restAria(label)} value={targets.rest} onChange={(e) => set(setPlaceTarget(template, r.id, "rest", e.target.value))}>
                  {options}
                </select>
              </div>
            </div>
            <p className="text-sm font-semibold">{`${placeCount(r)} ${placeCount(r) === 1 ? "place" : "places"} can occur in a heat of this round.`}</p>
          </section>
        );
      })}
      <div>
        <button type="button" className="btn" onClick={() => set(addRoundAfter(template, rounds.at(-1)?.id ?? null))}>
          {copy.formatSimple.addRound}
        </button>
      </div>
      <div role="status" className="panel flex flex-col gap-1" data-testid="ladder-problems">
        <p className="font-extrabold">{B.problemsHeading(riders)}</p>
        {problems.length === 0 ? (
          <p className="font-semibold">{B.noProblems(riders)}</p>
        ) : (
          <ul className="list-disc pl-6 font-semibold">
            {problems.map((p) => (
              <li key={p}>{copy.formatSimple.warning(p)}</li>
            ))}
          </ul>
        )}
      </div>
    </fieldset>
  );
}
