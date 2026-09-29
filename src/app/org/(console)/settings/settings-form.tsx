"use client";

import { useState, useTransition } from "react";
import { LogoField } from "@/components/org/logo-field";
import { toast } from "@/hooks/use-toast";
import { saveOrganisationSettings } from "./actions";

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
        toast({ title: "Organisation settings saved" });
      } else {
        setError(res.error);
        setFields(res.fields ?? {});
      }
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-6" aria-label="Organisation settings">
      <fieldset disabled={!canEdit || pending} className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <label htmlFor="org-name">Organisation name</label>
          <input id="org-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(fields.name)} />
          {fields.name ? <p className="field-error">✖ {fields.name}</p> : null}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="org-slug">Web address (slug)</label>
          <input id="org-slug" value={slug} onChange={(e) => setSlug(e.target.value)} aria-invalid={Boolean(fields.slug)} spellCheck={false} autoCapitalize="none" />
          <p className="text-sm font-semibold">Lowercase letters, numbers and hyphens, for example “arrow”.</p>
          {fields.slug ? <p className="field-error">✖ {fields.slug}</p> : null}
          {slugChanged ? (
            <div className="panel mt-2" role="note">
              <p className="font-bold">⚠ Changing the web address changes your public links.</p>
              <p className="font-semibold">Anything that already points to “{saved.slug}” (printed QR codes, shared links) will stop working. Only continue if you have not shared links yet.</p>
              <label className="mt-2 flex items-center gap-3 font-bold">
                <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />I understand, change the address
              </label>
            </div>
          ) : null}
        </div>

        <LogoField orgId={initial.id} purpose="organisation-logo" label="Organisation logo" value={logoUrl} onChange={setLogoUrl} />

        <div className="flex flex-col gap-1">
          <label htmlFor="org-tz">Default time zone for new events</label>
          <select id="org-tz" value={tz} onChange={(e) => setTz(e.target.value)}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          <p className="text-sm font-semibold">New events start with this time zone; each event can still choose its own.</p>
          {fields.defaultTimezone ? <p className="field-error">✖ {fields.defaultTimezone}</p> : null}
        </div>
      </fieldset>

      {error ? (
        <p role="alert" className="panel field-error">
          ✖ {error}
        </p>
      ) : null}
      <div>
        <button type="submit" className="btn btn-primary" disabled={!canEdit || pending || (slugChanged && !understood)}>
          {pending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}
