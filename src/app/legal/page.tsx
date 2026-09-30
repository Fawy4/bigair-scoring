import Link from "next/link";
import { getPlatformSettings } from "@/lib/platform/public-settings";
import { copy } from "@/lib/ui-copy";

export const dynamic = "force-dynamic";
export const metadata = { title: copy.publicSite.legalHeading };

/** Terms and privacy text, exactly as the platform owner wrote it in the platform settings. */
export default async function LegalPage() {
  const { legalTexts } = await getPlatformSettings();
  const c = copy.publicSite;
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-4 text-[#111]">
      <Link href="/" className="pt-4 font-bold underline">
        ← {c.backHome}
      </Link>
      <h1 className="text-3xl font-extrabold">{c.legalHeading}</h1>
      {!legalTexts.terms && !legalTexts.privacy ? <p className="text-lg font-semibold">{c.legalNone}</p> : null}
      {legalTexts.terms ? (
        <section>
          <h2 className="text-2xl font-extrabold">{c.termsHeading}</h2>
          <p className="mt-2 whitespace-pre-wrap text-lg">{legalTexts.terms}</p>
        </section>
      ) : null}
      {legalTexts.privacy ? (
        <section>
          <h2 className="text-2xl font-extrabold">{c.privacyHeading}</h2>
          <p className="mt-2 whitespace-pre-wrap text-lg">{legalTexts.privacy}</p>
        </section>
      ) : null}
    </main>
  );
}
