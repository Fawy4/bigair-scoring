"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { HelpButton } from "@/components/help-button";
import { identifierColumns } from "@/lib/riders/columns";
import { findClashes } from "@/lib/riders/duplicates";
import { newShuffleSeed, shuffleSeeded, sortBySeedNumber } from "@/lib/riders/shuffle";
import type { IdentificationScheme } from "@/lib/schemas/identification";
import { copy, help } from "@/lib/ui-copy";
import { addRider, removeEntry, saveEntry, saveOrder, saveRider } from "./actions";
import { CsvImport } from "./csv-import";
import { OrganisationRiders } from "./organisation-riders";
import { RegistrationsPanel } from "./registrations-panel";
import { RidersTable, type TableHandlers } from "./rider-table";
import { fullName, type DivisionInfo, type EntryRow, type OrgRider } from "./types";
import { useAction } from "./use-action";

const T = copy.riders;
const TAKING_PART = new Set(["confirmed", "withdrawn", "no_show"]);

const emptyForm = { first: "", last: "", nationality: "", email: "", phone: "", sponsor: "" };

export function RidersManager({ eventId, divisions, selectedId, scheme, schemeIsOwn, entries, orgRiders }: { eventId: string; divisions: DivisionInfo[]; selectedId: string; scheme: IdentificationScheme; schemeIsOwn: boolean; entries: EntryRow[]; orgRiders: OrgRider[] }) {
  const { pending, error, setError, run } = useAction();
  const selected = divisions.find((d) => d.id === selectedId)!;
  const [showAllColumns, setShowAllColumns] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [optimistic, setOptimistic] = useState<string[] | null>(null);
  useEffect(() => setOptimistic(null), [entries]);

  const cols = identifierColumns(scheme, showAllColumns);
  const rows = useMemo(() => {
    const listed = entries
      .filter((e) => TAKING_PART.has(e.status))
      .sort((a, b) => (a.seed ?? Infinity) - (b.seed ?? Infinity) || a.createdAt.localeCompare(b.createdAt) || fullName(a).localeCompare(fullName(b), "en") || a.id.localeCompare(b.id));
    if (!optimistic) return listed;
    const byId = new Map(listed.map((r) => [r.id, r]));
    return optimistic.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  }, [entries, optimistic]);

  const active = rows.filter((r) => r.status === "confirmed");
  const clashes = useMemo(() => findClashes(scheme, active.map((r) => ({ id: r.id, name: fullName(r), identifiers: r.identifiers }))), [scheme, active]);
  const clashesByRider = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of clashes) for (const id of c.riderIds) m.set(id, [...(m.get(id) ?? []), c.message]);
    return m;
  }, [clashes]);
  const seedWarnings = useMemo(() => {
    const bySeed = new Map<number, string[]>();
    for (const r of active) if (r.seed !== null) bySeed.set(r.seed, [...(bySeed.get(r.seed) ?? []), fullName(r)]);
    return [...bySeed.entries()].filter(([, names]) => names.length > 1).map(([seed, names]) => T.seedRepeated(seed, names.join(", ")));
  }, [active]);
  const warnings = [...clashes.map((c) => c.message), ...seedWarnings];

  const applyOrder = (ids: string[], shuffleSeed: number | null, message: string) => {
    setOptimistic(ids);
    run(() => saveOrder(selected.id, ids, shuffleSeed), message);
  };

  const handlers: TableHandlers = {
    saveRider: (row, patch) => {
      const next = { first: row.first, last: row.last, nationality: row.nationality ?? undefined, email: row.email ?? undefined, phone: row.phone ?? undefined, sponsor: row.sponsor ?? undefined, photoUrl: row.photoUrl ?? undefined, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v ?? undefined])) };
      run(() => saveRider(row.riderId, next), T.saved);
    },
    saveEntry: (row, patch) => run(() => saveEntry(row.id, patch), T.saved),
    remove: (row) => run(() => removeEntry(row.id), T.removed),
    order: (ids) => applyOrder(ids, null, T.orderSaved),
  };

  function shuffle(code: number) {
    const taking = shuffleSeeded(active.map((r) => ({ id: r.id, name: fullName(r) })), code).map((x) => x.id);
    const rest = rows.filter((r) => r.status !== "confirmed").map((r) => r.id);
    applyOrder([...taking, ...rest], code, T.shuffled(code));
  }

  function sortBySeed() {
    const sorted = sortBySeedNumber(rows.map((r) => ({ id: r.id, name: fullName(r), seed: r.seed })));
    applyOrder(sorted.map((r) => r.id), null, T.sortedBySeed);
  }

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label={T.pickDivision} className="flex flex-wrap gap-2">
        {divisions.map((d) => (
          <Link key={d.id} href={`/org/events/${eventId}/riders?division=${d.id}`} className={`btn ${d.id === selectedId ? "btn-primary" : ""}`} aria-current={d.id === selectedId ? "page" : undefined}>
            {d.name}
          </Link>
        ))}
      </nav>
      <p className="font-semibold" data-testid="scheme-line">
        {T.schemeLine(scheme.name, schemeIsOwn)}
      </p>
      {selected.drawLocked ? <p className="panel font-bold" role="note">{T.drawLocked}</p> : null}

      {error ? (
        <p role="alert" className="panel field-error">
          {copy.common.problem(error)}{" "}
          <button type="button" className="btn ml-2" onClick={() => setError(null)}>
            {copy.common.dismiss}
          </button>
        </p>
      ) : null}

      <RegistrationsPanel entries={entries} />

      <section className="flex flex-col gap-3" aria-labelledby="table-h">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="table-h" className="text-2xl font-extrabold">
            {T.count(rows.length, active.length)}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn" disabled={pending || active.length < 2} onClick={() => shuffle(newShuffleSeed())} data-testid="shuffle">
              {T.shuffle}
            </button>
            {selected.shuffleSeed ? (
              <button type="button" className="btn" disabled={pending || active.length < 2} onClick={() => shuffle(selected.shuffleSeed!)} data-testid="shuffle-repeat">
                {T.shuffleAgain}
              </button>
            ) : null}
            <button type="button" className="btn" disabled={pending || rows.length < 2} onClick={sortBySeed} data-testid="sort-by-seed">
              {T.sortBySeed}
            </button>
            <a className="btn" href={`/org/events/${eventId}/riders/print?division=${selected.id}`} target="_blank" rel="noopener noreferrer" data-testid="print-start-list">
              {T.printStartList}
            </a>
          </div>
        </div>
        <p className="font-semibold">{T.dragHint}</p>
        {selected.shuffleSeed ? <p className="font-semibold" data-testid="shuffle-code">{T.shuffleCode(selected.shuffleSeed)}</p> : null}
        <span className="flex items-center gap-2">
          <label className="flex items-center gap-3 font-bold">
            <input type="checkbox" checked={showAllColumns} onChange={(e) => setShowAllColumns(e.target.checked)} />
            {T.showAllColumns}
          </label>
          <HelpButton what={T.showAllColumns} help={help["riders.showAllColumns"]} />
        </span>

        {warnings.length > 0 ? (
          <div className="panel flex flex-col gap-1" role="note" data-testid="clash-warnings">
            <p className="font-extrabold">⚠ {T.clash.heading}</p>
            <ul className="list-disc pl-6 font-semibold">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <p className="text-sm font-semibold">{T.clash.note}</p>
          </div>
        ) : null}

        {rows.length === 0 ? <p className="panel text-lg font-semibold">{T.noRiders}</p> : <RidersTable rows={rows} scheme={scheme} cols={cols} clashesByRider={clashesByRider} handlers={handlers} busy={pending} />}
      </section>

      <section className="panel flex flex-col gap-3" aria-labelledby="add-h">
        <h2 id="add-h" className="text-xl font-extrabold">
          {T.addRowHeading}
        </h2>
        <form
          className="grid gap-3 md:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addRider(selected.id, form), T.added, () => setForm(emptyForm));
          }}
        >
          {(
            [
              ["first", T.columns.first, "text"],
              ["last", T.columns.last, "text"],
              ["nationality", T.columns.nationality, "text"],
              ["email", T.columns.email, "email"],
              ["phone", T.columns.phone, "tel"],
              ["sponsor", T.columns.sponsor, "text"],
            ] as const
          ).map(([key, label, type]) => (
            <div key={key} className="flex flex-col gap-1">
              <label htmlFor={`new-${key}`} className="font-bold">
                {label}
              </label>
              <input id={`new-${key}`} type={type} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
            </div>
          ))}
          <div className="flex items-end">
            <button type="submit" className="btn btn-primary" disabled={pending || !form.first.trim() || !form.last.trim()} data-testid="add-rider">
              {T.addRow}
            </button>
          </div>
        </form>
      </section>

      <CsvImport divisionId={selected.id} scheme={scheme} orgRiders={orgRiders} />
      <OrganisationRiders divisionId={selected.id} orgRiders={orgRiders} entries={entries} />
    </div>
  );
}
