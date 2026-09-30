"use client";

import { useState, useTransition } from "react";
import { LogoField } from "@/components/org/logo-field";
import { FieldLabel } from "@/components/help-button";
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

  return (
    <form onSubmit={save} className="flex flex-col gap-6" aria-label={copy.orgSettings.heading}>
      <fieldset disabled={!canEdit || pending} className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="org-name" text={copy.orgSettings.name} help={help.name} />
          <input id="org-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(fields.name)} />
          {fields.name ? <p className="field-error">{copy.common.problem(fields.name)}</p> : null}
        </div>

        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="org-slug" text={copy.orgSettings.slug} help={help.slug} />
          <input id="org-slug" value={slug} onChange={(e) => setSlug(e.target.value)} aria-invalid={Boolean(fields.slug)} spellCheck={false} autoCapitalize="none" />
          <p className="text-sm font-semibold">{copy.orgSettings.slugHint}</p>
          {fields.slug ? <p className="field-error">{copy.common.problem(fields.slug)}</p> : null}
          {slugChanged ? (
            <div className="panel mt-2" role="note">
              <p className="font-bold">{copy.orgSettings.slugWarnTitle}</p>
              <p className="font-semibold">{copy.orgSettings.slugWarn(saved.slug)}</p>
              <label className="mt-2 flex items-center gap-3 font-bold">
                <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />{copy.orgSettings.understand}
              </label>
            </div>
          ) : null}
        </div>

        <LogoField orgId={initial.id} purpose="organisation-logo" label={copy.orgSettings.logo} value={logoUrl} onChange={setLogoUrl} />

        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="org-tz" text={copy.orgSettings.timeZone} help={help.timeZone} />
          <select id="org-tz" value={tz} onChange={(e) => setTz(e.target.value)}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          <p className="text-sm font-semibold">{copy.orgSettings.timeZoneHint}</p>
          {fields.defaultTimezone ? <p className="field-error">{copy.common.problem(fields.defaultTimezone)}</p> : null}
        </div>
      </fieldset>

      {error ? (
        <p role="alert" className="panel field-error">
          {copy.common.problem(error)}
        </p>
      ) : null}
      <div>
        <button type="submit" className="btn btn-primary" disabled={!canEdit || pending || (slugChanged && !understood)}>
          {pending ? copy.common.saving : copy.orgSettings.save}
        </button>
      </div>
    </form>
  );
}
