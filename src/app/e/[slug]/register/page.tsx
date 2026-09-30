import Link from "next/link";
import { notFound } from "next/navigation";
import { divisionScheme } from "@/lib/identification/division-scheme";
import { effectiveScheme } from "@/lib/identification/effective";
import { askedIdentifiers } from "@/lib/registration/form";
import { parseEventBranding, parseEventSettings } from "@/lib/schemas/event-settings";
import { defaultScheme } from "@/lib/schemas/identification";
import { formatEventDates } from "@/lib/platform/event-label";
import { createServiceClient } from "@/lib/supabase/service";
import { copy } from "@/lib/ui-copy";
import { RegisterForm, type DivisionOption } from "./register-form";

export const dynamic = "force-dynamic";
export const metadata = { title: copy.registration.title };

interface Info {
  found: boolean;
  event: { id: string; name: string; slug: string; timezone: string; location: string | null; startDate: string | null; endDate: string | null; branding: unknown };
  organisation: { name: string };
  open: boolean;
  closedMessage: string | null;
  closesOn: string | null;
  closesTime: string | null;
  identification: unknown;
  divisions: Array<{ id: string; name: string; description: string | null; identification: unknown; full: boolean }>;
}

/** "1 Oct 2026, 18:30" for the closing moment (the closing day alone when no time is set). */
function closingText(on: string | null, time: string | null, zone: string): string | null {
  if (!on) return null;
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${on}T12:00:00Z`));
  return time ? `${date}, ${time} (${zone})` : date;
}

/** The public registration page: event branding, the divisions with their level, the rider's details and what the division's scheme needs. */
export default async function RegisterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data } = await createServiceClient().rpc("public_registration_info", { p_slug: slug });
  const info = data as unknown as Info | null;
  if (!info?.found) notFound();

  const branding = parseEventBranding(info.event.branding);
  const settings = parseEventSettings({ identification: info.identification });
  const eventIdent = settings.identification ? { scheme: settings.identification.scheme, allowDivisionOverride: settings.identification.allowDivisionOverride } : { scheme: defaultScheme(), allowDivisionOverride: false };
  const divisions: DivisionOption[] = info.divisions.map((d) => {
    const own = divisionScheme(d.identification);
    const scheme = effectiveScheme(eventIdent, own ? { scheme: own } : null);
    return { id: d.id, name: d.name, description: d.description, full: d.full, palette: scheme.palette, asked: askedIdentifiers(scheme) };
  });
  const dates = formatEventDates(info.event.startDate, info.event.endDate);
  const closes = closingText(info.closesOn, info.closesTime, info.event.timezone);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-4 text-[#111]">
      <Link href={`/e/${info.event.slug}`} className="pt-4 font-bold underline">
        ← {info.event.name}
      </Link>
      <header className="flex flex-col gap-3">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt={copy.publicSite.logoAlt(info.event.name)} className="max-h-24 w-auto self-start" />
        ) : null}
        <h1 className="text-3xl font-extrabold">{info.event.name}</h1>
        <p className="text-lg font-semibold">{[info.organisation.name, info.event.location, dates].filter(Boolean).join(" · ")}</p>
        <h2 className="text-2xl font-extrabold">{copy.registration.title}</h2>
      </header>

      {!info.open ? (
        <section className="rounded-lg border-4 border-[#111] p-4" data-testid="registration-closed">
          <p className="text-xl font-extrabold">{copy.registration.closedTitle}</p>
          <p className="mt-2 text-lg font-semibold">{info.closedMessage?.trim() || copy.registration.closedDefault}</p>
        </section>
      ) : divisions.length === 0 ? (
        <p className="rounded-lg border-4 border-[#111] p-4 text-lg font-semibold">{copy.registration.noDivisions}</p>
      ) : (
        <>
          <p className="text-lg font-semibold">{copy.registration.intro}</p>
          {closes ? <p className="font-bold">{copy.registration.closesOn(closes)}</p> : null}
          <RegisterForm slug={info.event.slug} divisions={divisions} />
        </>
      )}

      {branding.sponsors.length > 0 ? (
        <footer className="flex flex-wrap items-center gap-4 border-t-2 border-[#111] pt-4" aria-label={copy.registration.sponsors}>
          {branding.sponsors.map((s) =>
            s.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={s.name} src={s.logoUrl} alt={s.name} className="max-h-12 w-auto" />
            ) : (
              <span key={s.name} className="font-bold">
                {s.name}
              </span>
            ),
          )}
        </footer>
      ) : null}
    </main>
  );
}
