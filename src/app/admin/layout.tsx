import Link from "next/link";
import { AdminSwitch } from "@/components/admin-switch";
import { Toaster } from "@/components/ui/toaster";
import { getOrgContext } from "@/lib/org/context";
import { getProductName } from "@/lib/platform/public-settings";
import { requireAdmin } from "@/lib/platform/session";
import { copy } from "@/lib/ui-copy";
import { AdminNav } from "./admin-nav";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: copy.admin.metaTitle(await getProductName()), robots: { index: false, follow: false } };
}

/** Shell for every /admin screen. requireAdmin() answers 404 to anybody who is not a platform admin. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, role } = await requireAdmin();
  const { current } = await getOrgContext();
  const product = await getProductName();
  return (
    <div className="org-console flex min-h-screen flex-col">
      <header className="border-b-2 border-[#111] bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/admin" className="text-xl font-extrabold">
            {copy.layout.productAdmin(product)}
          </Link>
          <AdminNav />
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <AdminSwitch product={product} orgName={current?.name ?? null} active="admin" />
            <span className="hidden text-sm font-semibold sm:inline">
              {user.email} · {copy.admin.roles[role]}
            </span>
            <form action="/auth/signout" method="post">
              <button type="submit" className="btn">
                {copy.layout.signOut}
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</div>
      <footer className="border-t-2 border-[#111] px-4 py-4 text-center text-sm font-semibold">{product}</footer>
      <Toaster />
    </div>
  );
}
