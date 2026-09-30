"use client";

import { useTransition } from "react";
import { copy } from "@/lib/ui-copy";
import { switchOrganisation } from "./actions";

interface Org {
  id: string;
  name: string;
  logoUrl: string | null;
}

/**
 * One organisation: just its name. Two or more: a switcher with the current organisation's logo, so it is obvious whose data is on screen.
 * (Only people who belong to several organisations see the switcher.)
 */
export function OrgSwitcher({ orgs, currentId }: { orgs: Org[]; currentId: string | null }) {
  const [pending, start] = useTransition();
  if (orgs.length === 0) return null;
  if (orgs.length === 1) return <span className="text-base font-bold">{orgs[0].name}</span>;
  const current = orgs.find((o) => o.id === currentId) ?? orgs[0];
  return (
    <div className="flex items-center gap-2">
      {current.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={current.logoUrl} alt={copy.publicSite.logoAlt(current.name)} className="h-10 max-w-[7rem] rounded border-2 border-[#111] bg-white object-contain p-0.5" />
      ) : null}
      <label className="flex items-center gap-2 text-sm font-bold">
        {copy.layout.organisation}
        <select className="px-2" value={current.id} disabled={pending} onChange={(e) => start(() => switchOrganisation(e.target.value))}>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
