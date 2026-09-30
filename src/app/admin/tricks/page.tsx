import { requireAdmin } from "@/lib/platform/session";
import { copy } from "@/lib/ui-copy";
import { ProposalsTable } from "./proposals-table";

export const metadata = { title: copy.trickBase.admin.heading };
export const dynamic = "force-dynamic";

/** Blocks that events added to their own trick base and proposed to the master base. */
export default async function TrickProposalsPage() {
  const { supabase, role } = await requireAdmin();
  const { data } = await supabase.rpc("admin_trick_proposals");
  const T = copy.trickBase.admin;
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-3xl font-extrabold">{T.heading}</h1>
      <p className="max-w-3xl text-lg font-semibold">{T.intro}</p>
      {(data ?? []).length === 0 ? (
        <p className="panel font-semibold" data-testid="no-proposals">
          {T.none}
        </p>
      ) : (
        <ProposalsTable
          isOwner={role === "owner"}
          rows={(data ?? []).map((p) => ({ eventId: p.event_id, eventName: p.event_name, organisationName: p.organisation_name, family: p.family, key: p.key, label: p.label }))}
        />
      )}
    </main>
  );
}
