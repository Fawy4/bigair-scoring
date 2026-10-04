"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRefreshSoon } from "@/lib/use-refresh-soon";
import { FieldLabel, HelpButton } from "@/components/help-button";
import { Button, disabledWhen } from "@/components/org/button";
import { registerNextGuard } from "@/components/org/next-guard";
import { NumberField } from "@/components/org/number-field";
import { SettingRow } from "@/components/org/setting-row";
import { SettingsPanel } from "@/components/org/settings-panel";
import { SummaryCard } from "@/components/org/summary-card";
import { useShellLayout } from "@/components/org/layout-context";
import { EVENT_ADVANCED } from "@/lib/settings/simple-fields";
import { publicTabs, tabsOffLeavesOne } from "@/lib/public/tabs";
import { eventSentence } from "@/lib/org/event-sentence";
import { usesLycras } from "@/lib/schemas/identification";
import { LogoField } from "@/components/org/logo-field";
import { SlugLink } from "@/components/slug-link";
import { toast } from "@/hooks/use-toast";
import { issuesToMap, moveIn, removeIn, setIn } from "@/lib/form/path";
import { impressionPlaceholder } from "@/lib/org/impression-names";
import { EventFormSchema, slugify, type EventForm as EventFormValues } from "@/lib/schemas/event-settings";
import type { IdentificationScheme } from "@/lib/schemas/identification";
import { copy, help, orgCopy } from "@/lib/ui-copy";
import { saveEvent } from "./actions";
import { IdentificationEditor, LycraQuestion } from "./identification-editor";

const T = copy.event;

export interface EventFormInitial {
  id: string | null;
  organisationId: string;
  status: string;
  values: EventFormValues;
  savedSlug: string | null;
}

export function EventForm({ initial, timeZones, schemes, impressionNames = [] }: { initial: EventFormInitial; timeZones: string[]; schemes: IdentificationScheme[]; /** What the event's divisions call their separate score now; shown in the empty field. */ impressionNames?: string[] }) {
  const router = useRouter();
  const refreshSoon = useRefreshSoon();
  const laptop = useShellLayout() === "laptop";
  const [form, setForm] = useState<EventFormValues>(initial.values);
  const [published, setPublished] = useState(initial.status === "published");
  const [slugTouched, setSlugTouched] = useState(initial.id !== null);
  const [understood, setUnderstood] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverFields, setServerFields] = useState<Record<string, string>>({});
  const [savedSlug, setSavedSlug] = useState(initial.savedSlug);
  const [saved, setSaved] = useState(() => JSON.stringify({ form: initial.values, published: initial.status === "published" }));
  const [origin, setOrigin] = useState("");
  const [pending, start] = useTransition();
  useEffect(() => setOrigin(window.location.origin), []);

  const set = (path: (string | number)[], value: unknown) => setForm((f) => setIn(f, path, value));
  const check = useMemo(() => {
    const r = EventFormSchema.safeParse(form);
    return r.success ? {} : issuesToMap(r.error.issues);
  }, [form]);
  const err = (key: string) => (showErrors ? (check[key] ?? serverFields[key]) : serverFields[key]);
  const identErrors = Object.entries(showErrors ? { ...check, ...serverFields } : serverFields)
    .filter(([k]) => k.startsWith("settings.identification"))
    .map(([, m]) => m);

  const slugChangedOnPublished = initial.status === "published" && savedSlug !== null && form.slug.trim().toLowerCase() !== savedSlug;
  const canPublishToggle = initial.status === "draft" || initial.status === "published";
  const ident = form.settings.identification!;
  const timezones = timeZones.includes(form.timezone) ? timeZones : [form.timezone, ...timeZones];
  const showError = (key: string) => (err(key) ? <p className="field-error">{copy.common.problem(err(key)!)}</p> : null);

  /** Saves the form. Answers true when it was saved (or there was nothing new to save); false with the error on screen when it could not be. */
  async function submit(): Promise<boolean> {
    setShowErrors(true);
    setServerError(null);
    setServerFields({});
    if (Object.keys(check).length > 0) {
      setServerError(T.fixThese);
      return false;
    }
    const res = await saveEvent(initial.id, form, canPublishToggle ? (published ? "published" : "draft") : null);
    if (res.ok) {
      setSavedSlug(res.slug);
      setUnderstood(false);
      setShowErrors(false);
      setSaved(JSON.stringify({ form, published }));
      toast({ title: initial.id ? T.saved : T.created });
      if (!initial.id) router.push(`/org/events/${res.id}/event`);
      else refreshSoon();
      return true;
    }
    setServerError(res.error);
    setServerFields(res.fields ?? {});
    return false;
  }
  function save() {
    start(async () => {
      await submit();
    });
  }

  // the footer's Next saves what was typed first; with nothing new it just moves on, and with an error it stays here (Phase 7a, 8a)
  const dirty = JSON.stringify({ form, published }) !== saved;
  useEffect(() => {
    if (!initial.id) return;
    return registerNextGuard(async () => {
      if (!dirty) return true;
      if (slugChangedOnPublished && !understood) {
        setServerError(T.understandFirst);
        return false;
      }
      return submit();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-registered on every change so the guard sees the current form
  }, [form, published, understood, dirty, initial.id]);

  const group = "flex flex-col gap-3 border-t border-beach-line py-4";
  const groupTitle = "text-[14px] font-semibold";
  const inputCls = "h-[var(--org-ctl)] w-full rounded-[8px] border border-beach-border bg-transparent px-3 text-body font-semibold";
  const lycras = usesLycras(ident.scheme);
  const sentence = eventSentence({ name: form.name, start: form.start_date, end: form.end_date, location: form.location, timezone: form.timezone, lycras, live: form.settings.publicLiveScores === "live", results: form.settings.publicResultsOnPublish });
  const h = (key: string) => ({ explanation: help[key].line ?? help[key].text, example: help[key].example ?? "", detail: help[key].line ? help[key].text : undefined });
  const checkbox = (label: string, checked: boolean, onChange: (v: boolean) => void, helpKey: string, testId?: string) => (
    <span className="flex items-start gap-2">
      <label className="flex min-h-[var(--org-ctl)] items-center gap-3 text-body font-semibold">
        <input type="checkbox" data-testid={testId} checked={checked} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </label>
      <HelpButton what={label} help={help[helpKey]} />
    </span>
  );

  const simple = (
    <div className="org-new py-1">
      <SettingRow id="ev-name" label={T.name} {...h("event.name")}>
        <input
          id="ev-name"
          aria-label={T.name}
          value={form.name}
          onChange={(e) => {
            set(["name"], e.target.value);
            if (!slugTouched) set(["slug"], slugify(e.target.value));
          }}
          aria-invalid={Boolean(err("name"))}
          className={`${inputCls} w-72 max-w-full`}
        />
      </SettingRow>
      {showError("name")}
      <SettingRow id="ev-dates" label={orgCopy.settings.datesLabel} {...h("event.dates")}>
        <span className="inline-flex flex-wrap items-center gap-2">
          <input id="ev-start" type="date" aria-label={T.firstDay} value={form.start_date} onChange={(e) => set(["start_date"], e.target.value)} className={`${inputCls} w-auto`} />
          <span aria-hidden>–</span>
          <input id="ev-end" type="date" aria-label={T.lastDay} value={form.end_date} onChange={(e) => set(["end_date"], e.target.value)} className={`${inputCls} w-auto`} />
        </span>
      </SettingRow>
      {showError("start_date")}
      {showError("end_date")}
      <SettingRow id="ev-location" label={T.location} {...h("event.location")}>
        <input id="ev-location" aria-label={T.location} value={form.location} onChange={(e) => set(["location"], e.target.value)} placeholder={T.locationPlaceholder} className={`${inputCls} w-72 max-w-full`} />
      </SettingRow>
      {showError("location")}
      <SettingRow id="ev-tz" label={T.timeZone} {...h("event.timeZone")}>
        <select id="ev-tz" aria-label={T.timeZone} value={form.timezone} onChange={(e) => set(["timezone"], e.target.value)} className={`${inputCls} w-72 max-w-full`}>
          {timezones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </SettingRow>
      <p className="pb-1 text-small font-medium text-beach-muted">{T.timeZoneHint}</p>
      {showError("timezone")}
      <SettingRow id="ev-lycras" label={copy.ident.lycraQuestion} {...h("ident.lycraQuestion")}>
        <LycraQuestion value={ident} onChange={(v) => set(["settings", "identification"], v)} />
      </SettingRow>
      <div className="py-2" data-testid="visibility-settings" aria-labelledby="visibility-heading">
        <h3 id="visibility-heading" className="text-body font-semibold">
          {T.visibilityHeading}
        </h3>
        <p className="text-small font-medium text-beach-muted">{T.visibilityIntro}</p>
        {checkbox(T.showLive, form.settings.publicLiveScores === "live", (v) => set(["settings", "publicLiveScores"], v ? "live" : "after_publish"), "event.showLive")}
        {checkbox(T.showResults, form.settings.publicResultsOnPublish, (v) => set(["settings", "publicResultsOnPublish"], v), "event.showResults")}
        {checkbox(T.holdFinal, form.settings.holdFinalResult, (v) => set(["settings", "holdFinalResult"], v), "event.holdFinal")}
      </div>
    </div>
  );

  const advanced = (
    <div className="org-new flex flex-col py-1">
      <section className={group}>
        <h3 className={groupTitle}>{T.slug}</h3>
        <FieldLabel htmlFor="ev-slug" text={T.slug} help={help["event.slug"]} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body font-semibold">{origin || "https://…"}/e/</span>
          <input
            id="ev-slug"
            value={form.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set(["slug"], e.target.value);
            }}
            spellCheck={false}
            autoCapitalize="none"
            aria-invalid={Boolean(err("slug"))}
            className={`${inputCls} w-64`}
          />
        </div>
        {showError("slug")}
        {savedSlug ? (
          <p className="flex flex-wrap items-center gap-2 text-body font-semibold">
            {T.slugPublicPage} <SlugLink slug={savedSlug} />
          </p>
        ) : null}
        {slugChangedOnPublished ? (
          <div className="rounded-[8px] border border-beach-border bg-beach-surface p-3" role="note">
            <p className="text-body font-semibold">{T.slugPublishedTitle}</p>
            <label className="mt-2 flex items-center gap-3 text-body font-semibold">
              <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
              {T.understand}
            </label>
          </div>
        ) : null}
      </section>

      <section className={group}>
        <h3 className={groupTitle}>{T.branding}</h3>
        <LogoField orgId={initial.organisationId} purpose="event-logo" label={T.eventLogo} value={form.branding.logoUrl} onChange={(u) => set(["branding", "logoUrl"], u ?? undefined)} />
        <div className="flex flex-col gap-3">
          <FieldLabel as="span" text={T.sponsors} help={help["event.sponsors"]} />
          {form.branding.sponsors.length === 0 ? <p className="text-body font-medium text-beach-muted">{T.noSponsors}</p> : null}
          {form.branding.sponsors.map((sp, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-[8px] border border-beach-line p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor={`sp-name-${i}`} className="text-small font-semibold">
                    {T.sponsorName(i + 1)}
                  </label>
                  <input id={`sp-name-${i}`} value={sp.name} onChange={(e) => set(["branding", "sponsors", i, "name"], e.target.value)} className={inputCls} />
                  {showError(`branding.sponsors.${i}.name`)}
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`sp-url-${i}`} className="text-small font-semibold">
                    {T.sponsorUrl(i + 1)}
                  </label>
                  <input id={`sp-url-${i}`} value={sp.url ?? ""} onChange={(e) => set(["branding", "sponsors", i, "url"], e.target.value)} placeholder="https://" className={inputCls} />
                  {showError(`branding.sponsors.${i}.url`)}
                </div>
              </div>
              <LogoField orgId={initial.organisationId} purpose={`sponsor-${i + 1}`} label={T.sponsorLogo(i + 1)} value={sp.logoUrl} onChange={(u) => set(["branding", "sponsors", i, "logoUrl"], u ?? undefined)} />
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" aria-label={T.sponsorUp(i + 1)} onClick={() => setForm((f) => moveIn(f, ["branding", "sponsors"], i, i - 1))} {...disabledWhen(i === 0 && T.sponsorFirst)}>
                  {copy.common.up}
                </Button>
                <Button variant="secondary" aria-label={T.sponsorDown(i + 1)} onClick={() => setForm((f) => moveIn(f, ["branding", "sponsors"], i, i + 1))} {...disabledWhen(i === form.branding.sponsors.length - 1 && T.sponsorLast)}>
                  {copy.common.down}
                </Button>
                <Button variant="danger" onClick={() => setForm((f) => removeIn(f, ["branding", "sponsors", i]))}>
                  {T.sponsorRemove}
                </Button>
              </div>
            </div>
          ))}
          <div>
            <Button variant="secondary" onClick={() => set(["branding", "sponsors", form.branding.sponsors.length], { name: "" })}>
              {T.addSponsor}
            </Button>
          </div>
        </div>
      </section>

      <section className={group} aria-label={T.simulationHeading}>
        <h3 className={groupTitle}>{T.simulationHeading}</h3>
        {checkbox(T.simulation, form.isSimulation, (v) => set(["isSimulation"], v), "event.simulation", "simulation-switch")}
        {showError("isSimulation")}
        {initial.id ? (
          <Link href={`/org/events/${initial.id}/simulate`} className="w-fit font-semibold underline" data-testid="simulate-link">
            {copy.simulator.link}
          </Link>
        ) : null}
      </section>

      <section className={group}>
        <h3 className={groupTitle}>{T.timing}</h3>
        <SettingRow id="ev-ready" label={T.readyCall} {...h("event.readyCall")}>
          <NumberField id="ev-ready" label={T.readyCall} min={0} max={120} value={Number.isNaN(form.settings.readyCallMin) ? null : form.settings.readyCallMin} onChange={(v) => set(["settings", "readyCallMin"], v)} unit={T.minutesUnit} />
        </SettingRow>
        {showError("settings.readyCallMin")}
        <SettingRow id="ev-poll" label={T.livePoll} {...h("event.livePoll")}>
          <NumberField id="ev-poll" label={T.livePoll} min={3} max={60} value={Number.isNaN(form.settings.livePollSec) ? null : form.settings.livePollSec} onChange={(v) => set(["settings", "livePollSec"], v)} unit={T.secondsUnit} />
        </SettingRow>
        {showError("settings.livePollSec")}
        <SettingRow id="ev-rotate" label={T.screenRotate} {...h("event.screenRotate")}>
          <NumberField id="ev-rotate" label={T.screenRotate} min={5} max={120} value={Number.isNaN(form.settings.screenRotateSec) ? null : form.settings.screenRotateSec} onChange={(v) => set(["settings", "screenRotateSec"], v)} unit={T.secondsUnit} />
        </SettingRow>
        {showError("settings.screenRotateSec")}
        <SettingRow id="ev-follow-rotate" label={T.followRotate} {...h("event.followRotate")}>
          <NumberField id="ev-follow-rotate" label={T.followRotate} min={5} max={120} value={Number.isNaN(form.settings.followRotateSec) ? null : form.settings.followRotateSec} onChange={(v) => set(["settings", "followRotateSec"], v)} unit={T.secondsUnit} />
        </SettingRow>
        {showError("settings.followRotateSec")}
        <SettingRow id="ev-screen-colour" label={T.screenColour} {...h("event.screenColour")}>
          <div role="radiogroup" aria-label={T.screenColour} className="flex flex-wrap gap-4">
            {(["dark", "day"] as const).map((m) => (
              <label key={m} className="flex min-h-[var(--org-ctl)] items-center gap-2 text-body font-semibold">
                <input type="radio" name="screen-colour" data-testid={`screen-colour-${m}`} checked={form.settings.screenColourMode === m} onChange={() => set(["settings", "screenColourMode"], m)} />
                {m === "dark" ? T.screenColourDark : T.screenColourDay}
              </label>
            ))}
          </div>
        </SettingRow>
        <SettingRow id="ev-max-running" label={T.maxRunning} {...h("event.maxRunning")}>
          <NumberField id="ev-max-running" label={T.maxRunning} min={1} max={5} value={Number.isNaN(form.settings.maxRunningHeats) ? null : form.settings.maxRunningHeats} onChange={(v) => set(["settings", "maxRunningHeats"], v)} />
        </SettingRow>
        {showError("settings.maxRunningHeats")}
        {checkbox(T.judgesLog, form.settings.judgesMayLogAttempts, (v) => set(["settings", "judgesMayLogAttempts"], v), "event.judgesLog")}
        <div className="flex flex-col gap-2" data-testid="external-leaderboards">
          <FieldLabel as="span" text={T.leaderboards} help={help["event.leaderboards"]} />
          {form.settings.externalLeaderboards.length === 0 ? <p className="text-body font-medium text-beach-muted">{T.noLeaderboards}</p> : null}
          {form.settings.externalLeaderboards.map((lb, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-[8px] border border-beach-line p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor={`lb-title-${i}`} className="text-small font-semibold">
                    {T.leaderboardTitle(i + 1)}
                  </label>
                  <input id={`lb-title-${i}`} value={lb.title} onChange={(e) => set(["settings", "externalLeaderboards", i, "title"], e.target.value)} className={inputCls} />
                  {showError(`settings.externalLeaderboards.${i}.title`)}
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`lb-url-${i}`} className="text-small font-semibold">
                    {T.leaderboardUrl(i + 1)}
                  </label>
                  <input id={`lb-url-${i}`} value={lb.url} onChange={(e) => set(["settings", "externalLeaderboards", i, "url"], e.target.value)} placeholder="https://" className={inputCls} />
                  {showError(`settings.externalLeaderboards.${i}.url`)}
                </div>
              </div>
              <label className="flex min-h-[var(--org-ctl)] items-center gap-3 text-body font-semibold">
                <input type="checkbox" checked={lb.embed} onChange={(e) => set(["settings", "externalLeaderboards", i, "embed"], e.target.checked)} />
                {T.leaderboardEmbed}
              </label>
              <div>
                <Button variant="danger" onClick={() => setForm((f) => removeIn(f, ["settings", "externalLeaderboards", i]))}>
                  {T.removeLeaderboard}
                </Button>
              </div>
            </div>
          ))}
          {form.settings.externalLeaderboards.length < 6 ? (
            <div>
              <Button variant="secondary" onClick={() => set(["settings", "externalLeaderboards", form.settings.externalLeaderboards.length], { title: "", url: "", embed: false })}>
                {T.addLeaderboard}
              </Button>
            </div>
          ) : null}
        </div>
        {checkbox(T.windBanner, form.settings.windCallBanner, (v) => set(["settings", "windCallBanner"], v), "event.windBanner")}
      </section>

      <section className={group} data-testid="scoring-settings">
        <h3 className={groupTitle}>{T.scoringHeading}</h3>
        <SettingRow id="ev-impression-name" label={T.impressionName} {...h("event.impressionName")}>
          <input id="ev-impression-name" data-testid="impression-name" value={form.settings.impressionName} maxLength={24} placeholder={impressionPlaceholder(impressionNames, T.impressionNamePlaceholder)} onChange={(e) => set(["settings", "impressionName"], e.target.value)} className={inputCls} />
        </SettingRow>
        {showError("settings.impressionName")}
      </section>

      <section className={group} data-testid="flags-card">
        <h3 className={groupTitle}>{T.flagsHeading}</h3>
        <p className="text-body font-medium text-beach-muted">{T.flagsIntro}</p>
        {checkbox(T.flagsOn, form.settings.flags.enabled, (v) => set(["settings", "flags", "enabled"], v), "event.flagsOn", "flags-switch")}
        {form.settings.flags.enabled ? (
          <>
            <div className="flex flex-col gap-2" data-testid="flag-states">
              <FieldLabel as="span" text={T.flagsHeading} help={help["event.flagStates"]} />
              {(["before_start", "running", "last_minute", "stopped"] as const).map((k) => (
                <div key={k} className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
                  <span className="text-body font-semibold">{T.flagStateNames[k]}</span>
                  <input aria-label={T.flagLabelOf(T.flagStateNames[k])} data-testid={`flag-label-${k}`} value={form.settings.flags.states[k].label} maxLength={24} onChange={(e) => set(["settings", "flags", "states", k, "label"], e.target.value)} className={inputCls} />
                  <input type="color" aria-label={T.flagColourOf(T.flagStateNames[k])} data-testid={`flag-colour-${k}`} value={form.settings.flags.states[k].colour} onChange={(e) => set(["settings", "flags", "states", k, "colour"], e.target.value.toUpperCase())} className="h-[var(--org-ctl)] w-16 rounded-[8px] border border-beach-border bg-transparent" />
                </div>
              ))}
              <p className="text-small font-medium text-beach-muted">{T.flagsStoppedNote}</p>
              {showError("settings.flags.states")}
            </div>
            <SettingRow id="ev-prestart" label={T.prestartSec} {...h("event.prestartSec")}>
              <NumberField id="ev-prestart" label={T.prestartSec} min={10} max={600} value={Number.isNaN(form.settings.flags.prestartSec) ? null : form.settings.flags.prestartSec} onChange={(v) => set(["settings", "flags", "prestartSec"], v)} unit={T.secondsUnit} />
            </SettingRow>
            {showError("settings.flags.prestartSec")}
            <SettingRow id="ev-lastminute" label={T.lastMinuteSec} {...h("event.lastMinuteSec")}>
              <NumberField id="ev-lastminute" label={T.lastMinuteSec} min={10} max={600} value={Number.isNaN(form.settings.flags.lastMinuteSec) ? null : form.settings.flags.lastMinuteSec} onChange={(v) => set(["settings", "flags", "lastMinuteSec"], v)} unit={T.secondsUnit} />
            </SettingRow>
            {showError("settings.flags.lastMinuteSec")}
          </>
        ) : null}
      </section>

      <section className={group} data-testid="public-page-settings">
        <h3 className={groupTitle}>{T.publicPage}</h3>
        <div className="flex items-start gap-2">
          <p className="text-body font-medium text-beach-muted">{T.publicTabsIntro}</p>
          <HelpButton what={T.publicPage} help={help["event.publicTabs"]} />
        </div>
        <ul className="flex flex-col gap-1">
          {publicTabs(form.settings.externalLeaderboards).map((tab) => {
            const on = !form.settings.publicTabsOff.includes(tab.key);
            const label = tab.label.trim() || T.publicTabUntitled;
            // the last tab that is on cannot be switched off (Join does not count: it hides itself while registration is closed)
            const last = on && tab.key !== "join" && !tabsOffLeavesOne([...form.settings.publicTabsOff, tab.key], form.settings.externalLeaderboards);
            return (
              <li key={tab.key}>
                <label className="flex min-h-[var(--org-ctl)] items-center gap-3 text-body font-semibold">
                  <input
                    type="checkbox"
                    role="switch"
                    data-testid={`public-tab-${tab.key}`}
                    checked={on}
                    disabled={last}
                    onChange={(e) => set(["settings", "publicTabsOff"], e.target.checked ? form.settings.publicTabsOff.filter((k) => k !== tab.key) : [...form.settings.publicTabsOff, tab.key])}
                  />
                  {T.publicTabOn(label)}
                  {tab.key === "join" ? <span className="text-small font-medium text-beach-muted">{T.publicTabJoinNote}</span> : null}
                </label>
              </li>
            );
          })}
        </ul>
        {showError("settings.publicTabsOff")}
      </section>

      <section className={group} data-testid="registration-settings">
        <h3 className={groupTitle}>{T.registration}</h3>
        <fieldset className="flex flex-col gap-1">
          <legend>
            <FieldLabel as="span" text={T.registrationStatus} help={help["event.registrationOpen"]} />
          </legend>
          <label className="flex min-h-[var(--org-ctl)] items-center gap-3 text-body font-semibold">
            <input type="radio" name="registration" checked={form.settings.registrationOpen} onChange={() => set(["settings", "registrationOpen"], true)} />
            {T.registrationOptionOpen}
          </label>
          <label className="flex min-h-[var(--org-ctl)] items-center gap-3 text-body font-semibold">
            <input type="radio" name="registration" checked={!form.settings.registrationOpen} onChange={() => set(["settings", "registrationOpen"], false)} />
            {T.registrationOptionClosed}
          </label>
        </fieldset>
        <p className="text-body font-medium text-beach-muted">{T.registrationNote}</p>
        {savedSlug ? (
          <p className="flex flex-wrap items-center gap-2 text-body font-semibold">
            {T.registrationLink} <SlugLink slug={`${savedSlug}/register`} />
          </p>
        ) : null}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor="ev-closes" text={T.registrationCloses} help={help["event.registrationCloses"]} />
            <input id="ev-closes" type="date" value={form.settings.registrationClosesOn ?? ""} onChange={(e) => set(["settings", "registrationClosesOn"], e.target.value || null)} className={inputCls} />
            {showError("settings.registrationClosesOn")}
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor="ev-closes-time" text={T.registrationClosesTime} help={help["event.registrationClosesTime"]} />
            <input id="ev-closes-time" type="time" value={form.settings.registrationClosesTime ?? ""} onChange={(e) => set(["settings", "registrationClosesTime"], e.target.value || null)} className={inputCls} />
            {showError("settings.registrationClosesTime")}
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor="ev-max" text={T.registrationMax} help={help["event.registrationMax"]} />
            <NumberField id="ev-max" label={T.registrationMax} min={1} max={500} value={form.settings.registrationMaxPerDivision ?? null} placeholder={T.noLimitWord} onChange={(v) => set(["settings", "registrationMaxPerDivision"], v)} onClear={() => set(["settings", "registrationMaxPerDivision"], null)} />
            {showError("settings.registrationMaxPerDivision")}
          </div>
        </div>
        <p className="text-small font-medium text-beach-muted">{T.registrationClosesHint}</p>
        <p className="text-small font-medium text-beach-muted">{T.registrationMaxHint}</p>
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="ev-closed-message" text={T.registrationClosedMessage} help={help["event.registrationClosedMessage"]} />
          <textarea id="ev-closed-message" rows={3} maxLength={300} value={form.settings.registrationClosedMessage ?? ""} onChange={(e) => set(["settings", "registrationClosedMessage"], e.target.value)} />
          <p className="text-small font-medium text-beach-muted">{T.registrationClosedMessageHint}</p>
          {showError("settings.registrationClosedMessage")}
        </div>
      </section>

      <section className={group}>
        <IdentificationEditor value={ident} onChange={(v) => set(["settings", "identification"], v)} presets={schemes} organisationId={initial.organisationId} errors={identErrors} hideLycraQuestion />
      </section>

      <section className={group}>
        <h3 className={groupTitle}>{T.joinHeading}</h3>
        <p className="text-body font-medium">{T.joinText(origin || "…", form.slug || "…")}</p>
        <p className="text-body font-medium">
          {T.eventCode} <strong data-testid="event-code">{form.slug || "…"}</strong>
        </p>
      </section>
    </div>
  );

  const footer = (
    <div className="org-new flex flex-wrap items-center gap-3">
      <Button type="submit" variant={initial.id ? "secondary" : "primary"} {...disabledWhen(pending ? copy.common.saving : slugChangedOnPublished && !understood ? T.understandFirst : null)}>
        {pending ? copy.common.saving : initial.id ? T.saveEvent : T.create}
      </Button>
      {initial.id && dirty ? <span className="text-body font-semibold">{copy.common.unsaved}</span> : null}
    </div>
  );

  const visibility = canPublishToggle ? (
    <section className="org-new flex flex-col gap-1 rounded-card border border-beach-line p-4">
      <h3 className="text-[14px] font-semibold">{T.visibility}</h3>
      <label className="flex min-h-[var(--org-ctl)] items-center gap-3 text-body font-semibold">
        <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
        {T.published}
      </label>
      <p className="text-body font-medium text-beach-muted">{T.draftNote}</p>
    </section>
  ) : (
    <p className="rounded-card border border-beach-line p-4 text-body font-semibold">{T.otherStatus(initial.status)}</p>
  );

  return (
    <form
      className="flex min-w-0 flex-col gap-4"
      aria-label={T.formLabel}
      data-layout={laptop ? "two-columns" : "one-column"}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className={laptop ? "grid grid-cols-[minmax(0,1fr)_320px] items-start gap-4" : "flex flex-col gap-4"}>
        {laptop ? null : <SummaryCard sentence={sentence} testId="event-sentence" />}
        <SettingsPanel testId="event-panel" title={T.basics} sentence={sentence} sentenceElsewhere simple={simple} advanced={advanced} advancedCount={EVENT_ADVANCED.length} storageKey="bigair.org-more-event" footer={footer} />
        {laptop ? (
          <div className="sticky top-[calc(var(--org-sticky-top,0px)+16px)] flex flex-col gap-4" data-testid="event-aside">
            <SummaryCard sentence={sentence} testId="event-sentence" />
            {visibility}
          </div>
        ) : (
          visibility
        )}
      </div>

      {serverError ? (
        <p role="alert" className="rounded-card border border-beach-border p-4 text-body font-semibold text-beach-crash">
          {copy.common.problem(serverError)}
        </p>
      ) : null}
    </form>
  );
}
