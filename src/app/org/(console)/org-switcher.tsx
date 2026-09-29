"use client";

import { useTransition } from "react";
import { switchOrganisation } from "./actions";

export function OrgSwitcher({ orgs, currentId }: { orgs: { id: string; name: string }[]; currentId: string | null }) {
  const [pending, start] = useTransition();
  if (orgs.length === 0) return null;
  if (orgs.length === 1) return <span className="text-base font-bold">{orgs[0].name}</span>;
  return (
    <label className="flex items-center gap-2 text-sm font-bold">
      Organisation
      <select
        className="px-2"
        value={currentId ?? ""}
        disabled={pending}
        onChange={(e) => start(() => switchOrganisation(e.target.value))}
      >
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
