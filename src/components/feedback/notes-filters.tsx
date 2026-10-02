import { FEEDBACK_TAGS } from "@/lib/feedback/format";
import { copy } from "@/lib/ui-copy";

const T = copy.feedback;

/** Filters by kind, status, screen and event: a plain form that reloads the page with the choices in the address. */
export function NotesFilters({ action, values, pages, events }: { action: string; values: { tag?: string; status?: string; page?: string; event?: string }; pages: string[]; events: string[] }) {
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
  return (
    <form action={action} method="get" className="panel flex flex-wrap items-end gap-4" aria-label={T.filters.apply}>
      {select("tag", T.filters.tag, FEEDBACK_TAGS.map((t) => [t, T.tags[t]]), values.tag)}
      {select("status", T.filters.status, [["open", T.statuses.open], ["done", T.statuses.done]], values.status)}
      {select("page", T.filters.page, pages.map((p) => [p, p]), values.page)}
      {select("event", T.filters.event, events.map((e) => [e, e]), values.event)}
      <button type="submit" className="btn btn-primary">
        {T.filters.apply}
      </button>
    </form>
  );
}
