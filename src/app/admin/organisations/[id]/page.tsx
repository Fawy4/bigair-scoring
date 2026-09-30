import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlatformSettings } from "@/lib/platform/public-settings";
import { formatWhen } from "@/lib/platform/event-label";
import { organisationStatus, deleteBlockedReason } from "@/lib/platform/organisation";
import { requireAdmin } from "@/lib/platform/session";
import { copy } from "@/lib/ui-copy";
import { startImpersonation } from "../../actions";
import { ArchivePanel, DeletePanel, InvitePanel, LogoPanel, RenamePanel } from "./panels";
import { EventsPanel } from "./events-panel";
import { formatEventDates } from "@/lib/platform/event-label";

const th = "border-2 border-[#111] bg-[#eee] p-2 text-left";
const td = "border-2 border-[#111] p-2";

export default async function OrganisationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, role } = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: all } = await supabase.rpc("admin_organisation_overview");
  const org = (all ?? []).find((o) => o.id === id);
  if (!org) notFound();
  const { data: members } = await supabase.rpc("admin_organisation_members", { p_org: id });
  const { data: events } = await supabase.rpc("admin_organisation_events", { p_org: id });
  const { defaultTimezone } = await getPlatformSettings();
  const c = copy.admin.org;
  const status = organisationStatus(org.archived_at);

  return (
    <main className="flex max-w-3xl flex-col gap-8">
      <Link href="/admin" className="font-bold underline">
        {c.backToList}
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold">{org.name}</h1>
        <p className="text-lg font-semibold">
          /{org.slug} · {org.plan} · <span aria-hidden="true">{status === "active" ? "●" : "⏸"}</span> <span>{c.status[status]}</span>
        </p>
        <p className="font-semibold">{c.overview(org.events_count, org.published_events_count, org.members_count)}</p>
        <p className="font-semibold">{c.lastActivity(formatWhen(org.last_activity, defaultTimezone) || c.noActivity)}</p>
        <form action={startImpersonation}>
          <input type="hidden" name="orgId" value={org.id} />
          <button type="submit" className="btn w-fit">
            {c.openAs}
          </button>
        </form>
      </header>

      <section className="flex flex-col gap-3" aria-labelledby="members-h">
        <h2 id="members-h" className="text-2xl font-extrabold">
          {c.membersHeading}
        </h2>
        {(members ?? []).length === 0 ? (
          <p className="panel font-semibold">{c.membersNone}</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>{c.memberColumns.email}</th>
                <th className={th}>{c.memberColumns.role}</th>
                <th className={th}>{c.memberColumns.since}</th>
              </tr>
            </thead>
            <tbody>
              {(members ?? []).map((m) => (
                <tr key={m.user_id}>
                  <td className={td}>{m.email}</td>
                  <td className={td}>{m.role}</td>
                  <td className={td}>{formatWhen(m.created_at, defaultTimezone)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <EventsPanel
        orgName={org.name}
        isOwner={role === "owner"}
        others={(all ?? []).filter((o) => o.id !== org.id).map((o) => ({ id: o.id, name: o.name }))}
        events={(events ?? []).map((e) => ({ id: e.id, name: e.name, slug: e.slug, status: e.status, dates: formatEventDates(e.start_date, e.end_date), divisions: e.divisions_count, running: e.running_heats > 0 }))}
      />
      <InvitePanel orgId={org.id} />
      <RenamePanel orgId={org.id} name={org.name} />
      <LogoPanel orgId={org.id} logoUrl={org.logo_url} />
      <ArchivePanel orgId={org.id} name={org.name} archived={status === "archived"} />
      <DeletePanel orgId={org.id} name={org.name} slug={org.slug} blocked={deleteBlockedReason(org.published_results_count)} isOwner={role === "owner"} />
    </main>
  );
}
