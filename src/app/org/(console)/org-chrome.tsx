import { ImpersonationBanner } from "@/components/impersonation-banner";
import { OrgFrame } from "@/components/org/org-frame";
import type { ShellEvent } from "@/components/org/app-shell";
import type { RailStep } from "@/components/org/step-rail";
import { getOrgContext } from "@/lib/org/context";
import { getProductName } from "@/lib/platform/public-settings";
import { switchOrganisation } from "./actions";

/** The server half of the organiser frame: finds out who is signed in and which organisation is current, then hands it to the client frame. */
export async function OrgChrome({ children, event, steps }: { children: React.ReactNode; event?: ShellEvent; steps?: readonly RailStep[] }) {
  const { supabase, user, orgs, current, platformRole, impersonating } = await getOrgContext();
  const { data: passwordIsSet } = await supabase.rpc("has_password");
  const productName = await getProductName();
  return (
    <OrgFrame
      productName={productName}
      email={user.email ?? ""}
      passwordIsSet={Boolean(passwordIsSet)}
      organisations={orgs.map((o) => ({ id: o.id, name: o.name }))}
      currentOrganisationId={current?.id ?? null}
      isPlatformAdmin={Boolean(platformRole)}
      banner={impersonating ? <ImpersonationBanner orgName={impersonating.name} /> : null}
      switchOrganisation={switchOrganisation}
      signOutAction="/auth/signout"
      event={event}
      steps={steps}
    >
      {children}
    </OrgFrame>
  );
}
