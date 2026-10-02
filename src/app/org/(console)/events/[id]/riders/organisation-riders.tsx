"use client";

import { useMemo, useState } from "react";
import { copy } from "@/lib/ui-copy";
import { addOrganisationRiders } from "./actions";
import { fullName, type EntryRow, type OrgRider } from "./types";
import { useAction } from "./use-action";

const T = copy.riders;

/** "Add from this organisation's riders": a returning rider is ticked, not retyped. */
export function OrganisationRiders({ divisionId, orgRiders, entries }: { divisionId: string; orgRiders: OrgRider[]; entries: EntryRow[] }) {
  const { pending, error, run } = useAction();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const inDivision = useMemo(() => new Set(entries.map((e) => e.riderId)), [entries]);
  const available = orgRiders.filter((r) => !inDivision.has(r.id));
  const shown = available.filter((r) => `${fullName(r)} ${r.email ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <section className="panel flex flex-col gap-3" aria-labelledby="org-riders-h">
      <h2 id="org-riders-h" className="text-xl font-semibold">
        {T.organisationHeading}
      </h2>
      <p className="font-semibold">{T.organisationHelp}</p>
      {available.length === 0 ? (
        <p className="font-semibold">{T.organisationNone}</p>
      ) : (
        <>
          <label htmlFor="org-rider-search" className="font-semibold">
            {T.organisationFilter}
          </label>
          <input id="org-rider-search" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-sm" />
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto" data-testid="org-rider-list">
            {shown.map((r) => (
              <li key={r.id}>
                <label className="flex items-center gap-3 font-semibold">
                  <input
                    type="checkbox"
                    checked={picked.has(r.id)}
                    onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })}
                  />
                  <span className="font-semibold">{fullName(r)}</span>
                  <span>{[r.nationality, r.email].filter(Boolean).join(" · ")}</span>
                </label>
              </li>
            ))}
          </ul>
          {error ? <p role="alert" className="field-error">{copy.common.problem(error)}</p> : null}
          <div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending || picked.size === 0}
              onClick={() => run(() => addOrganisationRiders(divisionId, [...picked]), (r) => T.organisationAdded(r.added), () => setPicked(new Set()))}
            >
              {T.organisationAdd(picked.size)}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
