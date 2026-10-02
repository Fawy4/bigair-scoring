import { stopImpersonation } from "@/app/admin/actions";
import { copy } from "@/lib/ui-copy";

/** While a platform owner is inside an organisation: a slim muted strip, "Viewing as Arrow", and a quiet "Back to admin" link. */
export function ImpersonationBanner({ orgName }: { orgName: string }) {
  return (
    <div role="status" className="no-print sticky top-0 z-40 border-b border-beach-line bg-beach-surface px-4 text-small font-medium text-beach-muted">
      <form action={stopImpersonation} className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3">
        <span>
          {copy.layout.viewingAs} <span className="font-semibold text-beach-ink">{orgName}</span>
        </span>
        <button type="submit" className="min-h-[var(--org-ctl)] rounded-[8px] px-1 font-semibold text-beach-ink underline underline-offset-2 hover:bg-beach-bg">
          {copy.layout.backToAdmin}
        </button>
      </form>
    </div>
  );
}
