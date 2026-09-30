"use client";

import { FieldLabel, HelpButton } from "@/components/help-button";
import { getIn, setIn } from "@/lib/form/path";
import { friendlyMessage } from "@/lib/schema-form/nodes";
import { describePanel, panelRule } from "@/lib/scoring-ui/describe";
import { copy, help } from "@/lib/ui-copy";

const T = copy.scoringSimple;

type Aggregate = "mean" | "trimmed_mean" | "median";

/** Only what the owner's default needs: best N of M attempts, judges, how their scores are combined, Impression / Variety score. */
export function ScoringSimple({ working, onChange, errors, readOnly }: { working: unknown; onChange: (v: unknown) => void; errors: Record<string, string>; readOnly?: boolean }) {
  const get = (path: (string | number)[]) => getIn(working, path);
  const set = (path: (string | number)[], v: unknown) => onChange(setIn(working, path, v));
  const num = (v: string): number | "" => (v === "" ? "" : Number(v));
  const err = (key: string) => (errors[key] ? <p className="field-error">{copy.common.problem(friendlyMessage(errors[key]))}</p> : null);

  const counting = get(["heat", "counting"]) as { type: string; n?: number };
  const cap = get(["heat", "maxAttemptsPerRider"]) as number | null;
  const impression = get(["heat", "impression"]) as { label: string; scale: { min: number; max: number; step: number } } | null;
  const panel = get(["panel"]) as { minJudges: number; maxJudges: number; aggregate: Aggregate; trimMinJudges: number };
  const field = "flex flex-col gap-1";

  // one number of judges: the panel size the rules are designed for; the largest allowed panel never drops below it
  function setJudges(v: number | "") {
    let next = setIn(working, ["panel", "minJudges"], v);
    if (typeof v === "number" && panel.maxJudges < v) next = setIn(next, ["panel", "maxJudges"], v);
    onChange(next);
  }

  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-5">
      {counting.type === "best_n" ? (
        <div className={field}>
          <FieldLabel htmlFor="s-n" text={T.n} help={help["scoring.n"]} />
          <input id="s-n" type="number" min={1} step={1} value={counting.n ?? ""} onChange={(e) => set(["heat", "counting", "n"], num(e.target.value))} className="w-28" />
          {err("heat.counting.n")}
        </div>
      ) : (
        <p className="panel font-semibold">{T.countingOther}</p>
      )}

      <div className={field}>
        <span className="flex items-start gap-2">
          <label className="flex items-center gap-3 font-bold">
            <input type="checkbox" checked={cap === null} onChange={(e) => set(["heat", "maxAttemptsPerRider"], e.target.checked ? null : 7)} />
            {T.noLimit}
          </label>
          <HelpButton what={T.noLimit} help={help["scoring.attempts"]} />
        </span>
        {cap !== null ? (
          <div className={field}>
            <FieldLabel htmlFor="s-cap" text={T.attempts} help={help["scoring.attempts"]} />
            <input id="s-cap" type="number" min={1} step={1} value={cap} onChange={(e) => set(["heat", "maxAttemptsPerRider"], num(e.target.value))} className="w-28" />
            {err("heat.maxAttemptsPerRider")}
          </div>
        ) : null}
      </div>

      <div className={field}>
        <FieldLabel htmlFor="s-judges" text={T.judges} help={help["scoring.judges"]} />
        <input id="s-judges" type="number" min={1} step={1} value={panel.minJudges ?? ""} onChange={(e) => setJudges(num(e.target.value))} className="w-28" />
        <p className="text-sm font-semibold">{T.judgesHint}</p>
        {err("panel.minJudges")}
      </div>

      <div className={field}>
        <FieldLabel htmlFor="s-aggregate" text={T.aggregate} help={help["scoring.aggregate"]} />
        <select id="s-aggregate" value={panel.aggregate} onChange={(e) => set(["panel", "aggregate"], e.target.value)}>
          {Object.entries(T.aggregateOptions).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <p className="panel text-lg font-bold" data-testid="panel-sentence" aria-live="polite">
          {describePanel(panel)}
        </p>
        {panel.aggregate === "trimmed_mean" ? <p className="text-sm font-semibold">{panelRule(panel.trimMinJudges)}</p> : null}
      </div>

      <div className={field}>
        <span className="flex items-start gap-2">
          <label className="flex items-center gap-3 font-bold">
            <input
              type="checkbox"
              checked={impression !== null}
              onChange={(e) => set(["heat", "impression"], e.target.checked ? { label: T.defaultImpressionLabel, scale: { min: 0, max: 10, step: 0.5 }, weight: 1, required: true } : null)}
            />
            {T.impression}
          </label>
          <HelpButton what={T.impression} help={help["scoring.impression"]} />
        </span>
        {impression ? (
          <div className="flex flex-wrap items-end gap-4">
            <div className={field}>
              <FieldLabel htmlFor="s-imp-label" text={T.impressionName} help={help["scoring.impressionName"]} />
              <input id="s-imp-label" value={impression.label} onChange={(e) => set(["heat", "impression", "label"], e.target.value)} className="w-48" />
              {err("heat.impression.label")}
            </div>
            <div className={field}>
              <FieldLabel htmlFor="s-imp-min" text={T.impressionLow} help={help["scoring.impressionRange"]} />
              <input id="s-imp-min" type="number" step="any" value={impression.scale.min} onChange={(e) => set(["heat", "impression", "scale", "min"], num(e.target.value))} className="w-24" />
            </div>
            <div className={field}>
              <label htmlFor="s-imp-max">{T.impressionHigh}</label>
              <input id="s-imp-max" type="number" step="any" value={impression.scale.max} onChange={(e) => set(["heat", "impression", "scale", "max"], num(e.target.value))} className="w-24" />
            </div>
            <div className={field}>
              <label htmlFor="s-imp-step">{T.impressionStep}</label>
              <input id="s-imp-step" type="number" step="any" min={0} value={impression.scale.step} onChange={(e) => set(["heat", "impression", "scale", "step"], num(e.target.value))} className="w-24" />
            </div>
            {err("heat.impression.scale")}
          </div>
        ) : null}
      </div>
      <p className="text-sm font-semibold">{T.seatsNote}</p>
    </fieldset>
  );
}
