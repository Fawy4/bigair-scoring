"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FieldLabel, HelpButton } from "@/components/help-button";
import { LogoField } from "@/components/org/logo-field";
import { SlugLink } from "@/components/slug-link";
import { toast } from "@/hooks/use-toast";
import { issuesToMap, moveIn, removeIn, setIn } from "@/lib/form/path";
import { EventFormSchema, slugify, type EventForm as EventFormValues } from "@/lib/schemas/event-settings";
import type { IdentificationScheme } from "@/lib/schemas/identification";
import { copy, help } from "@/lib/ui-copy";
import { saveEvent } from "./actions";
import { IdentificationEditor } from "./identification-editor";

const T = copy.event;

export interface EventFormInitial {
  id: string | null;
  organisationId: string;
  status: string;
  values: EventFormValues;
  savedSlug: string | null;
}

export function EventForm({ initial, timeZones, schemes }: { initial: EventFormInitial; timeZones: string[]; schemes: IdentificationScheme[] }) {
  const router = useRouter();
  const [form, setForm] = useState<EventFormValues>(initial.values);
  const [published, setPublished] = useState(initial.status === "published");
  const [slugTouched, setSlugTouched] = useState(initial.id !== null);
  const [understood, setUnderstood] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverFields, setServerFields] = useState<Record<string, string>>({});
  const [savedSlug, setSavedSlug] = useState(initial.savedSlug);
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
  const numeric = (v: string) => (v === "" ? NaN : Number(v));
  const num = (n: number) => (Number.isNaN(n) ? "" : n);
  const showError = (key: string) => (err(key) ? <p className="field-error">{copy.common.problem(err(key)!)}</p> : null);

  function save() {
    setShowErrors(true);
    setServerError(null);
    setServerFields({});
    if (Object.keys(check).length > 0) {
      setServerError(T.fixThese);
      return;
    }
    start(async () => {
      const res = await saveEvent(initial.id, form, canPublishToggle ? (published ? "published" : "draft") : null);
      if (res.ok) {
        setSavedSlug(res.slug);
        setUnderstood(false);
        setShowErrors(false);
        toast({ title: initial.id ? T.saved : T.created });
        if (!initial.id) router.push(`/org/events/${res.id}/event`);
        else router.refresh();
      } else {
        setServerError(res.error);
        setServerFields(res.fields ?? {});
      }
    });
  }

  const field = "flex flex-col gap-1";
  return (
    <form
      className="flex flex-col gap-6"
      aria-label={T.formLabel}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <section className="panel flex flex-col gap-4">
        <h2 className="text-xl font-extrabold">{T.basics}</h2>
        <div className={field}>
          <FieldLabel htmlFor="ev-name" text={T.name} help={help["event.name"]} />
          <input
            id="ev-name"
            value={form.name}
            onChange={(e) => {
              set(["name"], e.target.value);
              if (!slugTouched) set(["slug"], slugify(e.target.value));
            }}
            aria-invalid={Boolean(err("name"))}
          />
          {showError("name")}
        </div>
        <div className={field}>
          <FieldLabel htmlFor="ev-slug" text={T.slug} help={help["event.slug"]} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{origin || "https://…"}/e/</span>
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
              className="w-64"
            />
          </div>
          {showError("slug")}
          {savedSlug ? (
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              {T.slugPublicPage} <SlugLink slug={savedSlug} />
            </p>
          ) : null}
          {slugChangedOnPublished ? (
            <div className="panel mt-1" role="note">
              <p className="font-bold">{T.slugPublishedTitle}</p>
              <label className="mt-2 flex items-center gap-3 font-bold">
                <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
                {T.understand}
              </label>
            </div>
          ) : null}
        </div>
        <div className={field}>
          <FieldLabel htmlFor="ev-location" text={T.location} help={help["event.location"]} />
          <input id="ev-location" value={form.location} onChange={(e) => set(["location"], e.target.value)} placeholder={T.locationPlaceholder} />
          {showError("location")}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className={field}>
            <FieldLabel htmlFor="ev-start" text={T.firstDay} help={help["event.dates"]} />
            <input id="ev-start" type="date" value={form.start_date} onChange={(e) => set(["start_date"], e.target.value)} />
            {showError("start_date")}
          </div>
          <div className={field}>
            <FieldLabel htmlFor="ev-end" text={T.lastDay} help={help["event.dates"]} />
            <input id="ev-end" type="date" value={form.end_date} onChange={(e) => set(["end_date"], e.target.value)} />
            {showError("end_date")}
          </div>
          <div className={field}>
            <FieldLabel htmlFor="ev-tz" text={T.timeZone} help={help["event.timeZone"]} />
            <select id="ev-tz" value={form.timezone} onChange={(e) => set(["timezone"], e.target.value)}>
              {timezones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
            <p className="text-sm font-semibold">{T.timeZoneHint}</p>
            {showError("timezone")}
          </div>
        </div>
      </section>

      <section className="panel flex flex-col gap-5">
        <h2 className="text-xl font-extrabold">{T.branding}</h2>
        <LogoField orgId={initial.organisationId} purpose="event-logo" label={T.eventLogo} value={form.branding.logoUrl} onChange={(u) => set(["branding", "logoUrl"], u ?? undefined)} />
        <div className="flex flex-col gap-3">
          <FieldLabel as="span" text={T.sponsors} help={help["event.sponsors"]} />
          {form.branding.sponsors.length === 0 ? <p className="font-semibold">{T.noSponsors}</p> : null}
          {form.branding.sponsors.map((sp, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-lg border-2 border-[#111] p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className={field}>
                  <label htmlFor={`sp-name-${i}`}>{T.sponsorName(i + 1)}</label>
                  <input id={`sp-name-${i}`} value={sp.name} onChange={(e) => set(["branding", "sponsors", i, "name"], e.target.value)} />
                  {showError(`branding.sponsors.${i}.name`)}
                </div>
                <div className={field}>
                  <label htmlFor={`sp-url-${i}`}>{T.sponsorUrl(i + 1)}</label>
                  <input id={`sp-url-${i}`} value={sp.url ?? ""} onChange={(e) => set(["branding", "sponsors", i, "url"], e.target.value)} placeholder="https://" />
                  {showError(`branding.sponsors.${i}.url`)}
                </div>
              </div>
              <LogoField orgId={initial.organisationId} purpose={`sponsor-${i + 1}`} label={T.sponsorLogo(i + 1)} value={sp.logoUrl} onChange={(u) => set(["branding", "sponsors", i, "logoUrl"], u ?? undefined)} />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn" disabled={i === 0} aria-label={T.sponsorUp(i + 1)} onClick={() => setForm((f) => moveIn(f, ["branding", "sponsors"], i, i - 1))}>
                  {copy.common.up}
                </button>
                <button type="button" className="btn" disabled={i === form.branding.sponsors.length - 1} aria-label={T.sponsorDown(i + 1)} onClick={() => setForm((f) => moveIn(f, ["branding", "sponsors"], i, i + 1))}>
                  {copy.common.down}
                </button>
                <button type="button" className="btn btn-danger" onClick={() => setForm((f) => removeIn(f, ["branding", "sponsors", i]))}>
                  {T.sponsorRemove}
                </button>
              </div>
            </div>
          ))}
          <div>
            <button type="button" className="btn" onClick={() => set(["branding", "sponsors", form.branding.sponsors.length], { name: "" })}>
              {T.addSponsor}
            </button>
          </div>
        </div>
      </section>

      <section className="panel flex flex-col gap-4" aria-labelledby="visibility-heading">
        <div className="flex items-start gap-2">
          <h2 id="visibility-heading" className="text-xl font-extrabold">
            {T.visibilityHeading}
          </h2>
        </div>
        <FieldLabel as="span" text={T.visibilityIntro} help={help["event.visibility"]} />
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="flex items-start gap-2">
              <label className="flex items-center gap-3 font-bold">
                <input type="checkbox" checked={form.settings.publicLiveScores === "live"} onChange={(e) => set(["settings", "publicLiveScores"], e.target.checked ? "live" : "after_publish")} />
                {T.showLive}
              </label>
              <HelpButton what={T.showLive} help={help["event.showLive"]} />
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="flex items-start gap-2">
              <label className="flex items-center gap-3 font-bold">
                <input type="checkbox" checked={form.settings.publicResultsOnPublish} onChange={(e) => set(["settings", "publicResultsOnPublish"], e.target.checked)} />
                {T.showResults}
              </label>
              <HelpButton what={T.showResults} help={help["event.showResults"]} />
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="flex items-start gap-2">
              <label className="flex items-center gap-3 font-bold">
                <input type="checkbox" checked={form.settings.holdFinalResult} onChange={(e) => set(["settings", "holdFinalResult"], e.target.checked)} />
                {T.holdFinal}
              </label>
              <HelpButton what={T.holdFinal} help={help["event.holdFinal"]} />
            </span>
          </div>
        </div>
      </section>

      <section className="panel flex flex-col gap-4" aria-label={T.simulationHeading}>
        <h2 className="text-xl font-extrabold">{T.simulationHeading}</h2>
        <div className="flex flex-col gap-1">
          <span className="flex items-start gap-2">
            <label className="flex items-center gap-3 font-bold">
              <input type="checkbox" data-testid="simulation-switch" checked={form.isSimulation} onChange={(e) => set(["isSimulation"], e.target.checked)} />
              {T.simulation}
            </label>
            <HelpButton what={T.simulation} help={help["event.simulation"]} />
          </span>
          {showError("isSimulation")}
        </div>
      </section>

      <section className="panel flex flex-col gap-4">
        <h2 className="text-xl font-extrabold">{T.timing}</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <div className={field}>
            <FieldLabel htmlFor="ev-ready" text={T.readyCall} help={help["event.readyCall"]} />
            <input id="ev-ready" type="number" min={0} max={120} value={num(form.settings.readyCallMin)} onChange={(e) => set(["settings", "readyCallMin"], numeric(e.target.value))} />
            {showError("settings.readyCallMin")}
          </div>
          <div className={field}>
            <FieldLabel htmlFor="ev-poll" text={T.livePoll} help={help["event.livePoll"]} />
            <input id="ev-poll" type="number" min={3} max={60} value={num(form.settings.livePollSec)} onChange={(e) => set(["settings", "livePollSec"], numeric(e.target.value))} />
            {showError("settings.livePollSec")}
          </div>
          <div className={field}>
            <FieldLabel htmlFor="ev-rotate" text={T.screenRotate} help={help["event.screenRotate"]} />
            <input id="ev-rotate" type="number" min={5} max={120} value={num(form.settings.screenRotateSec)} onChange={(e) => set(["settings", "screenRotateSec"], numeric(e.target.value))} />
            {showError("settings.screenRotateSec")}
          </div>
          <div className={field}>
            <FieldLabel htmlFor="ev-max-running" text={T.maxRunning} help={help["event.maxRunning"]} />
            <input id="ev-max-running" type="number" min={1} max={5} value={num(form.settings.maxRunningHeats)} onChange={(e) => set(["settings", "maxRunningHeats"], numeric(e.target.value))} />
            {showError("settings.maxRunningHeats")}
          </div>
        </div>
        <span className="flex items-start gap-2">
          <label className="flex items-center gap-3 font-bold">
            <input type="checkbox" checked={form.settings.judgesMayLogAttempts} onChange={(e) => set(["settings", "judgesMayLogAttempts"], e.target.checked)} />
            {T.judgesLog}
          </label>
          <HelpButton what={T.judgesLog} help={help["event.judgesLog"]} />
        </span>
        <div className="flex flex-col gap-2" data-testid="external-leaderboards">
          <FieldLabel as="span" text={T.leaderboards} help={help["event.leaderboards"]} />
          {form.settings.externalLeaderboards.length === 0 ? <p className="font-semibold">{T.noLeaderboards}</p> : null}
          {form.settings.externalLeaderboards.map((lb, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-lg border-2 border-[#111] p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className={field}>
                  <FieldLabel htmlFor={`lb-title-${i}`} text={T.leaderboardTitle(i + 1)} />
                  <input id={`lb-title-${i}`} value={lb.title} onChange={(e) => set(["settings", "externalLeaderboards", i, "title"], e.target.value)} />
                  {showError(`settings.externalLeaderboards.${i}.title`)}
                </div>
                <div className={field}>
                  <FieldLabel htmlFor={`lb-url-${i}`} text={T.leaderboardUrl(i + 1)} />
                  <input id={`lb-url-${i}`} value={lb.url} onChange={(e) => set(["settings", "externalLeaderboards", i, "url"], e.target.value)} placeholder="https://" />
                  {showError(`settings.externalLeaderboards.${i}.url`)}
                </div>
              </div>
              <label className="flex items-center gap-3 font-bold">
                <input type="checkbox" checked={lb.embed} onChange={(e) => set(["settings", "externalLeaderboards", i, "embed"], e.target.checked)} />
                {T.leaderboardEmbed}
              </label>
              <div>
                <button type="button" className="btn btn-danger" onClick={() => setForm((f) => removeIn(f, ["settings", "externalLeaderboards", i]))}>
                  {T.removeLeaderboard}
                </button>
              </div>
            </div>
          ))}
          {form.settings.externalLeaderboards.length < 6 ? (
            <div>
              <button type="button" className="btn" onClick={() => set(["settings", "externalLeaderboards", form.settings.externalLeaderboards.length], { title: "", url: "", embed: false })}>
                {T.addLeaderboard}
              </button>
            </div>
          ) : null}
        </div>
        <span className="flex items-start gap-2">
          <label className="flex items-center gap-3 font-bold">
            <input type="checkbox" checked={form.settings.windCallBanner} onChange={(e) => set(["settings", "windCallBanner"], e.target.checked)} />
            {T.windBanner}
          </label>
          <HelpButton what={T.windBanner} help={help["event.windBanner"]} />
        </span>
      </section>

      <section className="panel flex flex-col gap-4" data-testid="registration-settings">
        <h2 className="text-xl font-extrabold">{T.registration}</h2>
        <fieldset className="flex flex-col gap-2">
          <legend>
            <FieldLabel as="span" text={T.registrationStatus} help={help["event.registrationOpen"]} />
          </legend>
          <label className="flex items-center gap-3 font-bold">
            <input type="radio" name="registration" checked={form.settings.registrationOpen} onChange={() => set(["settings", "registrationOpen"], true)} />
            {T.registrationOptionOpen}
          </label>
          <label className="flex items-center gap-3 font-bold">
            <input type="radio" name="registration" checked={!form.settings.registrationOpen} onChange={() => set(["settings", "registrationOpen"], false)} />
            {T.registrationOptionClosed}
          </label>
        </fieldset>
        <p className="font-semibold">{T.registrationNote}</p>
        {savedSlug ? (
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {T.registrationLink} <SlugLink slug={`${savedSlug}/register`} />
          </p>
        ) : null}
        <div className="grid gap-4 md:grid-cols-3">
          <div className={field}>
            <FieldLabel htmlFor="ev-closes" text={T.registrationCloses} help={help["event.registrationCloses"]} />
            <input id="ev-closes" type="date" value={form.settings.registrationClosesOn ?? ""} onChange={(e) => set(["settings", "registrationClosesOn"], e.target.value || null)} />
            {showError("settings.registrationClosesOn")}
          </div>
          <div className={field}>
            <FieldLabel htmlFor="ev-closes-time" text={T.registrationClosesTime} help={help["event.registrationClosesTime"]} />
            <input id="ev-closes-time" type="time" value={form.settings.registrationClosesTime ?? ""} onChange={(e) => set(["settings", "registrationClosesTime"], e.target.value || null)} />
            {showError("settings.registrationClosesTime")}
          </div>
          <div className={field}>
            <FieldLabel htmlFor="ev-max" text={T.registrationMax} help={help["event.registrationMax"]} />
            <input id="ev-max" type="number" min={1} max={500} value={form.settings.registrationMaxPerDivision ?? ""} onChange={(e) => set(["settings", "registrationMaxPerDivision"], e.target.value === "" ? null : Number(e.target.value))} />
            {showError("settings.registrationMaxPerDivision")}
          </div>
        </div>
        <p className="text-sm font-semibold">{T.registrationClosesHint}</p>
        <p className="text-sm font-semibold">{T.registrationMaxHint}</p>
        <div className={field}>
          <FieldLabel htmlFor="ev-closed-message" text={T.registrationClosedMessage} help={help["event.registrationClosedMessage"]} />
          <textarea id="ev-closed-message" rows={3} maxLength={300} value={form.settings.registrationClosedMessage ?? ""} onChange={(e) => set(["settings", "registrationClosedMessage"], e.target.value)} />
          <p className="text-sm font-semibold">{T.registrationClosedMessageHint}</p>
          {showError("settings.registrationClosedMessage")}
        </div>
      </section>

      <IdentificationEditor value={ident} onChange={(v) => set(["settings", "identification"], v)} presets={schemes} organisationId={initial.organisationId} errors={identErrors} />

      <section className="panel flex flex-col gap-3">
        <h2 className="text-xl font-extrabold">{T.joinHeading}</h2>
        <p className="font-semibold">{T.joinText(origin || "…", form.slug || "…")}</p>
        <p className="font-semibold">
          {T.eventCode} <strong data-testid="event-code">{form.slug || "…"}</strong>
        </p>
      </section>

      {canPublishToggle ? (
        <section className="panel flex flex-col gap-2">
          <h2 className="text-xl font-extrabold">{T.visibility}</h2>
          <label className="flex items-center gap-3 font-bold">
            <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
            {T.published}
          </label>
          <p className="font-semibold">{T.draftNote}</p>
        </section>
      ) : (
        <p className="panel font-semibold">{T.otherStatus(initial.status)}</p>
      )}

      {serverError ? (
        <p role="alert" className="panel field-error">
          {copy.common.problem(serverError)}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending || (slugChangedOnPublished && !understood)}>
          {pending ? copy.common.saving : initial.id ? T.saveEvent : T.create}
        </button>
        {initial.id ? (
          <Link href={`/org/events/${initial.id}/divisions`} className="btn">
            {T.next}
          </Link>
        ) : null}
      </div>
    </form>
  );
}
