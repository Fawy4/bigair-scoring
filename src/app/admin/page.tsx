import Link from "next/link";
import { formatWhen } from "@/lib/platform/event-label";
import { getPlatformSettings } from "@/lib/platform/public-settings";
import { attempt } from "@/lib/platform/safe";
import { requireAdmin } from "@/lib/platform/session";
import { demoOrganisationMissing, listedOrganisations } from "@/lib/platform/organisation";
import { currentReleaseLine } from "@/lib/releases/load";
import { copy } from "@/lib/ui-copy";
import { DemoPanel } from "./demo-panel";
import { Button } from "@/components/org/button";
import { OrganisationsTable } from "./organisations-table";

export const metadata = { title: copy.admin.org.heading };


export default async function AdminOrganisations({ searchParams }: { searchParams: Promise<{ problem?: string; test?: string }> }) {
  const { supabase, role } = await requireAdmin();
  const { problem, test } = await searchParams;
  const showTest = test === "1";
  const { defaultTimezone } = (await attempt("Platform settings", getPlatformSettings, { defaultTimezone: "Africa/Cairo" } as Awaited<ReturnType<typeof getPlatformSettings>>)).value;
  // a failure here (network, database, unexpected data) shows a message on the page instead of crashing it
  const loaded = await attempt("Organisations", async () => await supabase.rpc("admin_organisation_overview"), { data: null, error: { message: "not loaded" } } as unknown as Awaited<ReturnType<typeof supabase.rpc<"admin_organisation_overview">>>);
  const { data, error } = loaded.value;
  // The label lives on the organisation itself; the platform admin may read it (policy admin_read).
  const labels = await attempt("Test labels", async () => await supabase.from("organisations").select("id, is_test"), { data: null, error: { message: "not loaded" } } as never);
  const testIds = new Set(((labels.value as { data: Array<{ id: string; is_test: boolean }> | null }).data ?? []).filter((l) => l.is_test).map((l) => l.id));
  const all = (data ?? []).map((o) => ({ ...o, is_test: testIds.has(o.id) }));
  const rows = listedOrganisations(all, showTest);
  const hiddenCount = all.length - listedOrganisations(all, false).length;
  const release = await currentReleaseLine(supabase);
  const c = copy.admin.org;
  // Only when there is no demo organisation, only for owners, and never where the demo is switched off (a project with a real event).
  const showDemo = role === "owner" && !error && demoOrganisationMissing(all) && process.env.DEMO_SEED_DISABLED !== "1";

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>{c.heading}</h1>
        <Link href="/admin/organisations/new" className="btn btn-primary">
          {c.create}
        </Link>
      </div>
      <p className="max-w-[70ch] text-body font-medium text-beach-muted">{c.intro}</p>
      <p data-testid="release-status" className="text-body font-semibold">
        <Link href="/admin/releases" className="underline">
          {release.line}
        </Link>
      </p>
      {showDemo ? <DemoPanel /> : null}
      {hiddenCount > 0 || showTest ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" href={showTest ? "/admin" : "/admin?test=1"} data-testid="show-test-organisations">
            {showTest ? c.hideTest : c.showTest}
          </Button>
          <span className="text-body font-medium text-beach-muted" data-testid="test-organisations-note">
            {showTest ? c.testShownNote(hiddenCount) : c.testHiddenNote(hiddenCount)}
          </span>
        </div>
      ) : null}
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
      ) : (
        <OrganisationsTable
          isOwner={role === "owner"}
          rows={rows.map((o) => ({
            id: o.id,
            name: o.name,
            slug: o.slug,
            archived: Boolean(o.archived_at),
            plan: o.plan,
            eventsText: c.eventsCell(o.events_count, o.published_events_count),
            lastText: formatWhen(o.last_activity, defaultTimezone) || c.noActivity,
            publishedResults: o.published_results_count,
            testData: o.is_test,
          }))}
        />
      )}
    </main>
  );
}
