import { notFound } from "next/navigation";
import { AnswerText } from "@/components/ask/answer-text";
import { monthStartUtc } from "@/lib/ask/budget";
import { formatWhen } from "@/lib/platform/event-label";
import { getPlatformSettings } from "@/lib/platform/public-settings";
import { requireAdmin } from "@/lib/platform/session";
import { copy } from "@/lib/ui-copy";

export const metadata = { title: copy.ask.log.heading };
export const dynamic = "force-dynamic";

const T = copy.ask.log;
const th = "border border-beach-line bg-beach-surface p-2 text-left";
const td = "border border-beach-line p-2 align-top";
const usd = (v: number) => `$${v.toFixed(v < 0.01 && v > 0 ? 4 : 2)}`;
/** A search word cannot break the filter: PostgREST's own signs are dropped. */
const clean = (q: string) => q.replace(/[%_,()*\\:"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);

/** Every Ask Sendbook exchange, newest first, with search. The platform owner only (the table's read rule says the same); staff and everybody else get 404. */
export default async function AskLogPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { supabase, role } = await requireAdmin();
  if (role !== "owner") notFound();
  const q = clean((await searchParams).q ?? "");
  let query = supabase.from("ask_log").select("id, created_at, organisation_id, role, route, question, answer, status, model, input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, cost_usd, rating, cited").order("created_at", { ascending: false }).limit(200);
  if (q) query = query.or(`question.ilike.*${q}*,answer.ilike.*${q}*`);
  const [{ data: rows, error }, { data: month }, { data: orgs }, { defaultTimezone }] = await Promise.all([
    query,
    supabase.from("ask_log").select("cost_usd").gte("created_at", monthStartUtc(new Date()).toISOString()).eq("status", "answered"),
    supabase.from("organisations").select("id, name"),
    getPlatformSettings(),
  ]);
  const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]));
  const monthCost = (month ?? []).reduce((n, r) => n + Number(r.cost_usd ?? 0), 0);

  return (
    <main className="flex flex-col gap-6">
      <h1>{T.heading}</h1>
      <p className="text-lg font-semibold">{T.intro}</p>
      <p className="font-semibold" data-testid="ask-log-total">
        {T.total(usd(monthCost), (month ?? []).length)}
      </p>
      <form method="get" className="flex flex-wrap items-end gap-3" role="search">
        <div className="flex flex-col gap-1">
          <label htmlFor="ask-q">{T.search}</label>
          <input id="ask-q" name="q" defaultValue={q} className="min-w-[16rem]" data-testid="ask-log-search" />
        </div>
        <button type="submit" className="btn">
          {T.searchButton}
        </button>
      </form>
      {error ? (
        <p role="alert" className="panel field-error">
          {copy.common.problem(error.message)}
        </p>
      ) : !rows?.length ? (
        <p className="panel font-semibold">{q ? T.noMatch(q) : T.none}</p>
      ) : (
        <div className="overflow-x-auto">
          <p className="mb-2 font-semibold">{T.shown(rows.length)}</p>
          <table className="w-full border-collapse text-left" data-testid="ask-log">
            <thead>
              <tr>
                {[T.columns.when, T.columns.who, T.columns.where, T.columns.question, T.columns.answer, T.columns.tokens, T.columns.model, T.columns.cost, T.columns.verdict].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-testid="ask-log-row">
                  <td className={`${td} whitespace-nowrap`}>{formatWhen(r.created_at, defaultTimezone)}</td>
                  <td className={td}>
                    {r.role}
                    <br />
                    <span className="text-beach-muted">{r.organisation_id ? (orgName.get(r.organisation_id) ?? "—") : T.platform}</span>
                  </td>
                  <td className={`${td} break-all`}>{r.route}</td>
                  <td className={`${td} min-w-[12rem]`}>{r.question}</td>
                  <td className={`${td} min-w-[20rem] max-w-[32rem]`}>
                    {T.statuses[r.status] ? <p className="font-semibold">{T.statuses[r.status]}</p> : null}
                    <details>
                      <summary className="cursor-pointer">{r.answer.slice(0, 140) || "—"}</summary>
                      <div className="mt-2 flex flex-col gap-1">
                        <AnswerText text={r.answer} />
                      </div>
                    </details>
                    {r.cited ? <p className="text-small text-beach-muted">{T.cited(r.cited)}</p> : null}
                  </td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>
                    {r.input_tokens + r.cache_write_tokens} / {r.cache_read_tokens} / {r.output_tokens}
                  </td>
                  <td className={td}>{r.model ?? "—"}</td>
                  <td className={`${td} whitespace-nowrap text-right tabular-nums`} data-testid="ask-log-cost">
                    {usd(Number(r.cost_usd ?? 0))}
                  </td>
                  <td className={td}>{r.rating ? T.verdicts[r.rating] : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
