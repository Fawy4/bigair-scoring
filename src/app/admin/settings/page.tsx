import { PRODUCT_NAME } from "@/lib/product";
import { resolvePlatformSettings } from "@/lib/platform/settings";
import { requireAdmin } from "@/lib/platform/session";
import { knownTimeZones } from "@/lib/schemas/org-settings";
import { copy } from "@/lib/ui-copy";
import { SettingsForm } from "./settings-form";

export const metadata = { title: copy.admin.settings.heading };

export default async function PlatformSettingsPage() {
  const { supabase, role } = await requireAdmin();
  const { data } = await supabase.from("platform_settings").select("key, value");
  // the stored values themselves (not the fallbacks), so an empty product name stays empty in the form
  const stored = resolvePlatformSettings(data ?? [], { productName: "", timezone: process.env.NEXT_PUBLIC_DEFAULT_TZ || "Africa/Cairo" });
  return (
    <main className="flex min-w-0 flex-col gap-4">
      <h1 className="text-[20px] font-semibold leading-tight">{copy.admin.settings.heading}</h1>
      <p className="max-w-[70ch] text-body font-medium text-beach-muted">{copy.admin.settings.intro}</p>
      {role === "owner" ? null : <p className="rounded-card border border-beach-line p-4 text-body font-semibold">{copy.admin.ownerOnly}</p>}
      <SettingsForm canEdit={role === "owner"} timeZones={knownTimeZones()} builtInName={PRODUCT_NAME} initial={stored} />
    </main>
  );
}
