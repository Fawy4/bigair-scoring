import Link from "next/link";
import { copy } from "@/lib/ui-copy";

/**
 * "Sendbook admin ↔ Organiser view (Arrow)". Shown only to platform admins, in both headers. The current side is a bold label,
 * the other side is the link (never colour alone).
 */
export function AdminSwitch({ product, orgName, active }: { product: string; orgName: string | null; active: "admin" | "organiser" }) {
  const adminLabel = copy.layout.productAdmin(product);
  const orgLabel = orgName ? copy.layout.organiserView(orgName) : copy.layout.organiserViewNoOrg;
  return (
    <div role="group" aria-label={copy.layout.switchLabel} className="flex flex-wrap items-center gap-2 rounded-md border-2 border-[#111] p-1">
      {active === "admin" ? (
        <span aria-current="page" className="rounded bg-[#111] px-3 py-2 text-sm font-extrabold text-white">
          {adminLabel}
        </span>
      ) : (
        <Link href="/admin" className="rounded px-3 py-2 text-sm font-bold underline">
          {adminLabel}
        </Link>
      )}
      <span aria-hidden="true" className="font-extrabold">
        ↔
      </span>
      {active === "organiser" ? (
        <span aria-current="page" className="rounded bg-[#111] px-3 py-2 text-sm font-extrabold text-white">
          {orgLabel}
        </span>
      ) : (
        <Link href="/org" className="rounded px-3 py-2 text-sm font-bold underline">
          {orgLabel}
        </Link>
      )}
    </div>
  );
}
