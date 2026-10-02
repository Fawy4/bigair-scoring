"use client";

import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { Button, disabledWhen } from "@/components/org/button";
import { NumberField } from "@/components/org/number-field";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { RiderLabel } from "@/components/rider-label";
import { tableLabel } from "@/lib/identification/effective";
import type { IdentificationScheme } from "@/lib/schemas/identification";
import type { IdentifierColumns } from "@/lib/riders/columns";
import { withIdentifier } from "@/lib/riders/identifiers";
import { moveRow } from "@/lib/riders/shuffle";
import { copy, orgCopy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";
import { fullName, type EntryRow } from "./types";

const C = copy.riders.columns;
const th = "sticky top-0 z-10 h-[var(--org-row)] whitespace-nowrap bg-beach-surface px-2 text-left align-middle text-small font-semibold text-beach-muted [box-shadow:inset_0_-1px_0_var(--beach-line)]";
const td = "px-2 py-1 align-middle [box-shadow:inset_0_-1px_0_var(--beach-line)]";
const input = "w-full min-w-[6rem] border-transparent bg-transparent hover:border-beach-border focus:border-beach-accent";

/** A cell that saves when the person leaves it (or presses Enter), and only when the value really changed. */
function Cell({ value, label, onCommit, width, inputMode }: { value: string; label: string; onCommit: (v: string) => void; width?: string; inputMode?: "numeric" | "decimal" | "email" | "tel" }) {
  return (
    <input
      key={value}
      aria-label={label}
      defaultValue={value}
      inputMode={inputMode}
      className={`${input} ${width ?? ""}`}
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (v !== value) onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export interface TableHandlers {
  saveRider: (row: EntryRow, patch: Partial<Pick<EntryRow, "first" | "last" | "nationality" | "email" | "phone" | "sponsor" | "photoUrl">>) => void;
  saveEntry: (row: EntryRow, patch: { seed?: number | null; status?: "confirmed" | "withdrawn" | "no_show"; identifiers?: EntryRow["identifiers"] }) => void;
  remove: (row: EntryRow) => void;
  order: (ids: string[]) => void;
}

function Row({ row, selected, onToggle, scheme, cols, clashes, handlers, busy, ids }: { row: EntryRow; selected: boolean; onToggle: () => void; scheme: IdentificationScheme; cols: IdentifierColumns; clashes: string[]; handlers: TableHandlers; busy: boolean; ids: string[] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const [asking, setAsking] = useState(false);
  const name = fullName(row);
  const fullIndex = ids.indexOf(row.id);
  const inactive = row.status !== "confirmed";
  const model = tableLabel(scheme, { name, nationality: row.nationality, sponsor: row.sponsor, photoUrl: row.photoLink, identifiers: row.identifiers });
  const patchRider = (p: Parameters<TableHandlers["saveRider"]>[1]) => handlers.saveRider(row, p);
  const setIdentifier = (field: Parameters<typeof withIdentifier>[1], v: string) => handlers.saveEntry(row, { identifiers: withIdentifier(row.identifiers, field, v) });
  const palette = scheme.palette;

  return (
    <tr ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, position: "relative", zIndex: isDragging ? 5 : undefined, background: isDragging ? "var(--beach-tint-grade0)" : undefined }} data-testid="rider-row" data-selected={selected || undefined} className={cn(inactive && "opacity-70", selected && "bg-beach-surface")}>
      <td className="w-[var(--org-row)] p-0 [box-shadow:inset_0_-1px_0_var(--beach-line)]">
        <label className="flex h-[var(--org-row)] w-[var(--org-row)] items-center justify-center">
          <input type="checkbox" aria-label={orgCopy.table.selectRow(name)} checked={selected} onChange={onToggle} />
        </label>
      </td>
      <td className={td}>
        <div className="flex items-center gap-1">
          <Button variant="quiet" iconOnly icon={GripVertical} aria-label={copy.riders.drag(name)} {...attributes} {...listeners} />
          <Button variant="quiet" iconOnly icon={ArrowUp} aria-label={copy.riders.moveUp(name)} {...disabledWhen(busy ? copy.common.saving : fullIndex === 0 && copy.riders.firstRow)} onClick={() => handlers.order(moveRow(ids, fullIndex, fullIndex - 1))} />
          <Button variant="quiet" iconOnly icon={ArrowDown} aria-label={copy.riders.moveDown(name)} {...disabledWhen(busy ? copy.common.saving : fullIndex === ids.length - 1 && copy.riders.lastRow)} onClick={() => handlers.order(moveRow(ids, fullIndex, fullIndex + 1))} />
        </div>
      </td>
      <td className={td}>
        <NumberField
          label={`${C.seed}: ${name}`}
          min={1}
          max={999}
          commit="blur"
          value={row.seed ?? null}
          onChange={(n) => handlers.saveEntry(row, { seed: Number.isInteger(n) && n >= 1 ? n : null })}
          onClear={() => handlers.saveEntry(row, { seed: null })}
        />
      </td>
      <td className={td} data-testid="rider-label-cell">
        <div className="flex flex-col gap-1">
          <RiderLabel scheme={scheme} rider={{ name }} model={model} size="sm" />
          {clashes.length > 0 ? (
            <span className="text-sm font-semibold" role="note">
              ⚠ {copy.riders.clash.heading}
            </span>
          ) : null}
        </div>
      </td>
      <td className={td}>
        <Cell value={row.first} label={`${C.first}: ${name}`} onCommit={(v) => patchRider({ first: v })} />
      </td>
      <td className={td}>
        <Cell value={row.last} label={`${C.last}: ${name}`} onCommit={(v) => patchRider({ last: v })} />
      </td>
      <td className={td}>
        <Cell value={row.nationality ?? ""} label={`${C.nationality}: ${name}`} width="!min-w-[4rem] w-24" onCommit={(v) => patchRider({ nationality: v || null })} />
      </td>
      <td className={td}>
        <Cell value={row.email ?? ""} label={`${C.email}: ${name}`} inputMode="email" width="min-w-[12rem]" onCommit={(v) => patchRider({ email: v || null })} />
      </td>
      <td className={td}>
        <Cell value={row.phone ?? ""} label={`${C.phone}: ${name}`} inputMode="tel" onCommit={(v) => patchRider({ phone: v || null })} />
      </td>
      <td className={td}>
        <Cell value={row.sponsor ?? ""} label={`${C.sponsor}: ${name}`} onCommit={(v) => patchRider({ sponsor: v || null })} />
      </td>
      {cols.lycra ? <td className={td}><ColourSelect label={`${C.lycra}: ${name}`} value={row.identifiers.vest_colour ?? ""} palette={palette} onChange={(v) => setIdentifier("vest_colour", v)} /></td> : null}
      {cols.bib ? <td className={td}><Cell value={String(row.identifiers.bib ?? "")} label={`${C.bib}: ${name}`} width="!min-w-[4rem] w-20" onCommit={(v) => setIdentifier("bib", v)} /></td> : null}
      {cols.kite.includes("brand") ? <td className={td}><Cell value={row.identifiers.kite?.brand ?? ""} label={`${C.kiteBrand}: ${name}`} onCommit={(v) => setIdentifier("kiteBrand", v)} /></td> : null}
      {cols.kite.includes("model") ? <td className={td}><Cell value={row.identifiers.kite?.model ?? ""} label={`${C.kiteModel}: ${name}`} onCommit={(v) => setIdentifier("kiteModel", v)} /></td> : null}
      {cols.kite.includes("size") ? <td className={td}><Cell value={String(row.identifiers.kite?.size ?? "")} label={`${C.kiteSize}: ${name}`} inputMode="decimal" width="!min-w-[4rem] w-20" onCommit={(v) => setIdentifier("kiteSize", v)} /></td> : null}
      {cols.kite.includes("colours") ? <td className={td}><Cell value={row.identifiers.kite?.colours ?? ""} label={`${C.kiteColours}: ${name}`} onCommit={(v) => setIdentifier("kiteColours", v)} /></td> : null}
      {cols.rashguard ? <td className={td}><ColourSelect label={`${C.rashguard}: ${name}`} value={row.identifiers.rashguard_colour ?? ""} palette={palette} onChange={(v) => setIdentifier("rashguard_colour", v)} /></td> : null}
      {cols.helmet ? <td className={td}><ColourSelect label={`${copy.riderLabel.helmet}: ${name}`} value={row.identifiers.helmet_colour ?? ""} palette={palette} onChange={(v) => setIdentifier("helmet_colour", v)} /></td> : null}
      {cols.photo ? <td className={td}><Cell value={row.photoUrl ?? ""} label={`${C.photo}: ${name}`} width="min-w-[10rem]" onCommit={(v) => patchRider({ photoUrl: v || null })} /></td> : null}
      <td className={td}>
        <select
          aria-label={`${C.status}: ${name}`}
          className="!min-h-[var(--org-ctl)]"
          value={row.status === "confirmed" || row.status === "withdrawn" || row.status === "no_show" ? row.status : "confirmed"}
          onChange={(e) => handlers.saveEntry(row, { status: e.target.value as "confirmed" | "withdrawn" | "no_show" })}
        >
          {Object.entries(copy.riders.statusOptions).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </td>
      <td className={td}>
        {asking ? (
          <div role="group" aria-label={copy.riders.remove} className="flex flex-col gap-1">
            <span className="max-w-[14rem] text-sm font-semibold">{copy.riders.removeQuestion(name)}</span>
            <button type="button" className="btn btn-danger" onClick={() => { handlers.remove(row); setAsking(false); }}>
              {copy.riders.removeYes}
            </button>
            <button type="button" className="btn" onClick={() => setAsking(false)}>
              {copy.common.cancel}
            </button>
          </div>
        ) : (
          <Button variant="quiet" onClick={() => setAsking(true)}>
            {copy.riders.remove}
          </Button>
        )}
      </td>
    </tr>
  );
}

function ColourSelect({ label, value, palette, onChange }: { label: string; value: string; palette: IdentificationScheme["palette"]; onChange: (v: string) => void }) {
  return (
    <select aria-label={label} className="!min-h-[var(--org-ctl)]" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{copy.riders.pickColour}</option>
      {palette.map((c) => (
        <option key={c.key} value={c.key}>
          {c.label}
        </option>
      ))}
    </select>
  );
}

/** The table: drag by the handle, or use the ↑ ↓ buttons. Every change of order renumbers the seeds 1, 2, 3… */
export function RidersTable({ rows, allIds, selected, onToggle, onToggleAll, noMatch, scheme, cols, clashesByRider, handlers, busy }: { rows: EntryRow[]; allIds: string[]; selected: Set<string>; onToggle: (id: string) => void; onToggleAll: () => void; noMatch: string | null; scheme: IdentificationScheme; cols: IdentifierColumns; clashesByRider: Map<string, string[]>; handlers: TableHandlers; busy: boolean }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const ids = allIds;
  const shownIds = rows.map((r) => r.id);
  const allShown = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = ids.indexOf(String(e.active.id));
    const to = ids.indexOf(String(e.over.id));
    if (from >= 0 && to >= 0) handlers.order(arrayMove(ids, from, to));
  }

  return (
    <div className="max-h-[70vh] overflow-auto">
      <DndContext id="riders-dnd" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <table className="w-full border-separate border-spacing-0 text-body" data-testid="riders-table">
          <thead>
            <tr>
              <th scope="col" className={`${th} w-[var(--org-row)] !p-0`}>
                <label className="flex h-[var(--org-row)] w-[var(--org-row)] items-center justify-center">
                  <input type="checkbox" aria-label={orgCopy.table.selectAll} checked={allShown} onChange={onToggleAll} />
                </label>
              </th>
              <th className={th}>{C.order}</th>
              <th className={th}>{C.seed}</th>
              <th className={th}>{C.label}</th>
              <th className={th}>{C.first}</th>
              <th className={th}>{C.last}</th>
              <th className={th}>{C.nationality}</th>
              <th className={th}>{C.email}</th>
              <th className={th}>{C.phone}</th>
              <th className={th}>{C.sponsor}</th>
              {cols.lycra ? <th className={th}>{C.lycra}</th> : null}
              {cols.bib ? <th className={th}>{C.bib}</th> : null}
              {cols.kite.includes("brand") ? <th className={th}>{C.kiteBrand}</th> : null}
              {cols.kite.includes("model") ? <th className={th}>{C.kiteModel}</th> : null}
              {cols.kite.includes("size") ? <th className={th}>{C.kiteSize}</th> : null}
              {cols.kite.includes("colours") ? <th className={th}>{C.kiteColours}</th> : null}
              {cols.rashguard ? <th className={th}>{C.rashguard}</th> : null}
              {cols.helmet ? <th className={th}>{copy.riderLabel.helmet}</th> : null}
              {cols.photo ? <th className={th}>{C.photo}</th> : null}
              <th className={th}>{C.status}</th>
              <th className={th}>{C.actions}</th>
            </tr>
          </thead>
          <SortableContext items={shownIds} strategy={verticalListSortingStrategy}>
            <tbody>
              {rows.map((row) => (
                <Row key={row.id} row={row} selected={selected.has(row.id)} onToggle={() => onToggle(row.id)} scheme={scheme} cols={cols} clashes={clashesByRider.get(row.id) ?? []} handlers={handlers} busy={busy} ids={ids} />
              ))}
            </tbody>
          </SortableContext>
        </table>
      </DndContext>
      {noMatch ? <p data-testid="no-match" className="p-4 text-body font-medium text-beach-muted">{noMatch}</p> : null}
    </div>
  );
}
