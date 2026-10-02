import { OrgFrame } from "@/components/org/org-frame";
import { RefusalLinks } from "@/components/manual/refusal-links";
import { Toaster } from "@/components/ui/toaster";
import { getOrgContext } from "@/lib/org/context";
import { getProductName } from "@/lib/platform/public-settings";
import { attempt } from "@/lib/platform/safe";
import { requireAdmin } from "@/lib/platform/session";
import { copy } from "@/lib/ui-copy";
import { switchOrganisation } from "@/app/org/(console)/actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: copy.admin.metaTitle(await getProductName()), robots: { index: false, follow: false } };
}

const N = copy.admin.nav;
const PLACES = [
  { href: "/admin", label: N.organisations, prefixes: ["/admin/organisations"] },
  { href: "/admin/presets", label: N.presets, prefixes: ["/admin/presets"] },
  { href: "/admin/tricks", label: N.tricks, prefixes: ["/admin/tricks"] },
  { href: "/admin/feedback", label: N.feedback, prefixes: ["/admin/feedback"] },
  { href: "/admin/audit", label: N.audit, prefixes: ["/admin/audit"] },
  { href: "/admin/health", label: N.health, prefixes: ["/admin/health"] },
  { href: "/admin/settings", label: N.settings, prefixes: ["/admin/settings"] },
];

/** Shell for every /admin screen: the same top bar and left rail as the organiser's. requireAdmin() answers 404 to anybody who is not a platform admin. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, role } = await requireAdmin();
  // the frame must never take the whole page down: without the organisation name the switch simply says "Organiser view"
  const { value: current } = await attempt("Organisation for the header switch", async () => (await getOrgContext()).current, null);
  const product = (await attempt("Product name", getProductName, "")).value || "Admin";
  return (
    <>
      <OrgFrame
        productName={copy.layout.productAdmin(product)}
        email={`${user.email ?? ""} · ${copy.admin.roles[role]}`}
        passwordIsSet={false}
        organisations={[]}
        currentOrganisationId={null}
        isPlatformAdmin
        switchOrganisation={switchOrganisation}
        signOutAction="/auth/signout"
        admin={{
          places: PLACES.map((p) => ({ ...p, prefixes: p.href === "/admin" ? ["/admin", ...p.prefixes] : p.prefixes })),
          organiserLabel: current ? copy.layout.organiserView(current.name) : copy.layout.organiserViewNoOrg,
          roleLabel: copy.admin.roles[role],
        }}
      >
        {children}
      </OrgFrame>
      <Toaster />
      <RefusalLinks />
    </>
  );
}
