import Link from "next/link";
import { Toaster } from "@/components/ui/toaster";
import { AdminSwitch } from "@/components/admin-switch";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { getOrgContext } from "@/lib/org/context";
import { getProductName } from "@/lib/platform/public-settings";
import { copy } from "@/lib/ui-copy";
import { OrgSwitcher } from "./org-switcher";

export const dynamic = "force-dynamic";

/** Shell for every organiser screen: header (product name, organisation switcher), footer, beach contrast, Toaster. */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, orgs, current, platformRole, impersonating } = await getOrgContext();
  const { data: passwordIsSet } = await supabase.rpc("has_password");
  const productName = await getProductName();
  return (
    <div className="org-console flex min-h-screen flex-col">
      {impersonating ? <ImpersonationBanner orgName={impersonating.name} product={productName} /> : null}
      <header className="border-b-2 border-[#111] bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/org" className="text-xl font-extrabold">
            {productName}
          </Link>
          <nav aria-label={copy.layout.navLabel} className="flex flex-wrap items-center gap-2">
            <Link href="/org" className="btn">
              {copy.layout.events}
            </Link>
            <Link href="/org/settings" className="btn">
              {copy.layout.settings}
            </Link>
            <Link href="/org/feedback" className="btn">
              {copy.layout.feedback}
            </Link>
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {platformRole ? <AdminSwitch product={productName} orgName={current?.name ?? null} active="organiser" /> : null}
            <OrgSwitcher orgs={orgs.map((o) => ({ id: o.id, name: o.name, logoUrl: o.logoUrl }))} currentId={current?.id ?? null} />
            <span className="hidden text-sm font-semibold sm:inline">{user.email}</span>
            <Link href="/org/set-password" className="btn">
              {passwordIsSet ? copy.layout.changePassword : copy.layout.setPassword}
            </Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className="btn">
                {copy.layout.signOut}
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</div>
      <footer className="border-t-2 border-[#111] px-4 py-4 text-center text-sm font-semibold">{productName}</footer>
      <Toaster />
    </div>
  );
}
