"use client";

import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const T = copy.headDivision;

/**
 * The division selector in the head console's header: tabs on a laptop, a drop-down on a phone. A division with a heat running has a dot and the word "Live"
 * (never colour alone). "All divisions" is offered to organisers only.
 */
export function DivisionSelector({ divisions, value, liveIds, canSeeAll, wide, onChange }: { divisions: Array<{ id: string; name: string }>; value: string; liveIds: Set<string>; canSeeAll: boolean; wide: boolean; onChange: (id: string) => void }) {
  if (divisions.length < 2 && !canSeeAll) return null;
  const items = [...divisions.map((d) => ({ id: d.id, name: d.name })), ...(canSeeAll ? [{ id: "all", name: T.all }] : [])];
  if (!wide) {
    return (
      <label className="flex flex-col gap-1 text-small font-semibold text-beach-muted">
        {T.label}
        <select data-testid="division-select" value={value} onChange={(e) => onChange(e.target.value)} className="min-h-[48px] rounded-xl border border-beach-border bg-beach-bg px-3 text-body font-semibold text-beach-ink">
          {items.map((d) => (
            <option key={d.id} value={d.id}>
              {liveIds.has(d.id) ? `${d.name} — ${T.live}` : d.name}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <div role="tablist" aria-label={T.label} data-testid="division-tabs" className="flex flex-wrap gap-1">
      {items.map((d) => {
        const live = liveIds.has(d.id);
        return (
          <button
            key={d.id}
            type="button"
            role="tab"
            aria-selected={value === d.id}
            data-division={d.id}
            onClick={() => onChange(d.id)}
            className={cn("inline-flex min-h-[40px] items-center gap-2 rounded-xl border px-3 text-body font-semibold", value === d.id ? "border-beach-accent bg-beach-accent text-beach-on-accent" : "border-beach-border bg-beach-bg text-beach-ink")}
          >
            {d.name}
            {live ? (
              <span data-testid="division-live" className="inline-flex items-center gap-1 text-small font-semibold">
                <span aria-hidden className="size-2 rounded-full bg-current" />
                {T.live}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
