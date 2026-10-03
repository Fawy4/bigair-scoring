import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlatformSettings } from "@/lib/platform/public-settings";
import { formatWhen } from "@/lib/platform/event-label";
import { organisationStatus, deleteBlockedReason } from "@/lib/platform/organisation";
import { requireAdmin } from "@/lib/platform/session";
import { copy } from "@/lib/ui-copy";
import { startImpersonation } from "../../actions";
import { ArchivePanel, DeletePanel, InvitePanel, LogoPanel, RemoveOrganiserButton, RenamePanel } from "./panels";
import { EventsPanel } from "./events-panel";
import { formatEventDates } from "@/lib/platform/event-label";

const th = "border border-beach-line bg-beach-surface p-2 text-left";
const td = "border border-beach-line p-2";

export default async function OrganisationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, role, user } = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: all } = await supabase.rpc("admin_organisation_overview");
  const org = (all ?? []).find((o) => o.id === id);
  if (!org) notFound();
  const { data: members } = await supabase.rpc("admin_organisation_members", { p_org: id });
  const { data: events } = await supabase.rpc("admin_organisation_events", { p_org: id });
  // the copy a Reset kept (owners only see it; the table's read rule says who), newest first, within its 30 days
  const eventIds = (events ?? []).map((e) => e.id);
  const { data: snapshots } = eventIds.length ? await supabase.from("event_reset_snapshots").select("id, event_id, taken_at").in("event_id", eventIds).gt("expires_at", new Date().toISOString()).order("taken_at", { ascending: false }) : { data: [] as Array<{ id: string; event_id: string; taken_at: string }> };
  const copies = new Map<string, { id: string; date: string }>();
  for (const sn of snapshots ?? []) if (!copies.has(sn.event_id)) copies.set(sn.event_id, { id: sn.id, date: formatEventDates(sn.taken_at.slice(0, 10), sn.taken_at.slice(0, 10)) });
  const { defaultTimezone } = await getPlatformSettings();
  const c = copy.admin.org;
  const status = organisationStatus(org.archived_at);

  return (
    <main className="flex flex-col gap-8">
      <Link href="/admin" className="font-semibold underline">
        {c.backToList}
      </Link>
      <header className="flex flex-col gap-2">
        <h1>{org.name}</h1>
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
        <h2 id="members-h" className="text-2xl font-semibold">
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
                {role === "owner" ? <th className={th}>{c.removeColumn}</th> : null}
              </tr>
            </thead>
            <tbody>
              {(members ?? []).map((m) => (
                <tr key={m.user_id}>
                  <td className={td}>{m.email}</td>
                  <td className={td}>{m.role}</td>
                  <td className={td}>{formatWhen(m.created_at, defaultTimezone)}</td>
                  {role === "owner" ? (
                    <td className={td}>
                      <RemoveOrganiserButton orgId={org.id} orgName={org.name} userId={m.user_id} email={m.email} isSelf={m.user_id === user.id} />
                    </td>
                  ) : null}
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
        events={(events ?? []).map((e) => ({ id: e.id, name: e.name, slug: e.slug, status: e.status, dates: formatEventDates(e.start_date, e.end_date), divisions: e.divisions_count, running: e.running_heats > 0, published: e.published_results, archived: Boolean(e.archived_at), resetCopy: copies.get(e.id) ?? null }))}
      />
      <InvitePanel orgId={org.id} />
      <RenamePanel orgId={org.id} name={org.name} />
      <LogoPanel orgId={org.id} logoUrl={org.logo_url} />
      <ArchivePanel orgId={org.id} name={org.name} archived={status === "archived"} />
      <DeletePanel orgId={org.id} name={org.name} slug={org.slug} blocked={deleteBlockedReason(org.published_results_count)} isOwner={role === "owner"} />
    </main>
  );
}
