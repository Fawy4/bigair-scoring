import { formatWhen } from "@/lib/platform/event-label";
import { getPlatformSettings } from "@/lib/platform/public-settings";
import { requireAdmin } from "@/lib/platform/session";
import { copy } from "@/lib/ui-copy";
import { RealtimeStatus } from "./realtime-status";

export const metadata = { title: copy.admin.health.heading };

export default async function HealthPage() {
  const { supabase } = await requireAdmin();
  const { defaultTimezone } = await getPlatformSettings();
  const { data, error } = await supabase.rpc("admin_health");
  const h = data as { database: boolean; checked_at: string; last_publish: string | null; organisations: number; events: number; live_events: number } | null;
  const c = copy.admin.health;
  const up = !error && h?.database === true;

  return (
    <main className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-3xl font-extrabold">{c.heading}</h1>
      <p className="text-lg font-semibold">{c.intro}</p>
      <ul className="flex flex-col gap-3 text-xl font-bold">
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
      <form method="get">
        <button type="submit" className="btn">
          {c.refresh}
        </button>
      </form>
    </main>
  );
}
