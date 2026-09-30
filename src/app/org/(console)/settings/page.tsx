import { getOrgContext } from "@/lib/org/context";
import { knownTimeZones } from "@/lib/schemas/org-settings";
import { copy } from "@/lib/ui-copy";
import { SettingsForm } from "./settings-form";

export const metadata = { title: copy.orgSettings.heading };

export default async function SettingsPage() {
  const { current } = await getOrgContext();
  if (!current) return <p className="panel text-lg font-semibold">{copy.orgHome.noOrg}</p>;
  const canEdit = current.role === "owner" || current.role === "admin";
  return (
    <main className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-3xl font-extrabold">{copy.orgSettings.heading}</h1>
      {canEdit ? null : (
        <p className="panel text-lg font-semibold">{copy.orgSettings.readOnly}</p>
      )}
      <SettingsForm
        canEdit={canEdit}
        timeZones={knownTimeZones()}
        initial={{
          id: current.id,
          name: current.name,
          slug: current.slug,
          logoUrl: current.logoUrl,
          defaultTimezone: current.settings.defaultTimezone,
        }}
      />
    </main>
  );
}
