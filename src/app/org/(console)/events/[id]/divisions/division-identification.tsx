"use client";

import { useState, useTransition } from "react";
import { toast } from "@/hooks/use-toast";
import type { IdentificationScheme } from "@/lib/schemas/identification";
import { IdentificationSchemeSchema } from "@/lib/schemas/identification";
import { Button, disabledWhen } from "@/components/org/button";
import { SettingRow } from "@/components/org/setting-row";
import { SettingsPanel } from "@/components/org/settings-panel";
import { IDENT_ADVANCED } from "@/lib/settings/simple-fields";
import { copy, help } from "@/lib/ui-copy";
import { IdentificationEditor, LycraQuestion } from "../../identification-editor";
import { saveDivisionIdentification } from "./actions";

const T = copy.divisions.identification;

/** "Use the event's identification" (default) or this division's own scheme, with the same editor as the Event step. */
export function DivisionIdentification({
  eventId,
  divisionId,
  organisationId,
  eventScheme,
  allowOverride,
  presets,
  initial,
  onSaved,
}: {
  eventId: string;
  divisionId: string;
  organisationId: string;
  eventScheme: IdentificationScheme;
  allowOverride: boolean;
  presets: IdentificationScheme[];
  initial: { scheme: IdentificationScheme; basedOn?: string } | null;
  onSaved: (stored: { scheme: IdentificationScheme; basedOn?: string } | null) => void;
}) {
  const [own, setOwn] = useState(Boolean(initial));
  const [value, setValue] = useState<{ scheme: IdentificationScheme; basedOn?: string; allowDivisionOverride: boolean }>({ scheme: initial?.scheme ?? structuredClone(eventScheme), basedOn: initial?.basedOn, allowDivisionOverride: false });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const problems = (() => {
    const r = IdentificationSchemeSchema.safeParse(value.scheme);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  })();

  function save(toOwn: boolean) {
    setError(null);
    start(async () => {
      const res = await saveDivisionIdentification({ divisionId, scheme: toOwn ? value.scheme : null, basedOn: value.basedOn });
      if (!res.ok) return setError(res.error);
      onSaved(toOwn ? { scheme: value.scheme, basedOn: value.basedOn } : null);
      toast({ title: toOwn ? T.saved : T.savedEvent });
    });
  }

  const sentence = own ? T.ownSentence(value.scheme.name) : T.eventScheme(eventScheme.name);
  const radio = "flex min-h-[var(--org-ctl)] items-center gap-3 text-body font-semibold";

  const simple = !allowOverride ? (
    <div className="org-new flex flex-col gap-2 py-3" role="note">
      <p className="text-body font-semibold">{T.switchOff}</p>
      {initial ? <p className="text-body font-medium">{T.ownKeptButOff}</p> : null}
      <div>
        <Button variant="secondary" href={`/org/events/${eventId}/event`}>
          {T.toEventStep}
        </Button>
      </div>
    </div>
  ) : (
    <div className="org-new py-1">
      <SettingRow id={`ident-mode-${divisionId}`} label={T.modeLabel} explanation={T.modeExplain} example={T.modeExample}>
        <fieldset className="flex flex-col">
          <legend className="sr-only">{T.modeLabel}</legend>
          <label className={radio}>
            <input type="radio" name={`ident-mode-${divisionId}`} checked={!own} onChange={() => setOwn(false)} />
            {T.useEvent}
          </label>
          <label className={radio}>
            <input type="radio" name={`ident-mode-${divisionId}`} checked={own} onChange={() => setOwn(true)} />
            {T.own}
          </label>
        </fieldset>
      </SettingRow>
      {own ? (
        <SettingRow id={`ident-lycras-${divisionId}`} label={copy.ident.lycraQuestion} explanation={help["ident.lycraQuestion"].text} example={help["ident.lycraQuestion"].example ?? ""}>
          <LycraQuestion value={value} onChange={setValue} />
        </SettingRow>
      ) : null}
    </div>
  );

  const advanced =
    allowOverride && own ? (
      <div className="org-new py-2">
        <IdentificationEditor division value={value} onChange={setValue} presets={presets} organisationId={organisationId} errors={problems} hideLycraQuestion />
      </div>
    ) : null;

  const footer = allowOverride ? (
    <div className="org-new flex flex-col gap-3">
      {error ? (
        <p role="alert" className="field-error">
          {copy.common.problem(error)}
        </p>
      ) : null}
      <div>
        <Button variant="primary" onClick={() => save(own)} data-testid="division-identification-save" {...disabledWhen(pending ? copy.common.saving : own && problems.length > 0 ? T.fixFirst : null)}>
          {own ? T.save : copy.common.save}
        </Button>
      </div>
    </div>
  ) : undefined;

  return (
    <SettingsPanel testId="division-identification" sentenceTestId="division-identification-sentence" title={T.panelTitle} sentence={sentence} simple={simple} advanced={advanced} advancedCount={IDENT_ADVANCED.length} storageKey="bigair.org-more-identification" footer={footer} />
  );
}
