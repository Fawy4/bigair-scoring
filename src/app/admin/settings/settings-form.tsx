"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FieldLabel } from "@/components/help-button";
import { Button, disabledWhen } from "@/components/org/button";
import { LogoField } from "@/components/org/logo-field";
import { SettingRow } from "@/components/org/setting-row";
import { SettingsPanel } from "@/components/org/settings-panel";
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

  const inputCls = "h-[var(--org-ctl)] w-72 max-w-full rounded-[8px] border border-beach-border bg-transparent px-3 text-body font-semibold";
  const row = (id: string, label: string, text: { text: string; example?: string }, control: React.ReactNode, key?: string) => (
    <>
      <SettingRow id={id} label={label} explanation={text.text} example={text.example ?? ""}>
        {control}
      </SettingRow>
      {key ? fe(key) : null}
    </>
  );

  return (
    <form
      className="flex min-w-0 flex-col gap-4"
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
      <SettingsPanel
        testId="platform-settings-panel"
        sentenceTestId="platform-settings-sentence"
        title={s.panelTitle}
        sentence={s.sentence(productName.trim() || builtInName, tz)}
        advanced={null}
        advancedCount={0}
        simple={
          <fieldset disabled={!canEdit || pending} className="org-new min-w-0 py-1">
            {row("ps-name", s.productName, s.productNameHelp, <input id="ps-name" aria-label={s.productName} value={productName} onChange={(e) => setProductName(e.target.value)} placeholder={builtInName} aria-invalid={Boolean(fields.productName)} className={inputCls} />, "productName")}
            <div className="border-b border-beach-line py-2">
              <LogoField orgId={PLATFORM_FOLDER} purpose="platform-logo" label={s.logo} value={logoUrl} onChange={setLogoUrl} />
            </div>
            {row("ps-tagline", s.tagline, s.taglineHelp, <input id="ps-tagline" aria-label={s.tagline} value={tagline} onChange={(e) => setTagline(e.target.value)} aria-invalid={Boolean(fields.tagline)} className={inputCls} />, "tagline")}
            {row(
              "ps-tz",
              s.timeZone,
              s.timeZoneHelp,
              <select id="ps-tz" aria-label={s.timeZone} value={tz} onChange={(e) => setTz(e.target.value)} className={inputCls}>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>,
              "defaultTimezone",
            )}
            <div className="flex flex-col gap-1 border-b border-beach-line py-2">
              <FieldLabel htmlFor="ps-terms" text={s.terms} help={s.legalHelp} />
              <textarea id="ps-terms" rows={6} value={terms} onChange={(e) => setTerms(e.target.value)} />
              {fe("terms")}
            </div>
            <div className="flex flex-col gap-1 py-2">
              <FieldLabel htmlFor="ps-privacy" text={s.privacy} help={s.legalHelp} />
              <textarea id="ps-privacy" rows={6} value={privacy} onChange={(e) => setPrivacy(e.target.value)} />
              {fe("privacy")}
            </div>
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
              <Button type="submit" variant="primary" {...disabledWhen(!canEdit ? s.readOnlyReason : pending ? s.saving : null)}>
                {pending ? s.saving : s.save}
              </Button>
            </div>
          </div>
        }
      />
    </form>
  );
}
