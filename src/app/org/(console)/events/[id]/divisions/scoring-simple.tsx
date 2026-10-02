"use client";

import { NumberField } from "@/components/org/number-field";
import { SelectField, Toggle } from "@/components/org/setting-controls";
import { SettingRow } from "@/components/org/setting-row";
import { getIn, setIn } from "@/lib/form/path";
import { friendlyMessage } from "@/lib/schema-form/nodes";
import { describePanel, panelRule } from "@/lib/scoring-ui/describe";
import { simpleText, SCORING_SIMPLE } from "@/lib/settings/simple-fields";
import { copy, orgCopy } from "@/lib/ui-copy";

const T = copy.scoringSimple;
type Aggregate = "mean" | "trimmed_mean" | "median";
type Entry = "single" | "criteria" | "none";
type CountingType = "best_n" | "best_per_category" | "single_best" | "all" | "none";
type Scale = { min: number; max: number; step: number };
const field = (id: string) => simpleText(SCORING_SIMPLE.find((f) => f.id === id)!);

/** The four KOTA criteria (docs/02): what "Several criteria" starts with when the rules had none. Edited under More settings. */
const STARTER_CRITERIA = [
  { key: "height", label: "Height", scale: { min: 0, max: 10, step: 0.1 }, weight: 1 },
  { key: "extremity", label: "Extremity", scale: { min: 0, max: 10, step: 0.1 }, weight: 1 },
  { key: "technicality", label: "Technicality", scale: { min: 0, max: 10, step: 0.1 }, weight: 1 },
  { key: "execution", label: "Execution", scale: { min: 0, max: 10, step: 0.1 }, weight: 1 },
];
/** What a new counting rule starts with. */
const COUNTING_START: Record<CountingType, Record<string, unknown>> = {
  best_n: { type: "best_n", n: 3, distinctTrickNames: false },
  best_per_category: { type: "best_per_category", maxPerCategory: 1, requireDistinctCategories: true },
  single_best: { type: "single_best" },
  all: { type: "all" },
  none: { type: "none" },
};

/**
 * The main dials of the Scoring tab (Polish 2, item 8): what judges enter per trick and its scale, which tricks count and how many, attempts per rider,
 * judges and how their scores are combined (trimming only with the trimmed average; the trimmed average only from 5 judges), Impression / Variety on or off
 * and its scale. Everything that only applies to a choice shows only when that choice is made; the rest is under More settings. Each row has a "?".
 */
export function ScoringSimple({ working, onChange, errors, readOnly }: { working: unknown; onChange: (v: unknown) => void; errors: Record<string, string>; readOnly?: boolean }) {
  const get = (path: (string | number)[]) => getIn(working, path);
  const set = (path: (string | number)[], v: unknown) => onChange(setIn(working, path, v));
  const err = (key: string) => (errors[key] ? <p className="field-error">{copy.common.problem(friendlyMessage(errors[key]))}</p> : null);

  const entry = (get(["trick", "entry"]) as Entry) ?? "single";
  const scale = get(["trick", "scale"]) as Scale;
  const criteria = (get(["trick", "criteria"]) as unknown[] | undefined) ?? [];
  const counting = get(["heat", "counting"]) as { type: CountingType; n?: number; maxPerCategory?: number };
  const cap = get(["heat", "maxAttemptsPerRider"]) as number | null;
  const impression = get(["heat", "impression"]) as { label: string; scale: Scale } | null;
  const panel = get(["panel"]) as { minJudges: number; maxJudges: number; aggregate: Aggregate; trimMinJudges: number };

  // one number of judges: the panel size the rules are designed for; the largest allowed panel never drops below it
  function setJudges(v: number) {
    let next = setIn(working, ["panel", "minJudges"], v);
    if (panel.maxJudges < v) next = setIn(next, ["panel", "maxJudges"], v);
    onChange(next);
  }
  function setEntry(v: Entry) {
    let next = setIn(working, ["trick", "entry"], v);
    if (v === "criteria" && criteria.length === 0) next = setIn(next, ["trick", "criteria"], STARTER_CRITERIA);
    onChange(next);
  }

  const row = (id: string, htmlId: string, control: React.ReactNode) => {
    const t = field(id);
    return (
      <SettingRow id={htmlId} label={t.label} explanation={t.explanation} example={t.example ?? ""}>
        {control}
      </SettingRow>
    );
  };
  const scaleRow = (prefix: string, s: Scale, path: string[], labels: [string, string, string]) => (
    <span className="inline-flex flex-wrap items-center gap-2">
      <NumberField id={`${prefix}-min`} label={labels[0]} value={s.min} min={-100} max={1000} step={s.step >= 1 ? 1 : 0.1} disabled={readOnly} onChange={(v) => set([...path, "min"], v)} />
      <span aria-hidden>–</span>
      <NumberField id={`${prefix}-max`} label={labels[1]} value={s.max} min={-100} max={1000} step={s.step >= 1 ? 1 : 0.1} disabled={readOnly} onChange={(v) => set([...path, "max"], v)} />
      <NumberField id={`${prefix}-step`} label={labels[2]} value={s.step} min={0.01} max={100} step={0.01} disabled={readOnly} onChange={(v) => set([...path, "step"], v)} />
    </span>
  );
  // the trimmed average needs at least 5 judges: it is offered from 5 judges on (and kept on show if the rules already use it)
  const aggregateOptions = (Object.entries(T.aggregateOptions) as Array<[Aggregate, string]>).filter(([k]) => k !== "trimmed_mean" || panel.minJudges >= 5 || panel.aggregate === "trimmed_mean");

  return (
    <fieldset disabled={readOnly} className="org-new min-w-0" data-testid="scoring-simple">
      {row("entry", "entry", <SelectField id="s-entry" label={field("entry").label} value={entry} onChange={setEntry} options={Object.entries(T.entryOptions) as Array<[Entry, string]>} />)}
      {err("trick.criteria")}
      {entry !== "none" ? row("scale", "scale", scaleRow("s-scale", scale, ["trick", "scale"], [T.scaleLow, T.scaleHigh, T.scaleStep])) : null}
      {err("trick.scale")}

      {row(
        "countingType",
        "countingType",
        <SelectField id="s-counting" label={field("countingType").label} value={counting.type} onChange={(v) => set(["heat", "counting"], COUNTING_START[v])} options={Object.entries(T.countingOptions) as Array<[CountingType, string]>} />,
      )}
      {counting.type === "best_n" ? (
        <>
          {row("bestN", "bestN", <NumberField id="s-n" label={field("bestN").label} value={counting.n ?? 1} min={1} max={20} disabled={readOnly} onChange={(v) => set(["heat", "counting", "n"], v)} />)}
          {err("heat.counting.n")}
        </>
      ) : null}
      {counting.type === "best_per_category" ? (
        <>
          {row("perCategory", "perCategory", <NumberField id="s-per-category" label={field("perCategory").label} value={counting.maxPerCategory ?? 1} min={1} max={20} disabled={readOnly} onChange={(v) => set(["heat", "counting", "maxPerCategory"], v)} />)}
          {err("heat.counting.maxPerCategory")}
        </>
      ) : null}

      {row(
        "attempts",
        "attempts",
        <span className="inline-flex flex-wrap items-center gap-2">
          <Toggle label={T.noLimit} checked={cap === null} onChange={(v) => set(["heat", "maxAttemptsPerRider"], v ? null : 7)} onText={T.noLimitOn} offText={T.noLimitOff} />
          {cap !== null ? <NumberField id="s-cap" label={field("attempts").label} value={cap} min={1} max={50} disabled={readOnly} onChange={(v) => set(["heat", "maxAttemptsPerRider"], v)} /> : null}
        </span>,
      )}
      {err("heat.maxAttemptsPerRider")}

      {row("judges", "judges", <NumberField id="s-judges" label={field("judges").label} value={panel.minJudges} min={1} max={20} disabled={readOnly} onChange={setJudges} />)}
      {err("panel.minJudges")}

      {row("aggregate", "aggregate", <SelectField id="s-aggregate" label={field("aggregate").label} value={panel.aggregate} onChange={(v) => set(["panel", "aggregate"], v)} options={aggregateOptions} />)}
      {panel.minJudges < 5 && panel.aggregate !== "trimmed_mean" ? <p className="text-small font-medium text-beach-muted" data-testid="trim-needs-five">{T.trimNeedsFive}</p> : null}
      {panel.aggregate === "trimmed_mean"
        ? row("trimMin", "trimMin", <NumberField id="s-trim-min" label={field("trimMin").label} value={panel.trimMinJudges} min={3} max={20} disabled={readOnly} onChange={(v) => set(["panel", "trimMinJudges"], v)} />)
        : null}
      <div className="border-b border-beach-line pb-2">
        <p className="text-body font-semibold" data-testid="panel-sentence" aria-live="polite">
          {describePanel(panel)}
        </p>
        {panel.aggregate === "trimmed_mean" ? <p className="text-small font-medium text-beach-muted">{panelRule(panel.trimMinJudges)}</p> : null}
      </div>

      {row(
        "impression",
        "impression",
        <Toggle
          label={field("impression").label}
          checked={impression !== null}
          onChange={(v) => set(["heat", "impression"], v ? { label: T.defaultImpressionLabel, scale: { min: 0, max: 10, step: 0.5 }, weight: 1, required: true } : null)}
          onText={orgCopy.settings.on}
          offText={orgCopy.settings.off}
        />,
      )}
      {impression ? row("impressionMax", "impressionMax", scaleRow("s-imp", impression.scale, ["heat", "impression", "scale"], [T.impressionLowLabel, T.impressionHigh, T.impressionStepLabel])) : null}
      {err("heat.impression.scale")}
      <p className="py-2 text-small font-medium text-beach-muted">{T.seatsNote}</p>
    </fieldset>
  );
}
