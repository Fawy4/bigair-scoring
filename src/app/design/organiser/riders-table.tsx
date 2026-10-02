"use client";

import { useState } from "react";
import { Ban, Check, Clock, Trash2 } from "lucide-react";
import { Button } from "@/components/org/button";
import { DataTable, EmptyState, InlineCell, type DataColumn } from "@/components/org/data-table";
import { useShellLayout } from "@/components/org/layout-context";
import { MenuItem, Popover } from "@/components/org/popover";
import { Pill } from "@/components/live/pill";
import { DIVISIONS, RIDERS, type PreviewRider, type RiderStatus } from "@/lib/org-design/fixtures";
import { orgCopy } from "@/lib/ui-copy";

const divisionName = (id: string) => DIVISIONS.find((d) => d.id === id)?.name ?? id;

/** A rider's status as a pill: an icon and a word. */
function RiderStatusPill({ status }: { status: RiderStatus }) {
  const look = { confirmed: { icon: Check, tone: "live" as const }, waiting: { icon: Clock, tone: "pending" as const }, withdrawn: { icon: Ban, tone: "missing" as const } }[status];
  return (
    <Pill icon={look.icon} tone={look.tone} dashed={status === "withdrawn"}>
      {orgCopy.rider[status]}
    </Pill>
  );
}

/** The Riders table of the preview: the real DataTable with 18 made-up riders. Edits, status changes, moves and deletes stay on this page. */
export function RidersTable({ maxHeight, initialSelected, editingId }: { maxHeight?: string; initialSelected?: string[]; editingId?: string }) {
  const phone = useShellLayout() === "phone";
  const [rows, setRows] = useState<PreviewRider[]>(() => RIDERS.map((r) => ({ ...r })));
  const [confirming, setConfirming] = useState(false);
  const patch = (id: string, change: Partial<PreviewRider>) => setRows((all) => all.map((r) => (r.id === id ? { ...r, ...change } : r)));

  const name: DataColumn<PreviewRider> = {
    id: "name",
    header: orgCopy.riders.colName,
    render: (r) => <InlineCell value={r.name} label={orgCopy.riders.editName(r.name)} startEditing={r.id === editingId} onSave={(v) => v && patch(r.id, { name: v })} />,
  };
  const bib: DataColumn<PreviewRider> = { id: "bib", header: orgCopy.riders.colBib, align: "end", render: (r) => r.bib };
  const status: DataColumn<PreviewRider> = { id: "status", header: orgCopy.riders.colStatus, render: (r) => <RiderStatusPill status={r.status} /> };
  const columns: DataColumn<PreviewRider>[] = phone
    ? [name, status]
    : [
        bib,
        name,
        { id: "country", header: orgCopy.riders.colCountry, render: (r) => r.country },
        { id: "division", header: orgCopy.riders.colDivision, render: (r) => divisionName(r.divisionId) },
        { id: "kite", header: orgCopy.riders.colKite, align: "end", render: (r) => <InlineCell align="end" numeric value={String(r.kite)} label={orgCopy.riders.editKite(r.name)} onSave={(v) => Number(v) > 0 && patch(r.id, { kite: Number(v) })} /> },
        status,
      ];

  return (
    <DataTable
      testId="riders-table"
      caption={orgCopy.riders.caption}
      rows={rows}
      getId={(r) => r.id}
      rowLabel={(r) => r.name}
      searchLabel={orgCopy.riders.search}
      searchText={(r) => `${r.name} ${r.country} ${r.bib} ${divisionName(r.divisionId)} ${orgCopy.rider[r.status]}`}
      columns={columns}
      maxHeight={maxHeight}
      initialSelected={initialSelected}
      filters={[
        { id: "division", label: orgCopy.riders.divisionFilter, options: DIVISIONS.map((d) => ({ id: d.id, label: d.name })), test: (r, id) => r.divisionId === id },
        { id: "status", label: orgCopy.riders.statusFilter, options: (["confirmed", "waiting", "withdrawn"] as const).map((s) => ({ id: s, label: orgCopy.rider[s] })), test: (r, id) => r.status === id },
      ]}
      bulk={({ ids, clear }) =>
        confirming ? (
          <>
            <span className="text-body font-semibold">{orgCopy.riders.deleteQuestion(ids.length)}</span>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={() => {
                setRows((all) => all.filter((r) => !ids.includes(r.id)));
                setConfirming(false);
                clear();
              }}
            >
              {orgCopy.riders.deleteYes(ids.length)}
            </Button>
            <Button variant="quiet" onClick={() => setConfirming(false)}>
              {orgCopy.riders.cancel}
            </Button>
          </>
        ) : (
          <>
            <Popover label={orgCopy.riders.setStatus} panelRole="menu">
              {(close) =>
                (["confirmed", "waiting", "withdrawn"] as const).map((s) => (
                  <MenuItem
                    key={s}
                    onClick={() => {
                      setRows((all) => all.map((r) => (ids.includes(r.id) ? { ...r, status: s } : r)));
                      close();
                    }}
                  >
                    {orgCopy.rider[s]}
                  </MenuItem>
                ))
              }
            </Popover>
            <Popover label={orgCopy.riders.moveTo} panelRole="menu">
              {(close) =>
                DIVISIONS.map((d) => (
                  <MenuItem
                    key={d.id}
                    onClick={() => {
                      setRows((all) => all.map((r) => (ids.includes(r.id) ? { ...r, divisionId: d.id } : r)));
                      close();
                    }}
                  >
                    {d.name}
                  </MenuItem>
                ))
              }
            </Popover>
            <Button variant="danger" icon={Trash2} onClick={() => setConfirming(true)}>
              {orgCopy.riders.delete}
            </Button>
          </>
        )
      }
    />
  );
}

/** What an empty division says: what is missing and what to do next. */
export function EmptyRiders() {
  return (
    <EmptyState
      title={orgCopy.riders.emptyTitle}
      body={orgCopy.riders.emptyBody}
      actions={
        <>
          <Button variant="secondary">{orgCopy.riders.addRider}</Button>
          <Button variant="secondary">{orgCopy.riders.pasteList}</Button>
          <Button variant="quiet">{orgCopy.riders.openRegistrations}</Button>
        </>
      }
    />
  );
}
