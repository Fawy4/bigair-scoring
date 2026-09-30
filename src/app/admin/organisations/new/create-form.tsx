"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { FieldLabel } from "@/components/help-button";
import { toast } from "@/hooks/use-toast";
import { uploadBrandingImage } from "@/lib/branding/upload";
import { imageProblem } from "@/lib/branding/image";
import { copy } from "@/lib/ui-copy";
import { createOrganisation, setOrganisationLogo } from "../../actions";

const help = {
  name: { text: "The customer's name as it should appear on the public site and in their headers.", example: "Arrow" },
  slug: { text: "The customer's public address: lowercase letters, numbers and hyphens.", example: "arrow" },
  timeZone: { text: "The time zone pre-filled for every new event of this organisation. Each event can still choose its own.", example: "Africa/Cairo" },
};

function slugFrom(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export function CreateOrganisationForm({ timeZones, defaultTimezone }: { timeZones: string[]; defaultTimezone: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [tz, setTz] = useState(defaultTimezone);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const logo = useRef<HTMLInputElement>(null);
  const [logoName, setLogoName] = useState<string | null>(null);
  const zones = timeZones.includes(tz) ? timeZones : [tz, ...timeZones];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFields({});
    const file = logo.current?.files?.[0];
    const problem = file ? imageProblem(file) : null;
    if (problem) {
      setError(problem);
      return;
    }
    start(async () => {
      const res = await createOrganisation({ name, slug, timezone: tz });
      if (!res.ok) {
        setError(res.error);
        setFields(res.fields ?? {});
        return;
      }
      if (file) {
        try {
          const url = await uploadBrandingImage(res.id, "organisation-logo", file);
          await setOrganisationLogo(res.id, url);
        } catch {
          toast({ title: copy.admin.org.created, description: copy.admin.org.logoFailed });
          router.push(`/admin/organisations/${res.id}`);
          return;
        }
      }
      toast({ title: copy.admin.org.created });
      router.push(`/admin/organisations/${res.id}`);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" aria-label={copy.admin.org.createHeading}>
      <fieldset disabled={pending} className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="org-name" text={copy.admin.org.name} help={help.name} />
          <input
            id="org-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugFrom(e.target.value));
            }}
            aria-invalid={Boolean(fields.name)}
            autoComplete="off"
          />
          {fields.name ? <p className="field-error">{copy.common.problem(fields.name)}</p> : null}
        </div>
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="org-slug" text={copy.admin.org.slug} help={help.slug} />
          <input
            id="org-slug"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
            aria-invalid={Boolean(fields.slug)}
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
          />
          <p className="text-sm font-semibold">{copy.admin.org.slugHint}</p>
          {fields.slug ? <p className="field-error">{copy.common.problem(fields.slug)}</p> : null}
        </div>
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="org-tz" text={copy.admin.org.timeZone} help={help.timeZone} />
          <select id="org-tz" value={tz} onChange={(e) => setTz(e.target.value)}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          <p className="text-sm font-semibold">{copy.admin.org.timeZoneHint}</p>
          {fields.timezone ? <p className="field-error">{copy.common.problem(fields.timezone)}</p> : null}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-base font-bold">{copy.admin.org.logo}</span>
          <label className="btn w-fit cursor-pointer">
            {logoName ?? copy.logo.choose}
            <input
              ref={logo}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-label={copy.admin.org.logoFile}
              onChange={(e) => setLogoName(e.target.files?.[0]?.name ?? null)}
            />
          </label>
          <p className="text-sm font-semibold">{copy.admin.org.logoHint}</p>
        </div>
      </fieldset>
      {error ? (
        <p role="alert" className="panel field-error">
          {copy.common.problem(error)}
        </p>
      ) : null}
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? copy.admin.org.creating : copy.admin.org.create}
        </button>
      </div>
    </form>
  );
}
