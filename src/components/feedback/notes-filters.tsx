import { quickRange, type QuickRange } from "@/lib/feedback/dates";
import { FEEDBACK_TAGS } from "@/lib/feedback/format";
import { copy } from "@/lib/ui-copy";

const T = copy.feedback;

/** Filters by kind, status, screen and event: a plain form that reloads the page with the choices in the address. */
export function NotesFilters({ action, values, pages, events }: { action: string; values: { tag?: string; status?: string; page?: string; event?: string; from?: string; to?: string }; pages: string[]; events: string[] }) {
  const select = (name: string, label: string, options: Array<[string, string]>, value?: string) => (
    <div className="flex min-w-0 max-w-full flex-col gap-1">
      <label htmlFor={`f-${name}`} className="font-semibold">
        {label}
      </label>
      <select id={`f-${name}`} name={name} defaultValue={value ?? ""} className="max-w-full">
        <option value="">{T.filters.all}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
  const quick = (kind: QuickRange, label: string) => {
    const q = new URLSearchParams();
    for (const k of ["tag", "status", "page", "event"] as const) if (values[k]) q.set(k, values[k]!);
    const r = quickRange(kind, new Date());
    if (r.from) q.set("from", r.from);
    if (r.to) q.set("to", r.to);
    const active = (values.from ?? "") === r.from && (values.to ?? "") === r.to;
    return (
      <a key={kind} href={`${action}${q.size ? `?${q}` : ""}`} data-testid={`quick-${kind}`} aria-current={active ? "true" : undefined} className={`btn ${active ? "btn-primary" : ""}`}>
        {label}
      </a>
    );
  };
  const date = (name: "from" | "to", label: string) => (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={`f-${name}`} className="font-semibold">
        {label}
      </label>
      <input id={`f-${name}`} type="date" name={name} defaultValue={values[name] ?? ""} />
    </div>
  );
  return (
    <form action={action} method="get" className="panel flex flex-wrap items-end gap-4" aria-label={T.filters.apply}>
      {select("tag", T.filters.tag, FEEDBACK_TAGS.map((t) => [t, T.tags[t]]), values.tag)}
      {select("status", T.filters.status, [["open", T.statuses.open], ["done", T.statuses.done]], values.status)}
      {select("page", T.filters.page, pages.map((p) => [p, p]), values.page)}
      {select("event", T.filters.event, events.map((e) => [e, e]), values.event)}
      {date("from", T.filters.from)}
      {date("to", T.filters.to)}
      <div role="group" aria-label={T.filters.quickLabel} className="flex flex-wrap gap-2">
        {quick("today", T.filters.today)}
        {quick("last7", T.filters.last7)}
        {quick("all", T.filters.allDates)}
      </div>
      <button type="submit" className="btn btn-primary">
        {T.filters.apply}
      </button>
    </form>
  );
}
