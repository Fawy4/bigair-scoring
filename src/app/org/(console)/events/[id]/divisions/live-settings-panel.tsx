"use client";

import { useState, useTransition } from "react";
import { SettingRow } from "@/components/org/setting-row";
import { toast } from "@/hooks/use-toast";
import { parseDivisionLive, type DivisionLive } from "@/lib/schemas/division-live";
import { copy, help } from "@/lib/ui-copy";
import { saveLiveSettings } from "./actions";

const T = copy.liveSettings;

/**
 * What the division's live screens show (docs/08 §1G-10), under Advanced: "Show scores as % of maximum" (off by default; the scoring model's own display
 * field is only the default for exports) and the parts of the summary card a judge sees above the Impression / Variety pad.
 */
export function LiveSettingsPanel({ divisionId, initial, readOnly }: { divisionId: string; initial: unknown; readOnly: boolean }) {
  const [settings, setSettings] = useState<DivisionLive>(() => parseDivisionLive(initial));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(next: DivisionLive) {
    const before = settings;
    setSettings(next);
    setError(null);
    start(async () => {
      const r = await saveLiveSettings(divisionId, next);
      if (!r.ok) {
        setSettings(before);
        setError(r.error);
      } else toast({ title: T.saved });
    });
  }
  const h = (key: string) => ({ explanation: help[key].line ?? help[key].text, example: help[key].example ?? "", detail: help[key].line ? help[key].text : undefined });
  const box = (testId: string, label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label className="flex min-h-[var(--org-ctl)] items-center gap-2 text-body font-semibold">
      <input type="checkbox" data-testid={testId} aria-label={label} checked={checked} disabled={pending || readOnly} onChange={(e) => onChange(e.target.checked)} />
      {checked ? T.yes : T.no}
    </label>
  );
  const part = (key: keyof DivisionLive["impressionSummary"], text: string) => (
    <SettingRow id={`summary-${key}`} label={text} {...h(`division.summary.${key}`)}>
      {box(`summary-${key}`, text, settings.impressionSummary[key], (v) => save({ ...settings, impressionSummary: { ...settings.impressionSummary, [key]: v } }))}
    </SettingRow>
  );
  const choice = (testId: string, label: string, value: string, options: Array<[string, string]>, onChange: (v: string) => void) => (
    <select data-testid={testId} aria-label={label} value={value} disabled={pending || readOnly} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, text]) => (
        <option key={v} value={v}>
          {text}
        </option>
      ))}
    </select>
  );
  return (
    <section className="flex flex-col gap-1 rounded-card border border-beach-line p-4" aria-label={T.heading} data-testid="live-settings">
      <h3>{T.heading}</h3>
      {error ? (
        <p role="alert" className="field-error">
          {copy.common.problem(error)}
        </p>
      ) : null}
      <SettingRow id="show-percent" label={T.showPercent} {...h("division.showPercent")}>
        {box("show-percent", T.showPercent, settings.showPercentOfMax, (v) => save({ ...settings, showPercentOfMax: v }))}
      </SettingRow>
      <p className="pb-1 text-small font-medium text-beach-muted">{T.showPercentNote}</p>
      <div data-testid="spectator-settings" className="flex flex-col">
        <h4 className="pt-2">{T.spectatorsHeading}</h4>
        <p className="text-small font-medium text-beach-muted">{T.spectatorsNote}</p>
        <SettingRow id="live-scores" label={T.liveScores} {...h("division.liveScores")}>
          {choice("division-live-scores", T.liveScores, settings.publicLiveScores ?? "", [["", T.useEvent], ["live", T.liveLive], ["after_publish", T.liveAfter], ["off", T.liveOff]], (v) => save({ ...settings, publicLiveScores: v === "" ? null : (v as "live" | "after_publish" | "off") }))}
        </SettingRow>
        {([
          ["publicResultsOnPublish", T.resultsOnPublish, "division.resultsOnPublish"],
          ["holdFinalResult", T.holdFinal, "division.holdFinal"],
        ] as const).map(([key, label, helpKey]) => (
          <SettingRow key={key} id={key} label={label} {...h(helpKey)}>
            {choice(`division-${key}`, label, settings[key] === null ? "" : settings[key] ? "yes" : "no", [["", T.useEvent], ["yes", T.yes], ["no", T.no]], (v) => save({ ...settings, [key]: v === "" ? null : v === "yes" }))}
          </SettingRow>
        ))}
        <SettingRow id="attempt-display" label={T.attemptDisplay} {...h("division.attemptDisplay")}>
          {choice("attempt-display", T.attemptDisplay, settings.spectatorAttemptDisplay, [["number_score", T.displayNumberScore], ["trick_score", T.displayTrickScore], ["score_only", T.displayScoreOnly]], (v) => save({ ...settings, spectatorAttemptDisplay: v as DivisionLive["spectatorAttemptDisplay"] }))}
        </SettingRow>
      </div>
      <h4 className="pt-2">{T.summaryHeading}</h4>
      {part("counts", T.summaryCounts)}
      {part("variety", T.summaryVariety)}
      {part("directions", T.summaryDirections)}
      {part("landedList", T.summaryList)}
    </section>
  );
}
