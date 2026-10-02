import { auditDetails, auditLabel } from "@/lib/platform/audit";
import { formatWhen } from "@/lib/platform/event-label";
import { getPlatformSettings } from "@/lib/platform/public-settings";
import { requireAdmin } from "@/lib/platform/session";
import { copy } from "@/lib/ui-copy";

export const metadata = { title: copy.admin.audit.heading };

const th = "border border-beach-line bg-beach-surface p-2 text-left";
const td = "border border-beach-line p-2 align-top";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ org?: string; scope?: string }> }) {
  const { supabase } = await requireAdmin();
  const q = await searchParams;
  const org = q.org && /^[0-9a-f-]{36}$/.test(q.org) ? q.org : null;
  const onlyPlatform = q.scope !== "all";
  const { defaultTimezone } = await getPlatformSettings();
  const [{ data: rows }, { data: orgs }] = await Promise.all([
    supabase.rpc("admin_audit_log", { p_limit: 300, p_org: org as string, p_only_platform: onlyPlatform }),
    supabase.rpc("admin_organisation_overview"),
  ]);
  const c = copy.admin.audit;

  return (
    <main className="flex flex-col gap-6">
      <h1>{c.heading}</h1>
      <p className="text-lg font-semibold">{c.intro}</p>
      <form method="get" className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="audit-scope">{c.scopeLabel}</label>
          <select id="audit-scope" name="scope" defaultValue={onlyPlatform ? "platform" : "all"}>
            <option value="platform">{c.scopePlatform}</option>
            <option value="all">{c.scopeAll}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="audit-org">{c.orgLabel}</label>
          <select id="audit-org" name="org" defaultValue={org ?? ""}>
            <option value="">{c.allOrgs}</option>
            {(orgs ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn">
          {c.apply}
        </button>
      </form>
      {(rows ?? []).length === 0 ? (
        <p className="panel text-lg font-semibold">{c.none}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>{c.columns.when}</th>
                <th className={th}>{c.columns.who}</th>
                <th className={th}>{c.columns.action}</th>
                <th className={th}>{c.columns.org}</th>
                <th className={th}>{c.columns.details}</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r) => (
                <tr key={r.id}>
                  <td className={td}>{formatWhen(r.at, defaultTimezone)}</td>
                  <td className={td}>{r.actor_email ?? c.system}</td>
                  <td className={`${td} font-semibold`}>{auditLabel(r.action)}</td>
                  <td className={td}>{r.organisation_name ?? ""}</td>
                  <td className={td}>{auditDetails({ action: r.action, before: r.before as Record<string, unknown> | null, after: r.after as Record<string, unknown> | null, reason: r.reason })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
