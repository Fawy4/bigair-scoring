import Link from "next/link";
import { getPlatformSettings } from "@/lib/platform/public-settings";
import { requireAdmin } from "@/lib/platform/session";
import { knownTimeZones } from "@/lib/schemas/org-settings";
import { copy } from "@/lib/ui-copy";
import { CreateOrganisationForm } from "./create-form";

export const metadata = { title: copy.admin.org.createHeading };

export default async function NewOrganisationPage() {
  await requireAdmin();
  const { defaultTimezone } = await getPlatformSettings();
  return (
    <main className="flex flex-col gap-6">
      <Link href="/admin" className="font-semibold underline">
        {copy.admin.org.backToList}
      </Link>
      <h1>{copy.admin.org.createHeading}</h1>
      <p className="max-w-[70ch] text-body font-medium text-beach-muted">{copy.admin.org.createIntro}</p>
      <CreateOrganisationForm timeZones={knownTimeZones()} defaultTimezone={defaultTimezone} />
    </main>
  );
}
