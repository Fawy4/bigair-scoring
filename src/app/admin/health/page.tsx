import { formatWhen } from "@/lib/platform/event-label";
import { getPlatformSettings } from "@/lib/platform/public-settings";
import { checkServerConfig } from "@/lib/platform/config-check";
import { attempt } from "@/lib/platform/safe";
import { requireAdmin } from "@/lib/platform/session";
import { copy } from "@/lib/ui-copy";
import { RealtimeStatus } from "./realtime-status";

export const metadata = { title: copy.admin.health.heading };

export default async function HealthPage() {
  const { supabase } = await requireAdmin();
  const { defaultTimezone } = await getPlatformSettings();
  // expired Reset copies are removed whenever the Health page loads (no scheduled job needed)
  await Promise.resolve(supabase.rpc("purge_expired_reset_snapshots")).catch(() => null);
  const { data, error } = await supabase.rpc("admin_health");
  const config = checkServerConfig(process.env);
  const settingsCheck = await attempt("Platform settings", async () => {
    const { error: e } = await supabase.from("platform_settings").select("key").limit(1);
    if (e) throw new Error(e.message);
    return true;
  }, false);
  const h = data as { database: boolean; checked_at: string; last_publish: string | null; organisations: number; events: number; live_events: number } | null;
  const c = copy.admin.health;
  const up = !error && h?.database === true;

  return (
    <main className="flex max-w-2xl flex-col gap-6">
      <h1>{c.heading}</h1>
      <p className="text-lg font-semibold">{c.intro}</p>
      <ul className="flex flex-col gap-3 text-xl font-semibold">
        <li className="panel">
          <span aria-hidden="true">{up ? "✔ " : "✖ "}</span>
          {up ? c.database : c.databaseDown}
        </li>
        <li className="panel">
          <RealtimeStatus />
        </li>
        <li className="panel">{h?.last_publish ? c.lastPublish(formatWhen(h.last_publish, defaultTimezone)) : c.noPublish}</li>
      </ul>
      {h ? (
        <p className="font-semibold">
          {c.counts(h.organisations, h.events, h.live_events)} · {c.checkedAt(formatWhen(h.checked_at, defaultTimezone))}
        </p>
      ) : (
        <p role="alert" className="panel field-error">
          {copy.common.problem(c.loadError)}
        </p>
      )}
      <section className="flex flex-col gap-3" aria-labelledby="config-h">
        <h2 id="config-h" className="text-2xl font-semibold">
          {c.configHeading}
        </h2>
        <p className="font-semibold">{c.configIntro}</p>
        <ul className="flex flex-col gap-2">
          {config.map((r) => (
            <li key={r.name} className="panel font-semibold">
              <span aria-hidden="true">{r.present ? "✔ " : r.required ? "✖ " : "– "}</span>
              {c.configRow(r.name, r.present ? c.configSet : c.configMissing, r.required ? c.configRequired : c.configOptional, r.needed)}
            </li>
          ))}
          <li className="panel font-semibold">
            <span aria-hidden="true">{settingsCheck.value ? "✔ " : "✖ "}</span>
            {settingsCheck.value ? c.settingsRead : c.settingsUnreadable}
          </li>
        </ul>
      </section>
      <form method="get">
        <button type="submit" className="btn">
          {c.refresh}
        </button>
      </form>
    </main>
  );
}
