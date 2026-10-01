"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Search } from "lucide-react";
import { orgCopy } from "@/lib/ui-copy";
import { matchesSearch } from "@/lib/table/search";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export interface DataColumn<T> {
  id: string;
  header: string;
  /** Numbers are right-aligned in tabular digits. */
  align?: "start" | "end";
  className?: string;
  render: (row: T) => ReactNode;
}

export interface FilterGroup<T> {
  id: string;
  label: string;
  options: Array<{ id: string; label: string }>;
  test: (row: T, optionId: string) => boolean;
}

interface DataTableProps<T> {
  caption: string;
  rows: readonly T[];
  columns: ReadonlyArray<DataColumn<T>>;
  getId: (row: T) => string;
  /** The text a search looks in: name, email, bib … */
  /** The text a search looks in: name, email, bib … */
  searchText?: (row: T) => string;
  /** Without a search label the table has no search box (a short list such as the run order). */
  searchLabel?: string;
  /** What a row is called, for its tick box ("Select Luca Moretti"). */
  rowLabel?: (row: T) => string;
  filters?: ReadonlyArray<FilterGroup<T>>;
  /** Tick boxes and the bulk bar. */
  bulk?: (ctx: { ids: string[]; clear: () => void }) => ReactNode;
  /** Shown instead of the table when there are no rows at all. */
  empty?: ReactNode;
  /** Height of the scrolling area, so the header can be seen to stay put. */
  maxHeight?: string;
  initialSelected?: string[];
  /** Without its own frame, to sit inside a card. */
  bare?: boolean;
  testId?: string;
}

/** A dense table: 40 px rows (44 on touch), sticky header, search, filter chips, tick boxes with a bulk bar, an empty state that says what to do next. */
export function DataTable<T>({ caption, rows, columns, getId, searchText, searchLabel, rowLabel, filters = [], bulk, empty, maxHeight, initialSelected = [], bare, testId }: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [chips, setChips] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));

  if (rows.length === 0 && empty) return <div data-testid={testId}>{empty}</div>;

  const visible = rows.filter((r) => matchesSearch(searchText?.(r) ?? "", query) && filters.every((f) => !chips[f.id] || f.test(r, chips[f.id])));
  const present = new Set(rows.map(getId));
  const selectedIds = [...selected].filter((id) => present.has(id));
  const visibleIds = new Set(visible.map(getId));
  const selectedVisible = selectedIds.filter((id) => visibleIds.has(id)).length;
  const hidden = selectedIds.length - selectedVisible;
  const allVisible = visible.length > 0 && visible.every((r) => selected.has(getId(r)));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of visible) {
        if (allVisible) next.delete(getId(r));
        else next.add(getId(r));
      }
      return next;
    });
  const clear = () => setSelected(new Set());

  return (
    <div data-testid={testId} className={cn("bg-beach-bg", !bare && "rounded-card border border-beach-line")}>
      {searchLabel || filters.length > 0 ? (
      <div className="flex flex-wrap items-center gap-2 border-b border-beach-line p-2">
        {searchLabel ? (
        <label className="relative inline-flex min-w-0 flex-1 basis-56 items-center">
          <Search aria-hidden className="pointer-events-none absolute left-3 size-4 text-beach-muted" />
          <input
            type="search"
            aria-label={searchLabel}
            placeholder={searchLabel}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="table-search"
            className="h-[var(--org-ctl)] w-full rounded-[8px] border border-beach-border bg-beach-bg pl-9 pr-3 text-body font-medium text-beach-ink placeholder:text-beach-muted"
          />
        </label>
        ) : null}
        {filters.map((f) => (
          <div key={f.id} role="group" aria-label={f.label} className="flex flex-wrap gap-1">
            {[{ id: "", label: orgCopy.table.all }, ...f.options].map((o) => {
              const on = (chips[f.id] ?? "") === o.id;
              return (
                <button
                  key={o.id || "all"}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setChips((c) => ({ ...c, [f.id]: o.id }))}
                  className={cn(
                    "inline-flex min-h-[var(--org-ctl)] items-center gap-1 rounded-full border px-3 text-body font-semibold",
                    on ? "border-beach-accent bg-beach-accent text-beach-on-accent" : "border-beach-border bg-beach-bg text-beach-ink",
                  )}
                >
                  {on ? <Check aria-hidden className="size-4" /> : null}
                  {o.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      ) : null}

      {searchLabel || filters.length > 0 ? (
      <p aria-live="polite" data-testid="table-count" className="px-3 pt-2 text-small font-medium text-beach-muted">
        {orgCopy.table.showing(visible.length, rows.length)}
        {selectedIds.length > 0 ? ` · ${hidden > 0 ? orgCopy.table.selectedHidden(selectedIds.length, hidden) : orgCopy.table.selected(selectedIds.length)}` : ""}
      </p>
      ) : null}

      {bulk && selectedIds.length > 0 ? (
        <div role="region" aria-label={orgCopy.table.bulkLabel} data-testid="bulk-bar" className="mx-2 mt-2 flex flex-wrap items-center gap-2 rounded-[8px] border border-beach-border bg-beach-surface p-2">
          <span className="px-1 text-body font-semibold">{orgCopy.table.selected(selectedIds.length)}</span>
          {bulk({ ids: selectedIds, clear })}
          <Button variant="quiet" onClick={clear}>
            {orgCopy.table.clear}
          </Button>
        </div>
      ) : null}

      <div className="mt-2 overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
        <table className="w-full border-separate border-spacing-0 text-body">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {bulk ? (
                <th scope="col" className="sticky top-0 z-10 w-[var(--org-row)] bg-beach-surface p-0 [box-shadow:inset_0_-1px_0_var(--beach-line)]">
                  <label className="flex h-[var(--org-row)] w-[var(--org-row)] items-center justify-center">
                    <input type="checkbox" aria-label={orgCopy.table.selectAll} checked={allVisible} onChange={toggleAll} className="size-5 accent-[var(--beach-accent)]" />
                  </label>
                </th>
              ) : null}
              {columns.map((c) => (
                <th key={c.id} scope="col" className={cn("sticky top-0 z-10 h-[var(--org-row)] whitespace-nowrap bg-beach-surface px-3 text-small font-semibold text-beach-muted [box-shadow:inset_0_-1px_0_var(--beach-line)]", c.align === "end" ? "text-right" : "text-left", c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const id = getId(row);
              return (
                <tr key={id} data-testid="table-row" data-selected={selected.has(id) || undefined} className={cn("h-[var(--org-row)]", selected.has(id) && "bg-beach-surface")}>
                  {bulk ? (
                    <td className="p-0 [box-shadow:inset_0_-1px_0_var(--beach-line)]">
                      <label className="flex h-[var(--org-row)] w-[var(--org-row)] items-center justify-center">
                        <input type="checkbox" aria-label={orgCopy.table.selectRow(rowLabel?.(row) ?? id)} checked={selected.has(id)} onChange={() => toggle(id)} className="size-5 accent-[var(--beach-accent)]" />
                      </label>
                    </td>
                  ) : null}
                  {columns.map((c) => (
                    <td key={c.id} className={cn("h-[var(--org-row)] whitespace-nowrap px-3 py-0 [box-shadow:inset_0_-1px_0_var(--beach-line)]", c.align === "end" ? "text-right tabular-nums" : "text-left", c.className)}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 ? (
          <p data-testid="no-match" className="p-4 text-body font-medium text-beach-muted">
            {orgCopy.table.noMatch(query)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** What an empty table says: what is missing and what to do next. */
export function EmptyState({ title, body, actions, testId = "empty-state" }: { title: string; body: string; actions?: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId} className="flex flex-col items-start gap-2 rounded-card border border-dashed border-beach-border bg-beach-surface p-4">
      <p className="text-[14px] font-semibold">{title}</p>
      <p className="max-w-[60ch] text-body font-medium text-beach-muted">{body}</p>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/** A cell you edit in place: click, type, Enter or leave the box to save, Escape to cancel. A tick and the word "Saved" show for 2 seconds. */
export function InlineCell({ value, label, onSave, align = "start", numeric, startEditing = false }: { value: string; label: string; onSave: (value: string) => void; align?: "start" | "end"; numeric?: boolean; startEditing?: boolean }) {
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing && !startEditing) box.current?.select();
  }, [editing, startEditing]);
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);
  const commit = () => {
    setEditing(false);
    if (draft.trim() !== value) {
      onSave(draft.trim());
      setSaved(true);
    }
  };
  if (editing) {
    return (
      <input
        ref={box}
        aria-label={label}
        data-testid="inline-input"
        inputMode={numeric ? "numeric" : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className={cn("h-[var(--org-row)] w-full min-w-[8ch] rounded-[8px] border border-beach-accent bg-beach-bg px-2 text-body font-semibold text-beach-ink", align === "end" && "text-right")}
      />
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className={cn("inline-flex h-[var(--org-row)] min-w-[var(--org-row)] w-full items-center gap-1 rounded-[8px] px-1 text-body font-semibold hover:bg-beach-surface", align === "end" ? "justify-end" : "justify-start")}
    >
      {value}
      {saved ? (
        <span data-testid="saved-tick" className="inline-flex items-center gap-1 text-small font-semibold text-beach-live">
          <Check aria-hidden className="size-4" />
          {orgCopy.table.saved}
        </span>
      ) : null}
    </button>
  );
}
