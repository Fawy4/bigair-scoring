"use client";

import { useState } from "react";
import { Ban, Check, Trash2 } from "lucide-react";
import { Pill } from "@/components/live/pill";
import { Button, disabledWhen } from "@/components/org/button";
import { DataTable, EmptyState, InlineCell, type DataColumn } from "@/components/org/data-table";
import { useShellLayout } from "@/components/org/layout-context";
import { copy } from "@/lib/ui-copy";
import { deleteSeats, setSeatsActive, updateSeat } from "./actions";
import { seenText, type SeatRow } from "./seat-card";
import type { useAction } from "../riders/use-action";

const T = copy.officials;

/** The team at a glance: the preview's dense table (search, tick boxes with a bulk bar, inline rename). The PIN, panel and spotter tools stay on each seat's card below. */
export function OfficialsTable({ seats, now, act }: { seats: SeatRow[]; now: Date; act: ReturnType<typeof useAction> }) {
  const phone = useShellLayout() === "phone";
  const { pending, run } = act;
  const [confirming, setConfirming] = useState(false);

  const name: DataColumn<SeatRow> = {
    id: "name",
    header: T.colName,
    render: (s) => <InlineCell value={s.name} label={T.editName(s.name)} onSave={(v) => v && run(() => updateSeat(s.id, { name: v }), copy.officials.saved)} />,
  };
  const role: DataColumn<SeatRow> = { id: "role", header: T.colRole, render: (s) => T.roles[s.role] ?? s.role };
  const status: DataColumn<SeatRow> = {
    id: "status",
    header: T.colStatus,
    render: (s) => (
      <Pill icon={s.active ? Check : Ban} tone={s.active ? "live" : "missing"} dashed={!s.active}>
        {s.active ? T.statusActive : T.statusOff}
      </Pill>
    ),
  };
  const seen: DataColumn<SeatRow> = { id: "seen", header: T.colSeen, render: (s) => seenText(s, now) };
  const open: DataColumn<SeatRow> = {
    id: "details",
    header: "",
    render: (s) => (
      <a href={`#seat-${s.id}`} aria-label={T.detailsFor(s.name)} className="inline-flex min-h-[var(--org-row)] items-center px-2 text-body font-semibold underline">
        {T.details}
      </a>
    ),
  };

  return (
    <DataTable
      testId="officials-table"
      caption={T.tableCaption}
      rows={seats}
      getId={(s) => s.id}
      rowLabel={(s) => s.name}
      searchLabel={T.search}
      searchText={(s) => `${s.name} ${T.roles[s.role] ?? s.role} ${s.active ? T.statusActive : T.statusOff}`}
      columns={phone ? [name, status, open] : [name, role, status, seen, open]}
      maxHeight="420px"
      empty={<EmptyState title={T.emptyTitle} body={T.emptyBody} />}
      bulk={({ ids, clear }) =>
        confirming ? (
          <>
            <span className="text-body font-semibold">{T.bulkDeleteQuestion(ids.length)}</span>
            <Button
              variant="danger"
              icon={Trash2}
              {...disabledWhen(pending && copy.common.saving)}
              onClick={() => {
                setConfirming(false);
                run(() => deleteSeats(ids), copy.officials.deleted, clear);
              }}
            >
              {T.bulkDeleteYes(ids.length)}
            </Button>
            <Button variant="quiet" onClick={() => setConfirming(false)}>
              {copy.common.cancel}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" {...disabledWhen(pending && copy.common.saving)} onClick={() => run(() => setSeatsActive(ids, true), copy.officials.saved)}>
              {T.bulkOn}
            </Button>
            <Button variant="secondary" {...disabledWhen(pending && copy.common.saving)} onClick={() => run(() => setSeatsActive(ids, false), copy.officials.saved)}>
              {T.bulkOff}
            </Button>
            <Button variant="danger" icon={Trash2} onClick={() => setConfirming(true)}>
              {T.bulkDelete}
            </Button>
          </>
        )
      }
    />
  );
}
