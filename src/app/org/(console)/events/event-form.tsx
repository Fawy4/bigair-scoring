"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogoField } from "@/components/org/logo-field";
import { toast } from "@/hooks/use-toast";
import { issuesToMap, moveIn, removeIn, setIn } from "@/lib/form/path";
import { EventFormSchema, slugify, type EventForm as EventFormValues } from "@/lib/schemas/event-settings";
import type { IdentificationScheme } from "@/lib/schemas/identification";
import { saveEvent } from "./actions";
import { IdentificationEditor } from "./identification-editor";

export interface EventFormInitial {
  id: string | null;
  organisationId: string;
  status: string;
  values: EventFormValues;
  savedSlug: string | null;
}

const LIVE_OPTIONS = {
  live: "Live: the public sees scores as they come in",
  after_publish: "After publish: the public sees a heat only once the head judge publishes it",
  off: "Off: no public scores",
} as const;

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
  const identErrors = Object.entries(showErrors ? { ...check, ...serverFields } : serverFields).filter(([k]) => k.startsWith("settings.identification")).map(([, m]) => m);

  const slugChangedOnPublished = initial.status === "published" && savedSlug !== null && form.slug.trim().toLowerCase() !== savedSlug;
  const canPublishToggle = initial.status === "draft" || initial.status === "published";
  const ident = form.settings.identification!;
  const timezones = timeZones.includes(form.timezone) ? timeZones : [form.timezone, ...timeZones];
  const numeric = (v: string) => (v === "" ? NaN : Number(v));

  function save() {
    setShowErrors(true);
    setServerError(null);
    setServerFields({});
    if (Object.keys(check).length > 0) {
      setServerError("Some settings need fixing. They are marked below.");
      return;
    }
    start(async () => {
      const res = await saveEvent(initial.id, form, canPublishToggle ? (published ? "published" : "draft") : null);
      if (res.ok) {
        setSavedSlug(res.slug);
        setUnderstood(false);
        setShowErrors(false);
        toast({ title: initial.id ? "Event saved" : "Event created" });
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
      aria-label="Event details"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <section className="panel flex flex-col gap-4">
        <h2 className="text-xl font-extrabold">Basics</h2>
        <div className={field}>
          <label htmlFor="ev-name">Event name</label>
          <input
            id="ev-name"
            value={form.name}
            onChange={(e) => {
              set(["name"], e.target.value);
              if (!slugTouched) set(["slug"], slugify(e.target.value));
            }}
            aria-invalid={Boolean(err("name"))}
          />
          {err("name") ? <p className="field-error">✖ {err("name")}</p> : null}
        </div>
        <div className={field}>
          <label htmlFor="ev-slug">Web address (slug)</label>
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
          {err("slug") ? <p className="field-error">✖ {err("slug")}</p> : null}
          {slugChangedOnPublished ? (
            <div className="panel mt-1" role="note">
              <p className="font-bold">⚠ This event is published. Changing the address breaks links and QR codes that are already out.</p>
              <label className="mt-2 flex items-center gap-3 font-bold">
                <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />I understand, change the address
              </label>
            </div>
          ) : null}
        </div>
        <div className={field}>
          <label htmlFor="ev-location">Location</label>
          <input id="ev-location" value={form.location} onChange={(e) => set(["location"], e.target.value)} placeholder="El Gouna, Egypt" />
          {err("location") ? <p className="field-error">✖ {err("location")}</p> : null}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className={field}>
            <label htmlFor="ev-start">First day</label>
            <input id="ev-start" type="date" value={form.start_date} onChange={(e) => set(["start_date"], e.target.value)} />
            {err("start_date") ? <p className="field-error">✖ {err("start_date")}</p> : null}
          </div>
          <div className={field}>
            <label htmlFor="ev-end">Last day</label>
            <input id="ev-end" type="date" value={form.end_date} onChange={(e) => set(["end_date"], e.target.value)} />
            {err("end_date") ? <p className="field-error">✖ {err("end_date")}</p> : null}
          </div>
          <div className={field}>
            <label htmlFor="ev-tz">Time zone</label>
            <select id="ev-tz" value={form.timezone} onChange={(e) => set(["timezone"], e.target.value)}>
              {timezones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
            <p className="text-sm font-semibold">All times are shown in this zone.</p>
            {err("timezone") ? <p className="field-error">✖ {err("timezone")}</p> : null}
          </div>
        </div>
      </section>

      <section className="panel flex flex-col gap-5">
        <h2 className="text-xl font-extrabold">Branding</h2>
        <LogoField orgId={initial.organisationId} purpose="event-logo" label="Event logo" value={form.branding.logoUrl} onChange={(u) => set(["branding", "logoUrl"], u ?? undefined)} />
        <div className="flex flex-col gap-3">
          <h3 className="text-lg font-bold">Sponsor logos</h3>
          {form.branding.sponsors.length === 0 ? <p className="font-semibold">No sponsors yet.</p> : null}
          {form.branding.sponsors.map((sp, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-lg border-2 border-[#111] p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className={field}>
                  <label htmlFor={`sp-name-${i}`}>Sponsor {i + 1} name</label>
                  <input id={`sp-name-${i}`} value={sp.name} onChange={(e) => set(["branding", "sponsors", i, "name"], e.target.value)} />
                  {err(`branding.sponsors.${i}.name`) ? <p className="field-error">✖ {err(`branding.sponsors.${i}.name`)}</p> : null}
                </div>
                <div className={field}>
                  <label htmlFor={`sp-url-${i}`}>Sponsor {i + 1} website (optional)</label>
                  <input id={`sp-url-${i}`} value={sp.url ?? ""} onChange={(e) => set(["branding", "sponsors", i, "url"], e.target.value)} placeholder="https://" />
                  {err(`branding.sponsors.${i}.url`) ? <p className="field-error">✖ {err(`branding.sponsors.${i}.url`)}</p> : null}
                </div>
              </div>
              <LogoField orgId={initial.organisationId} purpose={`sponsor-${i + 1}`} label={`Sponsor ${i + 1} logo`} value={sp.logoUrl} onChange={(u) => set(["branding", "sponsors", i, "logoUrl"], u ?? undefined)} />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn" disabled={i === 0} aria-label={`Move sponsor ${i + 1} up`} onClick={() => setForm((f) => moveIn(f, ["branding", "sponsors"], i, i - 1))}>
                  ↑
                </button>
                <button type="button" className="btn" disabled={i === form.branding.sponsors.length - 1} aria-label={`Move sponsor ${i + 1} down`} onClick={() => setForm((f) => moveIn(f, ["branding", "sponsors"], i, i + 1))}>
                  ↓
                </button>
                <button type="button" className="btn btn-danger" onClick={() => setForm((f) => removeIn(f, ["branding", "sponsors", i]))}>
                  Remove sponsor
                </button>
              </div>
            </div>
          ))}
          <div>
            <button type="button" className="btn" onClick={() => set(["branding", "sponsors", form.branding.sponsors.length], { name: "" })}>
              + Add sponsor
            </button>
          </div>
        </div>
      </section>

      <section className="panel flex flex-col gap-4">
        <h2 className="text-xl font-extrabold">Live scores and timing</h2>
        <div className={field}>
          <label htmlFor="ev-live">Public live scores</label>
          <select id="ev-live" value={form.settings.publicLiveScores} onChange={(e) => set(["settings", "publicLiveScores"], e.target.value)}>
            {Object.entries(LIVE_OPTIONS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className={field}>
            <label htmlFor="ev-ready">Ready call (minutes before a heat)</label>
            <input id="ev-ready" type="number" min={0} max={120} value={Number.isNaN(form.settings.readyCallMin) ? "" : form.settings.readyCallMin} onChange={(e) => set(["settings", "readyCallMin"], numeric(e.target.value))} />
            {err("settings.readyCallMin") ? <p className="field-error">✖ {err("settings.readyCallMin")}</p> : null}
          </div>
          <div className={field}>
            <label htmlFor="ev-poll">Live update every (seconds)</label>
            <input id="ev-poll" type="number" min={3} max={60} value={Number.isNaN(form.settings.livePollSec) ? "" : form.settings.livePollSec} onChange={(e) => set(["settings", "livePollSec"], numeric(e.target.value))} />
            {err("settings.livePollSec") ? <p className="field-error">✖ {err("settings.livePollSec")}</p> : null}
          </div>
          <div className={field}>
            <label htmlFor="ev-grace">Judges may still score after a heat (seconds)</label>
            <input id="ev-grace" type="number" min={0} max={3600} value={Number.isNaN(form.settings.judgeGraceSec) ? "" : form.settings.judgeGraceSec} onChange={(e) => set(["settings", "judgeGraceSec"], numeric(e.target.value))} />
            {err("settings.judgeGraceSec") ? <p className="field-error">✖ {err("settings.judgeGraceSec")}</p> : null}
          </div>
        </div>
        <label className="flex items-center gap-3 font-bold">
          <input type="checkbox" checked={form.settings.judgesMayLogAttempts} onChange={(e) => set(["settings", "judgesMayLogAttempts"], e.target.checked)} />
          Judges may log attempts too (not only spotters)
        </label>
        <label className="flex items-center gap-3 font-bold">
          <input type="checkbox" checked={form.settings.windCallBanner} onChange={(e) => set(["settings", "windCallBanner"], e.target.checked)} />
          Show the wind-call banner on public pages and the big screen
        </label>
      </section>

      <section className="panel flex flex-col gap-4">
        <h2 className="text-xl font-extrabold">Rider registration</h2>
        <label className="flex items-center gap-3 font-bold">
          <input type="checkbox" checked={form.settings.registrationOpen} onChange={(e) => set(["settings", "registrationOpen"], e.target.checked)} />
          Registration is open (riders can register from the event page)
        </label>
        <p className="font-semibold">Registration is closed until you switch it on. It only works once the event is published.</p>
        <div className={field}>
          <label htmlFor="ev-closes">Registration closes after (optional)</label>
          <input id="ev-closes" type="date" value={form.settings.registrationClosesOn ?? ""} onChange={(e) => set(["settings", "registrationClosesOn"], e.target.value || null)} />
          <p className="text-sm font-semibold">The whole of this day still counts, in the event’s time zone.</p>
          {err("settings.registrationClosesOn") ? <p className="field-error">✖ {err("settings.registrationClosesOn")}</p> : null}
        </div>
      </section>

      <IdentificationEditor
        value={ident}
        onChange={(v) => set(["settings", "identification"], v)}
        presets={schemes}
        organisationId={initial.organisationId}
        errors={identErrors}
      />

      <section className="panel flex flex-col gap-3">
        <h2 className="text-xl font-extrabold">Officials’ join details</h2>
        <p className="font-semibold">
          Officials join at <strong>{origin || "…"}/join</strong> with the event code <strong data-testid="event-code">{form.slug || "…"}</strong> and their own personal PIN (you create seats and PINs in the Officials step).
          There is no single PIN for the whole event: every official has their own.
        </p>
      </section>

      {canPublishToggle ? (
        <section className="panel flex flex-col gap-2">
          <h2 className="text-xl font-extrabold">Visibility</h2>
          <label className="flex items-center gap-3 font-bold">
            <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
            Published: the event is listed on the home page and its public pages work
          </label>
          <p className="font-semibold">While unpublished (draft) only your team can see the event.</p>
        </section>
      ) : (
        <p className="panel font-semibold">This event is {initial.status}; its visibility is now controlled by the heat controls.</p>
      )}

      {serverError ? (
        <p role="alert" className="panel field-error">
          ✖ {serverError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending || (slugChangedOnPublished && !understood)}>
          {pending ? "Saving…" : initial.id ? "Save event" : "Create event"}
        </button>
        {initial.id ? (
          <Link href={`/org/events/${initial.id}/divisions`} className="btn">
            Next: Divisions →
          </Link>
        ) : null}
      </div>
    </form>
  );
}
