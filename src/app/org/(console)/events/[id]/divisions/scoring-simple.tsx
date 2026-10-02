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
const field = (id: string) => simpleText(SCORING_SIMPLE.find((f) => f.id === id)!);

/** The Simple dials of the Scoring panel: best N of M attempts, judges, how their scores combine, Impression / Variety on or off and how high it goes. Each has a line under it and a “?”. */
export function ScoringSimple({ working, onChange, errors, readOnly }: { working: unknown; onChange: (v: unknown) => void; errors: Record<string, string>; readOnly?: boolean }) {
  const get = (path: (string | number)[]) => getIn(working, path);
  const set = (path: (string | number)[], v: unknown) => onChange(setIn(working, path, v));
  const err = (key: string) => (errors[key] ? <p className="field-error">{copy.common.problem(friendlyMessage(errors[key]))}</p> : null);

  const counting = get(["heat", "counting"]) as { type: string; n?: number };
  const cap = get(["heat", "maxAttemptsPerRider"]) as number | null;
  const impression = get(["heat", "impression"]) as { label: string; scale: { min: number; max: number; step: number } } | null;
  const panel = get(["panel"]) as { minJudges: number; maxJudges: number; aggregate: Aggregate; trimMinJudges: number };

  // one number of judges: the panel size the rules are designed for; the largest allowed panel never drops below it
  function setJudges(v: number) {
    let next = setIn(working, ["panel", "minJudges"], v);
    if (panel.maxJudges < v) next = setIn(next, ["panel", "maxJudges"], v);
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

  return (
    <fieldset disabled={readOnly} className="org-new min-w-0" data-testid="scoring-simple">
      {counting.type === "best_n" ? (
        <>
          {row("bestN", "bestN", <NumberField id="s-n" label={field("bestN").label} value={counting.n ?? 1} min={1} max={20} disabled={readOnly} onChange={(v) => set(["heat", "counting", "n"], v)} />)}
          {err("heat.counting.n")}
        </>
      ) : (
        <p className="py-2 text-body font-semibold">{T.countingOther}</p>
      )}

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

      {row(
        "aggregate",
        "aggregate",
        <SelectField id="s-aggregate" label={field("aggregate").label} value={panel.aggregate} onChange={(v) => set(["panel", "aggregate"], v)} options={Object.entries(T.aggregateOptions) as Array<[Aggregate, string]>} />,
      )}
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
      {impression
        ? row("impressionMax", "impressionMax", <NumberField id="s-imp-max" label={field("impressionMax").label} value={impression.scale.max} min={1} max={100} step={impression.scale.step >= 1 ? 1 : 0.5} disabled={readOnly} unit={T.impressionUnit} onChange={(v) => set(["heat", "impression", "scale", "max"], v)} />)
        : null}
      {err("heat.impression.scale")}
      <p className="py-2 text-small font-medium text-beach-muted">{T.seatsNote}</p>
    </fieldset>
  );
}
