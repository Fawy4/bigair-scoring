import Link from "next/link";
import { formatWhen } from "@/lib/platform/event-label";
import { getPlatformSettings } from "@/lib/platform/public-settings";
import { attempt } from "@/lib/platform/safe";
import { requireAdmin } from "@/lib/platform/session";
import { isTestData, organisationStatus } from "@/lib/platform/organisation";
import { copy } from "@/lib/ui-copy";
import { startImpersonation } from "./actions";
import { DemoPanel } from "./demo-panel";
import { RowMenu } from "./row-menu";

export const metadata = { title: copy.admin.org.heading };

const th = "border-2 border-[#111] bg-[#eee] p-2 text-left";
const td = "border-2 border-[#111] p-2 align-top";

export default async function AdminOrganisations({ searchParams }: { searchParams: Promise<{ problem?: string }> }) {
  const { supabase, role } = await requireAdmin();
  const { problem } = await searchParams;
  const { defaultTimezone } = (await attempt("Platform settings", getPlatformSettings, { defaultTimezone: "Africa/Cairo" } as Awaited<ReturnType<typeof getPlatformSettings>>)).value;
  // a failure here (network, database, unexpected data) shows a message on the page instead of crashing it
  const loaded = await attempt("Organisations", async () => await supabase.rpc("admin_organisation_overview"), { data: null, error: { message: "not loaded" } } as unknown as Awaited<ReturnType<typeof supabase.rpc<"admin_organisation_overview">>>);
  const { data, error } = loaded.value;
  const rows = data ?? [];
  const c = copy.admin.org;
  // Only when there is no demo organisation, only for owners, and never where the demo is switched off (a project with a real event).
  const showDemo = role === "owner" && !error && !rows.some((o) => o.slug === "demo" || o.slug === "demo-org") && process.env.DEMO_SEED_DISABLED !== "1";

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">{c.heading}</h1>
        <Link href="/admin/organisations/new" className="btn btn-primary">
          {c.create}
        </Link>
      </div>
      <p className="text-lg font-semibold">{c.intro}</p>
      {showDemo ? <DemoPanel /> : null}
      {loaded.problem ? (
        <p role="alert" className="panel field-error">
          {copy.common.problem(copy.admin.partProblem(loaded.problem))}
        </p>
      ) : null}
      {problem ? (
        <p role="alert" className="panel field-error">
          {copy.common.problem(problem)}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="panel field-error">
          {copy.common.problem(c.loadError)}
        </p>
      ) : rows.length === 0 ? (
        <p className="panel text-lg font-semibold">{c.none}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-base">
            <thead>
              <tr>
                <th className={th}>{c.columns.name}</th>
                <th className={th}>{c.columns.slug}</th>
                <th className={th}>{c.columns.status}</th>
                <th className={th}>{c.columns.plan}</th>
                <th className={th}>{c.columns.events}</th>
                <th className={th}>{c.columns.last}</th>
                <th className={th}>{c.columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td className={`${td} font-bold`}>
                    {o.name}
                    {isTestData(o.slug) ? (
                      <span className="ml-2 inline-block rounded border-2 border-[#111] px-2 text-sm font-extrabold" title={c.testDataHelp}>
                        <span aria-hidden="true">⚠ </span>
                        {c.testData}
                      </span>
                    ) : null}
                  </td>
                  <td className={td}>/{o.slug}</td>
                  <td className={td}>{o.archived_at ? `⏸ ${c.status[organisationStatus(o.archived_at)]}` : `● ${c.status.active}`}</td>
                  <td className={td}>{o.plan}</td>
                  <td className={td}>{c.eventsCell(o.events_count, o.published_events_count)}</td>
                  <td className={td}>{formatWhen(o.last_activity, defaultTimezone) || c.noActivity}</td>
                  <td className={td}>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/admin/organisations/${o.id}`} className="btn">
                        {c.manage}
                      </Link>
                      <form action={startImpersonation}>
                        <input type="hidden" name="orgId" value={o.id} />
                        <button type="submit" className="btn">
                          {c.openAs}
                        </button>
                      </form>
                      <RowMenu org={{ id: o.id, name: o.name, slug: o.slug, archived: Boolean(o.archived_at), publishedResults: o.published_results_count }} isOwner={role === "owner"} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
