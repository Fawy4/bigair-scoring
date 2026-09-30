"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FieldLabel } from "@/components/help-button";
import { LogoField } from "@/components/org/logo-field";
import { toast } from "@/hooks/use-toast";
import type { PlatformSettings } from "@/lib/platform/settings";
import { copy } from "@/lib/ui-copy";
import { savePlatformSettings } from "../actions";

/** The platform logo lives in the all-zero folder of the branding bucket (admins may write anywhere in it). */
const PLATFORM_FOLDER = "00000000-0000-0000-0000-000000000000";
const s = copy.admin.settings;

export function SettingsForm({ initial, timeZones, canEdit, builtInName }: { initial: PlatformSettings; timeZones: string[]; canEdit: boolean; builtInName: string }) {
  const [productName, setProductName] = useState(initial.productName);
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logoUrl);
  const [tagline, setTagline] = useState(initial.tagline);
  const [tz, setTz] = useState(initial.defaultTimezone);
  const [terms, setTerms] = useState(initial.legalTexts.terms);
  const [privacy, setPrivacy] = useState(initial.legalTexts.privacy);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const zones = timeZones.includes(tz) ? timeZones : [tz, ...timeZones];
  const fe = (k: string) => (fields[k] ? <p className="field-error">{copy.common.problem(fields[k])}</p> : null);

  return (
    <form
      className="flex flex-col gap-6"
      aria-label={s.heading}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setFields({});
        start(async () => {
          const res = await savePlatformSettings({ productName, logoUrl, tagline, defaultTimezone: tz, terms, privacy });
          if (res.ok) {
            toast({ title: s.saved });
            router.refresh();
          } else {
            setError(res.error);
            setFields(res.fields ?? {});
          }
        });
      }}
    >
      <fieldset disabled={!canEdit || pending} className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="ps-name" text={s.productName} help={s.productNameHelp} />
          <input id="ps-name" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder={builtInName} aria-invalid={Boolean(fields.productName)} />
          {fe("productName")}
        </div>
        <LogoField orgId={PLATFORM_FOLDER} purpose="platform-logo" label={s.logo} value={logoUrl} onChange={setLogoUrl} />
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="ps-tagline" text={s.tagline} help={s.taglineHelp} />
          <input id="ps-tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} aria-invalid={Boolean(fields.tagline)} />
          {fe("tagline")}
        </div>
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="ps-tz" text={s.timeZone} help={s.timeZoneHelp} />
          <select id="ps-tz" value={tz} onChange={(e) => setTz(e.target.value)}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          {fe("defaultTimezone")}
        </div>
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="ps-terms" text={s.terms} help={s.legalHelp} />
          <textarea id="ps-terms" rows={6} value={terms} onChange={(e) => setTerms(e.target.value)} />
          {fe("terms")}
        </div>
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="ps-privacy" text={s.privacy} help={s.legalHelp} />
          <textarea id="ps-privacy" rows={6} value={privacy} onChange={(e) => setPrivacy(e.target.value)} />
          {fe("privacy")}
        </div>
      </fieldset>
      {error ? (
        <p role="alert" className="panel field-error">
          {copy.common.problem(error)}
        </p>
      ) : null}
      <div>
        <button type="submit" className="btn btn-primary" disabled={!canEdit || pending}>
          {pending ? s.saving : s.save}
        </button>
      </div>
    </form>
  );
}
