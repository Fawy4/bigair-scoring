"use client";

import { useState, useTransition } from "react";
import { HelpButton } from "@/components/help-button";
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
  const part = (key: keyof DivisionLive["impressionSummary"], text: string) => (
    <span className="flex items-start gap-2">
      <label className="flex items-center gap-3 font-semibold">
        <input
          type="checkbox"
          className="h-6 w-6"
          data-testid={`summary-${key}`}
          checked={settings.impressionSummary[key]}
          disabled={pending || readOnly}
          onChange={(e) => save({ ...settings, impressionSummary: { ...settings.impressionSummary, [key]: e.target.checked } })}
        />
        {text}
      </label>
      <HelpButton what={text} help={help[`division.summary.${key}`]} />
    </span>
  );
  return (
    <section className="panel flex flex-col gap-3" aria-label={T.heading} data-testid="live-settings">
      <h3 className="text-lg font-extrabold">{T.heading}</h3>
      {error ? (
        <p role="alert" className="field-error">
          {copy.common.problem(error)}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-3 font-bold">
          <input
            type="checkbox"
            className="h-6 w-6"
            data-testid="show-percent"
            checked={settings.showPercentOfMax}
            disabled={pending || readOnly}
            onChange={(e) => save({ ...settings, showPercentOfMax: e.target.checked })}
          />
          {T.showPercent}
        </label>
        <HelpButton what={T.showPercent} help={help["division.showPercent"]} />
      </div>
      <p className="text-sm font-semibold">{T.showPercentNote}</p>
      <fieldset className="flex flex-col gap-3" data-testid="spectator-settings">
        <legend className="font-bold">{T.spectatorsHeading}</legend>
        <p className="text-sm font-semibold">{T.spectatorsNote}</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-3 font-bold">
            {T.liveScores}
            <select
              data-testid="division-live-scores"
              value={settings.publicLiveScores ?? ""}
              disabled={pending || readOnly}
              onChange={(e) => save({ ...settings, publicLiveScores: e.target.value === "" ? null : (e.target.value as "live" | "after_publish" | "off") })}
            >
              <option value="">{T.useEvent}</option>
              <option value="live">{T.liveLive}</option>
              <option value="after_publish">{T.liveAfter}</option>
              <option value="off">{T.liveOff}</option>
            </select>
          </label>
          <HelpButton what={T.liveScores} help={help["division.liveScores"]} />
        </div>
        {([
          ["publicResultsOnPublish", T.resultsOnPublish, "division.resultsOnPublish"],
          ["holdFinalResult", T.holdFinal, "division.holdFinal"],
        ] as const).map(([key, label, helpKey]) => (
          <div key={key} className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-3 font-bold">
              {label}
              <select
                data-testid={`division-${key}`}
                value={settings[key] === null ? "" : settings[key] ? "yes" : "no"}
                disabled={pending || readOnly}
                onChange={(e) => save({ ...settings, [key]: e.target.value === "" ? null : e.target.value === "yes" })}
              >
                <option value="">{T.useEvent}</option>
                <option value="yes">{T.yes}</option>
                <option value="no">{T.no}</option>
              </select>
            </label>
            <HelpButton what={label} help={help[helpKey]} />
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-3 font-bold">
            {T.attemptDisplay}
            <select data-testid="attempt-display" value={settings.spectatorAttemptDisplay} disabled={pending || readOnly} onChange={(e) => save({ ...settings, spectatorAttemptDisplay: e.target.value as DivisionLive["spectatorAttemptDisplay"] })}>
              <option value="number_score">{T.displayNumberScore}</option>
              <option value="trick_score">{T.displayTrickScore}</option>
              <option value="score_only">{T.displayScoreOnly}</option>
            </select>
          </label>
          <HelpButton what={T.attemptDisplay} help={help["division.attemptDisplay"]} />
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="font-bold">{T.summaryHeading}</legend>
        {part("counts", T.summaryCounts)}
        {part("variety", T.summaryVariety)}
        {part("directions", T.summaryDirections)}
        {part("landedList", T.summaryList)}
      </fieldset>
    </section>
  );
}
