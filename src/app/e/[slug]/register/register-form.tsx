"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/browser";
import { PhotoError, preparePhoto } from "@/lib/registration/photo";
import { copy } from "@/lib/ui-copy";
import type { PaletteColour } from "@/lib/schemas/identification";
import { requestPhotoSlot, submitRegistration } from "./actions";

const T = copy.registration;
const box = "h-14 border-2 border-[#111] text-xl font-bold";

export interface DivisionOption {
  id: string;
  name: string;
  description: string | null;
  full: boolean;
  palette: PaletteColour[];
  asked: { kite: string[]; rashguard: boolean; photo: boolean };
}

const empty = { first: "", last: "", email: "", phone: "", nationality: "", sponsor: "", wooId: "", kiteBrand: "", kiteModel: "", kiteSize: "", kiteColours: "", rashguardColour: "" };

/** Big, one-thumb form for a phone on the beach. Photos are shrunk on the phone before they are sent. */
export function RegisterForm({ slug, divisions }: { slug: string; divisions: DivisionOption[] }) {
  const [divisionId, setDivisionId] = useState(divisions.find((d) => !d.full)?.id ?? "");
  const [v, setV] = useState(empty);
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [photo, setPhoto] = useState<{ blob: Blob; name: string } | null>(null);
  const [photoState, setPhotoState] = useState<"idle" | "working">("idle");
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const division = divisions.find((d) => d.id === divisionId);
  const asked = division?.asked ?? { kite: [], rashguard: false, photo: false };
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const allFull = divisions.every((d) => d.full);

  async function onPhoto(file: File | undefined) {
    setPhotoError(null);
    if (!file) return setPhoto(null);
    setPhotoState("working");
    try {
      const blob = await preparePhoto(file);
      setPhoto({ blob, name: file.name });
    } catch (e) {
      setPhoto(null);
      setPhotoError(e instanceof PhotoError && e.kind === "too-big" ? T.photoTooBig : T.photoNotImage);
    }
    setPhotoState("idle");
  }

  async function uploadPhoto(): Promise<string | undefined> {
    if (!photo) return undefined;
    const slot = await requestPhotoSlot(slug, "jpg");
    if (!slot.ok) throw new Error(slot.error);
    const { error: upErr } = await createClient().storage.from("rider-photos").uploadToSignedUrl(slot.path, slot.token, photo.blob, { contentType: "image/jpeg" });
    if (upErr) throw new Error(T.photoFailed);
    return slot.path;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const photoPath = asked.photo ? await uploadPhoto().catch((err: Error) => { setPhotoError(err.message); return undefined; }) : undefined;
      const r = await submitRegistration(slug, {
        divisionId,
        ...v,
        kiteBrand: asked.kite.includes("brand") ? v.kiteBrand : undefined,
        kiteModel: asked.kite.includes("model") ? v.kiteModel : undefined,
        kiteSize: asked.kite.includes("size") ? v.kiteSize : undefined,
        kiteColours: asked.kite.includes("colours") ? v.kiteColours : undefined,
        rashguardColour: asked.rashguard ? v.rashguardColour : undefined,
        photoPath,
        consent,
        website,
      });
      if (r.ok) setDone(true);
      else {
        setError(r.error);
        if (r.field) setFieldErrors({ [r.field]: r.error });
      }
    } catch {
      setError(T.failed);
    }
    setBusy(false);
  }

  if (done) {
    return (
      <section role="status" className="flex flex-col gap-3 rounded-lg border-4 border-[#111] p-4" data-testid="registration-done">
        <p className="text-2xl font-extrabold">{T.doneTitle}</p>
        <p className="text-lg font-semibold">{T.doneText}</p>
        <Button type="button" variant="outline" className="h-14 text-lg font-bold" onClick={() => { setDone(false); setV(empty); setPhoto(null); setConsent(false); }}>
          {T.again}
        </Button>
      </section>
    );
  }
  if (allFull) {
    return (
      <p role="status" className="rounded-lg border-4 border-[#111] p-4 text-xl font-extrabold" data-testid="registration-full">
        {T.fullTitle}: {T.fullLine}
      </p>
    );
  }

  const field = (id: keyof typeof empty, label: string, opts: { type?: string; required?: boolean; inputMode?: "tel" | "email"; max?: number } = {}) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`reg-${id}`} className="text-lg font-bold">
        {label}
      </label>
      <Input id={`reg-${id}`} type={opts.type ?? "text"} inputMode={opts.inputMode} required={opts.required} maxLength={opts.max ?? 100} value={v[id]} onChange={set(id)} aria-invalid={Boolean(fieldErrors[id])} className={box} />
      {fieldErrors[id] ? <p className="font-bold">{copy.common.problem(fieldErrors[id])}</p> : null}
    </div>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" data-testid="registration-form">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xl font-extrabold">{T.division}</legend>
        {divisions.map((d) => (
          <label key={d.id} className={`flex flex-col gap-1 rounded-lg border-2 border-[#111] p-3 ${d.full ? "opacity-70" : ""}`}>
            <span className="flex items-center gap-3 text-xl font-bold">
              <input type="radio" name="division" className="h-6 w-6" checked={divisionId === d.id} disabled={d.full} onChange={() => setDivisionId(d.id)} required />
              {d.full ? T.divisionFullOption(d.name) : d.name}
            </span>
            {d.description ? <span className="pl-9 text-base font-semibold">{T.divisionLevel(d.description)}</span> : null}
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-xl font-extrabold">{T.yourDetails}</legend>
        {field("first", T.first, { required: true, max: 60 })}
        {field("last", T.last, { required: true, max: 60 })}
        {field("email", T.email, { type: "email", required: true, inputMode: "email", max: 254 })}
        {field("phone", T.phone, { type: "tel", inputMode: "tel", max: 30 })}
        {field("nationality", T.nationality, { max: 60 })}
        {field("sponsor", T.sponsor)}
        {field("wooId", T.wooId, { max: 40 })}
      </fieldset>

      {asked.kite.length > 0 || asked.rashguard || asked.photo ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-xl font-extrabold">{T.gearHeading}</legend>
          {asked.kite.includes("brand") ? field("kiteBrand", T.kiteBrand, { max: 60 }) : null}
          {asked.kite.includes("model") ? field("kiteModel", T.kiteModel, { max: 60 }) : null}
          {asked.kite.includes("size") ? field("kiteSize", T.kiteSize, { max: 10 }) : null}
          {asked.kite.includes("colours") ? field("kiteColours", T.kiteColours, { max: 60 }) : null}
          {asked.rashguard ? (
            <div className="flex flex-col gap-1">
              <label htmlFor="reg-rashguard" className="text-lg font-bold">
                {T.rashguard}
              </label>
              <select id="reg-rashguard" value={v.rashguardColour} onChange={set("rashguardColour")} className="h-14 rounded-md border-2 border-[#111] bg-white px-3 text-xl font-bold">
                <option value="">{copy.riders.pickColour}</option>
                {(division?.palette ?? []).map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {asked.photo ? (
            <div className="flex flex-col gap-2">
              <label htmlFor="reg-photo" className="text-lg font-bold">
                {T.photo}
              </label>
              <p className="font-semibold">{T.photoHelp}</p>
              <input id="reg-photo" type="file" accept="image/*" data-testid="photo-input" onChange={(e) => void onPhoto(e.target.files?.[0])} className="text-lg font-semibold" />
              {photoState === "working" ? <p role="status" className="font-bold">{T.photoTaking}</p> : null}
              {photo ? (
                <p role="status" className="font-bold" data-testid="photo-ready">
                  {T.photoReady(Math.round(photo.blob.size / 1024))}{" "}
                  <button type="button" className="underline" onClick={() => setPhoto(null)}>
                    {T.photoRemove}
                  </button>
                </p>
              ) : null}
              {photoError ? <p role="alert" className="font-bold">{copy.common.problem(photoError)}</p> : null}
            </div>
          ) : null}
        </fieldset>
      ) : null}

      <label className="flex items-start gap-3 text-lg font-bold">
        <input type="checkbox" className="mt-1 h-7 w-7 shrink-0" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
        <span>{T.consent}</span>
      </label>

      {/* honeypot: hidden from people and from screen readers */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="reg-website">Website</label>
        <input id="reg-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border-4 border-[#111] p-3 text-lg font-bold" data-testid="registration-error">
          {copy.common.problem(error)}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={busy || !divisionId || !consent || photoState === "working"} className="h-16 text-xl font-bold" data-testid="registration-submit">
        {busy ? T.submitting : T.submit}
      </Button>
    </form>
  );
}
