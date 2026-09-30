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
    <main className="flex max-w-2xl flex-col gap-6">
      <Link href="/admin" className="font-bold underline">
        {copy.admin.org.backToList}
      </Link>
      <h1 className="text-3xl font-extrabold">{copy.admin.org.createHeading}</h1>
      <p className="text-lg font-semibold">{copy.admin.org.createIntro}</p>
      <CreateOrganisationForm timeZones={knownTimeZones()} defaultTimezone={defaultTimezone} />
    </main>
  );
}
