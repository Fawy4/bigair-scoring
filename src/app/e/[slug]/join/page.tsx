import Link from "next/link";
import { JoinForm } from "@/app/join/join-form";
import { SelfAddForm } from "@/app/join/self-add-form";
import { SiteFooter, Wordmark } from "@/components/home/site-chrome";
import { getPlatformSettings } from "@/lib/platform/public-settings";
import { loadSite } from "@/lib/public/load";
import { publicMetadata } from "@/lib/public/meta";
import { requestOrigin } from "@/lib/platform/origin";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { copy } from "@/lib/ui-copy";
import "../../../home.css";

export const dynamic = "force-dynamic";

const J = copy.pub.join;
const PIN_ROLES = ["judge", "spotter", "head", "announcer", "observer"] as const;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const site = await loadSite((await params).slug);
  if (!site) return { title: copy.join.title };
  return publicMetadata(await requestOrigin(), site, "/join", { title: `${J.title} · ${site.event.name}`, description: J.intro, image: { kind: "event" } }, `${J.title} · ${site.event.name}`);
}

function Card({ href, title, text, testId }: { href: string; title: string; text: string; testId: string }) {
  return (
    <Link href={href} prefetch={false} data-testid={testId} className="home-card">
      <span className="home-body">
        <span className="home-name">{title}</span>
        <span className="home-meta">{text}</span>
      </span>
    </Link>
  );
}

/**
 * The role picker of an event. Judge, Spotter, Head judge, Announcer and Observer open the PIN form for that role; Leaderboard, Ladder and Timetable need no PIN. Every card is its
 * own address, so it can be shared on its own. "Not on the list? Add your name" stays below.
 */
export default async function EventJoinPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string; role?: string }> }) {
  const { slug } = await params;
  const { t, role } = await searchParams;
  const { data: event } = await (await createClient()).from("events").select("name").eq("slug", slug).maybeSingle();
  const site = await loadSite(slug);
  const picked = PIN_ROLES.find((r) => r === role);
  // the riders' part follows registration (open, and not past its closing time); the officials' part above never does
  const { data: reg } = await createServiceClient().rpc("public_registration_info", { p_slug: slug });
  const registration = reg as unknown as { found?: boolean; open?: boolean; closedMessage?: string | null } | null;
  const settings = await getPlatformSettings();
  return (
    <div className="home" data-testid="join-page">
      <main className="home-wrap home-narrow">
        <header>
          <Wordmark name={settings.productName} />
          <h1 className="home-title">{event?.name ?? copy.join.joinEvent}</h1>
          <p className="home-lede">{J.intro}</p>
        </header>

        <section aria-label={J.withPin} className="home-section">
          <h2 className="home-label">{J.withPin}</h2>
          <div className="home-stack">
            {PIN_ROLES.map((r) => (
              <Card key={r} testId={`role-${r}`} href={`/e/${slug}/join?role=${r}#join-pin`} title={J.roles[r].title} text={J.roles[r].text} />
            ))}
          </div>
        </section>

        {site ? (
          <section aria-label={J.withoutPin} className="home-section">
            <h2 className="home-label">{J.withoutPin}</h2>
            <div className="home-stack">
              <Card testId="role-leaderboard" href={`/e/${slug}/results`} title={J.roles.leaderboard.title} text={J.roles.leaderboard.text} />
              <Card testId="role-ladder" href={`/e/${slug}/ladder`} title={J.roles.ladder.title} text={J.roles.ladder.text} />
              <Card testId="role-timetable" href={`/e/${slug}`} title={J.roles.timetable.title} text={J.roles.timetable.text} />
            </div>
          </section>
        ) : null}

        <section id="join-pin" className="home-stack" style={{ scrollMarginTop: 16 }}>
          {picked ? (
            <h2 data-testid="joining-as" className="home-name" style={{ fontSize: 22 }}>
              {J.roles[picked].title}
            </h2>
          ) : null}
          <p className="home-meta">{copy.join.eventIntro(Boolean(t))}</p>
          <JoinForm slug={slug} token={t} />
        </section>
        <SelfAddForm slug={slug} />

        {registration?.found ? (
          <section aria-label={J.riders.heading} data-testid="join-riders" className="home-section">
            <h2 className="home-label">{J.riders.heading}</h2>
            {registration.open ? (
              <Card testId="join-register-link" href={`/e/${slug}/register`} title={J.riders.registerTitle} text={J.riders.registerText} />
            ) : (
              <div data-testid="join-registration-closed" className="home-notice">
                <p className="home-name">{copy.registration.closedTitle}</p>
                <p>{registration.closedMessage?.trim() || copy.registration.closedDefault}</p>
              </div>
            )}
          </section>
        ) : null}
        <SiteFooter />
      </main>
    </div>
  );
}
