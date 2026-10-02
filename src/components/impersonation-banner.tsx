import { stopImpersonation } from "@/app/admin/actions";
import { copy } from "@/lib/ui-copy";

/** Persistent banner on every organiser screen while an admin is inside an organisation: "Viewing as Arrow — back to Sendbook admin". */
export function ImpersonationBanner({ orgName, product }: { orgName: string; product: string }) {
  return (
    <div role="status" className="no-print sticky top-0 z-40 border-b-4 border-[#111] bg-[#ffd400] px-4 py-3 text-[#111]">
      <form action={stopImpersonation} className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-2 text-lg font-extrabold">
        <span>
          {copy.layout.viewingAs} {orgName} —{" "}
        </span>
        <button type="submit" className="btn !min-h-[var(--org-ctl)] !border-[#111] !bg-white underline">
          {copy.layout.backToAdmin(product)}
        </button>
      </form>
    </div>
  );
}
