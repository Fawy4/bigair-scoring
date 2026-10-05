import { SiteFooter, Wordmark } from "@/components/home/site-chrome";
import { getPlatformSettings } from "@/lib/platform/public-settings";
import { copy } from "@/lib/ui-copy";
import { LinkSignIn } from "./link-sign-in";

export const metadata = { title: copy.login.title };

/** Where the e-mailed sign-in link lands. It signs the person in and sends them on; nothing else to do. */
export default async function AuthLinkPage() {
  const productName = (await getPlatformSettings()).productName;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-4 text-beach-ink">
      <Wordmark name={productName} className="self-start text-body font-extrabold tracking-tight text-beach-ink" />
      <LinkSignIn />
      <SiteFooter variant="beach" />
    </main>
  );
}
