import Link from "next/link";
import { Toaster } from "@/components/ui/toaster";
import { getOrgContext } from "@/lib/org/context";
import { PRODUCT_NAME } from "@/lib/product";
import { copy } from "@/lib/ui-copy";
import { OrgSwitcher } from "./org-switcher";

export const dynamic = "force-dynamic";

/** Shell for every organiser screen: header (product name, organisation switcher), footer, beach contrast, Toaster. */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { user, orgs, current } = await getOrgContext();
  return (
    <div className="org-console flex min-h-screen flex-col">
      <header className="border-b-2 border-[#111] bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/org" className="text-xl font-extrabold">
            {PRODUCT_NAME}
          </Link>
          <nav aria-label={copy.layout.navLabel} className="flex flex-wrap items-center gap-2">
            <Link href="/org" className="btn">
              {copy.layout.events}
            </Link>
            <Link href="/org/settings" className="btn">
              {copy.layout.settings}
            </Link>
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <OrgSwitcher orgs={orgs.map((o) => ({ id: o.id, name: o.name }))} currentId={current?.id ?? null} />
            <span className="hidden text-sm font-semibold sm:inline">{user.email}</span>
            <Link href="/org/set-password" className="btn">
              {copy.layout.setPassword}
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
      <footer className="border-t-2 border-[#111] px-4 py-4 text-center text-sm font-semibold">{PRODUCT_NAME}</footer>
      <Toaster />
    </div>
  );
}
