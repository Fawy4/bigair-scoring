"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { HelpButton } from "@/components/help-button";
import { Button, disabledWhen } from "@/components/org/button";
import { EmptyState } from "@/components/org/data-table";
import { MenuItem, Popover } from "@/components/org/popover";
import { matchesSearch } from "@/lib/table/search";
import { identifierColumns } from "@/lib/riders/columns";
import { findClashes } from "@/lib/riders/duplicates";
import { newShuffleSeed, shuffleSeeded, sortBySeedNumber } from "@/lib/riders/shuffle";
import type { IdentificationScheme } from "@/lib/schemas/identification";
import { copy, help, orgCopy } from "@/lib/ui-copy";
import { addRider, removeEntries, removeEntry, saveEntry, saveOrder, saveRider, setEntriesStatus } from "./actions";
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
  const [query, setQuery] = useState("");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  useEffect(() => setOptimistic(null), [entries]);

  const cols = identifierColumns(scheme, showAllColumns);
  const toggle = (id: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const rows = useMemo(() => {
    const listed = entries
      .filter((e) => TAKING_PART.has(e.status))
      .sort((a, b) => (a.seed ?? Infinity) - (b.seed ?? Infinity) || a.createdAt.localeCompare(b.createdAt) || fullName(a).localeCompare(fullName(b), "en") || a.id.localeCompare(b.id));
    if (!optimistic) return listed;
    const byId = new Map(listed.map((r) => [r.id, r]));
    return optimistic.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  }, [entries, optimistic]);

  const visible = useMemo(() => rows.filter((r) => matchesSearch(`${fullName(r)} ${r.nationality ?? ""} ${r.email ?? ""} ${r.sponsor ?? ""} ${Object.values(r.identifiers).filter((v) => typeof v === "string" || typeof v === "number").join(" ")}`, query)), [rows, query]);
  const present = new Set(rows.map((r) => r.id));
  const selectedIds = [...ticked].filter((id) => present.has(id));
  const toggleAll = () =>
    setTicked((prev) => {
      const next = new Set(prev);
      const all = visible.length > 0 && visible.every((r) => next.has(r.id));
      for (const r of visible) {
        if (all) next.delete(r.id);
        else next.add(r.id);
      }
      return next;
    });
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
    <div className="flex flex-col gap-4">
      <nav aria-label={T.pickDivision} className="flex flex-wrap gap-2">
        {divisions.map((d) => (
          <Link key={d.id} href={`/org/events/${eventId}/riders?division=${d.id}`} className={`btn ${d.id === selectedId ? "btn-primary" : ""}`} aria-current={d.id === selectedId ? "page" : undefined}>
            {d.name}
          </Link>
        ))}
      </nav>
      <p className="text-body font-medium text-beach-muted" data-testid="scheme-line">
        {T.schemeLine(scheme.name, schemeIsOwn)}
      </p>
      {selected.drawLocked ? <p className="rounded-card border border-beach-line bg-beach-surface px-4 py-2 text-body font-semibold" role="note">{T.drawLocked}</p> : null}

      {error ? (
        <p role="alert" className="flex flex-wrap items-center gap-2 rounded-card border border-beach-failed p-3 text-body font-semibold text-beach-failed">
          {copy.common.problem(error)}
          <Button variant="quiet" onClick={() => setError(null)}>
            {copy.common.dismiss}
          </Button>
        </p>
      ) : null}

      <RegistrationsPanel entries={entries} />

      <section className="flex flex-col gap-2" aria-labelledby="table-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="table-h">{T.count(rows.length, active.length)}</h2>
          <div role="group" aria-label={T.toolsLabel} className="flex flex-wrap items-center gap-1">
            <Button variant="quiet" {...disabledWhen(pending ? copy.common.saving : active.length < 2 && T.needTwo)} onClick={() => shuffle(newShuffleSeed())} data-testid="shuffle">
              {T.shuffle}
            </Button>
            {selected.shuffleSeed ? (
              <Button variant="quiet" {...disabledWhen(pending ? copy.common.saving : active.length < 2 && T.needTwo)} onClick={() => shuffle(selected.shuffleSeed!)} data-testid="shuffle-repeat">
                {T.shuffleAgain}
              </Button>
            ) : null}
            <Button variant="quiet" {...disabledWhen(pending ? copy.common.saving : rows.length < 2 && T.needTwo)} onClick={sortBySeed} data-testid="sort-by-seed">
              {T.sortBySeed}
            </Button>
            <Button variant="quiet" href={`/org/events/${eventId}/riders/print?division=${selected.id}`} target="_blank" data-testid="print-start-list">
              {T.printStartList}
            </Button>
          </div>
        </div>
        <p className="text-body font-medium text-beach-muted">{T.dragHint}</p>
        {selected.shuffleSeed ? <p className="text-body font-medium text-beach-muted" data-testid="shuffle-code">{T.shuffleCode(selected.shuffleSeed)}</p> : null}

        {warnings.length > 0 ? (
          <div className="flex flex-col gap-1 rounded-card border border-beach-outlier p-3" role="note" data-testid="clash-warnings">
            <p className="text-body font-semibold text-beach-outlier">⚠ {T.clash.heading}</p>
            <ul className="list-disc pl-6 text-body font-medium">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <p className="text-small font-medium text-beach-muted">{T.clash.note}</p>
          </div>
        ) : null}

        {rows.length === 0 ? (
          <EmptyState title={T.emptyTitle} body={T.emptyBody} />
        ) : (
          <div className="rounded-card border border-beach-line bg-beach-bg" data-testid="riders-panel">
            <div className="flex flex-wrap items-center gap-2 border-b border-beach-line p-2">
              <label className="relative inline-flex min-w-0 flex-1 basis-56 items-center">
                <Search aria-hidden className="pointer-events-none absolute left-3 size-4 text-beach-muted" />
                <input type="search" aria-label={T.search} placeholder={T.search} value={query} onChange={(e) => setQuery(e.target.value)} data-testid="table-search" className="w-full !pl-9" />
              </label>
              <span className="flex items-center gap-2">
                <label className="flex min-h-[var(--org-ctl)] items-center gap-2 text-body font-semibold">
                  <input type="checkbox" checked={showAllColumns} onChange={(e) => setShowAllColumns(e.target.checked)} />
                  {T.showAllColumns}
                </label>
                <HelpButton what={T.showAllColumns} help={help["riders.showAllColumns"]} />
              </span>
            </div>
            <p aria-live="polite" data-testid="table-count" className="px-3 pt-2 text-small font-medium text-beach-muted">
              {orgCopy.table.showing(visible.length, rows.length)}
              {selectedIds.length > 0 ? ` · ${orgCopy.table.selected(selectedIds.length)}` : ""}
            </p>
            {selectedIds.length > 0 ? (
              <div role="region" aria-label={orgCopy.table.bulkLabel} data-testid="bulk-bar" className="mx-2 mt-2 flex flex-wrap items-center gap-2 rounded-[8px] border border-beach-border bg-beach-surface p-2">
                <span className="px-1 text-body font-semibold">{orgCopy.table.selected(selectedIds.length)}</span>
                {confirmingRemove ? (
                  <>
                    <span className="text-body font-semibold">{T.bulkRemoveQuestion(selectedIds.length)}</span>
                    <Button
                      variant="danger"
                      icon={Trash2}
                      {...disabledWhen(pending && copy.common.saving)}
                      onClick={() => {
                        setConfirmingRemove(false);
                        run(() => removeEntries(selectedIds), (r) => T.bulkRemoved(r.removed), () => setTicked(new Set()));
                      }}
                    >
                      {T.bulkRemoveYes(selectedIds.length)}
                    </Button>
                    <Button variant="quiet" onClick={() => setConfirmingRemove(false)}>
                      {copy.common.cancel}
                    </Button>
                  </>
                ) : (
                  <>
                    <Popover label={T.bulkStatus} panelRole="menu" testId="bulk-status">
                      {(close) =>
                        (["confirmed", "withdrawn", "no_show"] as const).map((st) => (
                          <MenuItem
                            key={st}
                            onClick={() => {
                              close();
                              run(() => setEntriesStatus(selectedIds, st), (r) => T.bulkStatusDone(r.changed));
                            }}
                          >
                            {T.statusOptions[st]}
                          </MenuItem>
                        ))
                      }
                    </Popover>
                    <Button variant="danger" icon={Trash2} onClick={() => setConfirmingRemove(true)}>
                      {T.bulkRemove}
                    </Button>
                  </>
                )}
                <Button variant="quiet" onClick={() => { setTicked(new Set()); setConfirmingRemove(false); }}>
                  {orgCopy.table.clear}
                </Button>
              </div>
            ) : null}
            <div className="mt-2">
              <RidersTable rows={visible} allIds={rows.map((r) => r.id)} selected={ticked} onToggle={toggle} onToggleAll={toggleAll} noMatch={visible.length === 0 ? orgCopy.table.noMatch(query) : null} scheme={scheme} cols={cols} clashesByRider={clashesByRider} handlers={handlers} busy={pending} />
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-card border border-beach-line p-4" aria-labelledby="add-h">
        <h2 id="add-h">
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
              <label htmlFor={`new-${key}`} className="text-small font-semibold">
                {label}
              </label>
              <input id={`new-${key}`} type={type} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
            </div>
          ))}
          <div className="flex items-end">
            <Button type="submit" variant="secondary" {...disabledWhen(pending ? copy.common.saving : (!form.first.trim() || !form.last.trim()) && T.nameRequiredHint)} data-testid="add-rider">
              {T.addRow}
            </Button>
          </div>
        </form>
      </section>

      <CsvImport divisionId={selected.id} scheme={scheme} orgRiders={orgRiders} />
      <OrganisationRiders divisionId={selected.id} orgRiders={orgRiders} entries={entries} />
    </div>
  );
}
