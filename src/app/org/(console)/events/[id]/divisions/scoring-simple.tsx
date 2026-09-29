"use client";

import { getIn, setIn } from "@/lib/form/path";
import { friendlyMessage } from "@/lib/schema-form/nodes";

const COUNTING = {
  best_n: "The best N tricks count",
  single_best: "Only the single best trick counts",
  best_per_category: "The best trick(s) of each category count",
  all: "Every trick counts",
  none: "No tricks: judges give an overall score only",
} as const;

const AGGREGATE = { mean: "Average of the judges’ marks", trimmed_mean: "Trimmed average (highest and lowest dropped)", median: "Median (the middle mark)" } as const;

function defaultCounting(type: string) {
  switch (type) {
    case "best_n":
      return { type, n: 3, distinctTrickNames: false };
    case "best_per_category":
      return { type, maxPerCategory: 1, requireDistinctCategories: true };
    default:
      return { type };
  }
}

/** The common settings in plain words; everything else is in the Advanced level. Edits the same working model. */
export function ScoringSimple({ working, onChange, errors, readOnly }: { working: unknown; onChange: (v: unknown) => void; errors: Record<string, string>; readOnly?: boolean }) {
  const get = (path: (string | number)[]) => getIn(working, path);
  const set = (path: (string | number)[], v: unknown) => onChange(setIn(working, path, v));
  const num = (v: string): number | "" => (v === "" ? "" : Number(v));
  const err = (key: string) => (errors[key] ? <p className="field-error">✖ {friendlyMessage(errors[key])}</p> : null);

  const counting = get(["heat", "counting"]) as { type: string; n?: number; maxPerCategory?: number };
  const cap = get(["heat", "maxAttemptsPerRider"]) as number | null;
  const impression = get(["heat", "impression"]) as { label: string; scale: { min: number; max: number; step: number } } | null;
  const field = "flex flex-col gap-1";

  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-5">
      <div className={field}>
        <label htmlFor="s-counting">Which tricks count?</label>
        <select id="s-counting" value={counting.type} onChange={(e) => set(["heat", "counting"], defaultCounting(e.target.value))}>
          {Object.entries(COUNTING).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        {counting.type === "best_n" ? (
          <div className={field}>
            <label htmlFor="s-n">How many tricks count (N)</label>
            <input id="s-n" type="number" min={1} step={1} value={counting.n ?? ""} onChange={(e) => set(["heat", "counting", "n"], num(e.target.value))} className="w-28" />
            {err("heat.counting.n")}
          </div>
        ) : null}
        {counting.type === "best_per_category" ? (
          <div className={field}>
            <label htmlFor="s-per-cat">Tricks that count in each category</label>
            <input id="s-per-cat" type="number" min={1} step={1} value={counting.maxPerCategory ?? ""} onChange={(e) => set(["heat", "counting", "maxPerCategory"], num(e.target.value))} className="w-28" />
            <p className="text-sm font-semibold">Different limits per category are in the Advanced level.</p>
            {err("heat.counting.maxPerCategory")}
          </div>
        ) : null}
      </div>

      <div className={field}>
        <label className="flex items-center gap-3 font-bold">
          <input type="checkbox" checked={cap === null} onChange={(e) => set(["heat", "maxAttemptsPerRider"], e.target.checked ? null : 7)} />
          No limit on attempts per rider
        </label>
        {cap !== null ? (
          <div className={field}>
            <label htmlFor="s-cap">Attempts allowed per rider per heat</label>
            <input id="s-cap" type="number" min={1} step={1} value={cap} onChange={(e) => set(["heat", "maxAttemptsPerRider"], num(e.target.value))} className="w-28" />
            {err("heat.maxAttemptsPerRider")}
          </div>
        ) : null}
      </div>

      <div className={field}>
        <label className="flex items-center gap-3 font-bold">
          <input
            type="checkbox"
            checked={impression !== null}
            onChange={(e) => set(["heat", "impression"], e.target.checked ? { label: "Variety", scale: { min: 0, max: 10, step: 0.5 }, weight: 1, required: true } : null)}
          />
          Judges also give one impression / variety mark per rider
        </label>
        {impression ? (
          <div className="flex flex-wrap items-end gap-4">
            <div className={field}>
              <label htmlFor="s-imp-label">Name of the mark</label>
              <input id="s-imp-label" value={impression.label} onChange={(e) => set(["heat", "impression", "label"], e.target.value)} className="w-48" />
              {err("heat.impression.label")}
            </div>
            <div className={field}>
              <label htmlFor="s-imp-min">Lowest</label>
              <input id="s-imp-min" type="number" step="any" value={impression.scale.min} onChange={(e) => set(["heat", "impression", "scale", "min"], num(e.target.value))} className="w-24" />
            </div>
            <div className={field}>
              <label htmlFor="s-imp-max">Highest</label>
              <input id="s-imp-max" type="number" step="any" value={impression.scale.max} onChange={(e) => set(["heat", "impression", "scale", "max"], num(e.target.value))} className="w-24" />
            </div>
            <div className={field}>
              <label htmlFor="s-imp-step">Step</label>
              <input id="s-imp-step" type="number" step="any" min={0} value={impression.scale.step} onChange={(e) => set(["heat", "impression", "scale", "step"], num(e.target.value))} className="w-24" />
            </div>
            {err("heat.impression.scale")}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-4">
        <div className={field}>
          <label htmlFor="s-min-judges">Judges on the panel (fewest)</label>
          <input id="s-min-judges" type="number" min={1} step={1} value={(get(["panel", "minJudges"]) as number | "") ?? ""} onChange={(e) => set(["panel", "minJudges"], num(e.target.value))} className="w-28" />
          {err("panel.minJudges")}
        </div>
        <div className={field}>
          <label htmlFor="s-max-judges">Judges on the panel (most)</label>
          <input id="s-max-judges" type="number" min={1} step={1} value={(get(["panel", "maxJudges"]) as number | "") ?? ""} onChange={(e) => set(["panel", "maxJudges"], num(e.target.value))} className="w-28" />
          {err("panel.maxJudges")}
        </div>
      </div>
      <p className="text-sm font-semibold">Which seats judge which division is set in the Officials step (next release).</p>

      <div className={field}>
        <label htmlFor="s-aggregate">How the judges’ marks are combined</label>
        <select id="s-aggregate" value={String(get(["panel", "aggregate"]))} onChange={(e) => set(["panel", "aggregate"], e.target.value)}>
          {Object.entries(AGGREGATE).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}
