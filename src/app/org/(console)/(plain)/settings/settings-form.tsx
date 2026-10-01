"use client";

import { useState, useTransition } from "react";
import { LogoField } from "@/components/org/logo-field";
import { Button, disabledWhen } from "@/components/org/button";
import { SettingRow } from "@/components/org/setting-row";
import { SettingsPanel } from "@/components/org/settings-panel";
import { toast } from "@/hooks/use-toast";
import { copy } from "@/lib/ui-copy";
import { saveOrganisationSettings } from "./actions";

const help = {
  name: { text: "The name of your organisation, shown in the header of organiser screens.", example: "Arrow" },
  slug: { text: "Your organisation’s address. Lowercase letters, numbers and hyphens.", example: "arrow" },
  timeZone: { text: "The time zone pre-filled for every new event. Each event can still choose its own.", example: "Africa/Cairo" },
};

interface Initial {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  defaultTimezone: string;
}

export function SettingsForm({ initial, timeZones, canEdit }: { initial: Initial; timeZones: string[]; canEdit: boolean }) {
  const [name, setName] = useState(initial.name);
  const [slug, setSlug] = useState(initial.slug);
  const [tz, setTz] = useState(initial.defaultTimezone);
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logoUrl);
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState({ slug: initial.slug });
  const [pending, start] = useTransition();

  const slugChanged = slug.trim().toLowerCase() !== saved.slug;
  const zones = timeZones.includes(tz) ? timeZones : [tz, ...timeZones];

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFields({});
    start(async () => {
      const res = await saveOrganisationSettings({ name, slug, defaultTimezone: tz, logoUrl });
      if (res.ok) {
        setSaved({ slug: res.slug });
        setSlug(res.slug);
        setUnderstood(false);
        toast({ title: copy.orgSettings.saved });
      } else {
        setError(res.error);
        setFields(res.fields ?? {});
      }
    });
  }

  const inputCls = "h-[var(--org-ctl)] w-72 max-w-full rounded-[8px] border border-beach-border bg-transparent px-3 text-body font-semibold";
  const sentence = copy.orgSettings.sentence(name.trim() || copy.orgSettings.noName, slug.trim() || copy.orgSettings.noSlug, tz);
  const problem = (msg?: string) => (msg ? <p className="field-error">{copy.common.problem(msg)}</p> : null);

  return (
    <form onSubmit={save} className="flex min-w-0 flex-col gap-4" aria-label={copy.orgSettings.heading}>
      <SettingsPanel
        testId="org-settings-panel"
        sentenceTestId="org-settings-sentence"
        title={copy.orgSettings.panelTitle}
        sentence={sentence}
        advanced={null}
        advancedCount={0}
        simple={
          <fieldset disabled={!canEdit || pending} className="org-new min-w-0 py-1">
            <SettingRow id="org-name" label={copy.orgSettings.name} explanation={help.name.text} example={help.name.example}>
              <input id="org-name" aria-label={copy.orgSettings.name} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(fields.name)} className={inputCls} />
            </SettingRow>
            {problem(fields.name)}

            <SettingRow id="org-slug" label={copy.orgSettings.slug} explanation={help.slug.text} example={help.slug.example}>
              <input id="org-slug" aria-label={copy.orgSettings.slug} value={slug} onChange={(e) => setSlug(e.target.value)} aria-invalid={Boolean(fields.slug)} spellCheck={false} autoCapitalize="none" className={inputCls} />
            </SettingRow>
            <p className="text-small font-medium text-beach-muted">{copy.orgSettings.slugHint}</p>
            {problem(fields.slug)}
            {slugChanged ? (
              <div className="my-2 rounded-[8px] border border-beach-border bg-beach-surface p-3" role="note">
                <p className="text-body font-semibold">{copy.orgSettings.slugWarnTitle}</p>
                <p className="text-body font-medium">{copy.orgSettings.slugWarn(saved.slug)}</p>
                <label className="mt-2 flex min-h-[var(--org-ctl)] items-center gap-3 text-body font-semibold">
                  <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
                  {copy.orgSettings.understand}
                </label>
              </div>
            ) : null}

            <div className="border-b border-beach-line py-2">
              <LogoField orgId={initial.id} purpose="organisation-logo" label={copy.orgSettings.logo} value={logoUrl} onChange={setLogoUrl} />
            </div>

            <SettingRow id="org-tz" label={copy.orgSettings.timeZone} explanation={help.timeZone.text} example={help.timeZone.example}>
              <select id="org-tz" aria-label={copy.orgSettings.timeZone} value={tz} onChange={(e) => setTz(e.target.value)} className={inputCls}>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </SettingRow>
            <p className="pb-1 text-small font-medium text-beach-muted">{copy.orgSettings.timeZoneHint}</p>
            {problem(fields.defaultTimezone)}
          </fieldset>
        }
        footer={
          <div className="org-new flex flex-col gap-3">
            {error ? (
              <p role="alert" className="rounded-[8px] border border-beach-border bg-beach-surface px-3 py-2 text-body font-semibold text-beach-crash">
                {copy.common.problem(error)}
              </p>
            ) : null}
            <div>
              <Button
                type="submit"
                variant="primary"
                {...disabledWhen(!canEdit ? copy.orgSettings.readOnlyReason : pending ? copy.common.saving : slugChanged && !understood ? copy.orgSettings.understandFirst : null)}
              >
                {pending ? copy.common.saving : copy.orgSettings.save}
              </Button>
            </div>
          </div>
        }
      />
    </form>
  );
}
