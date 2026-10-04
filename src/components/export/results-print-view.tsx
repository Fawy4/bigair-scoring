import { HeatSummary } from "@/components/public/heat-summary";
import { PrintButton } from "@/components/print-button";
import { exportedHeats, localStamp, printOrder, type ResultsExportInput } from "@/lib/export-format/results-export";
import { copy } from "@/lib/ui-copy";

const P = copy.exportFiles.print;
const R = copy.pub.results;

/**
 * The printable results. Each heat is the public results page's own heat: the same rows (`buildHeatTabs`) drawn by the same component (`HeatSummary`), so a number on paper
 * is the number on the public page. The event name and the export date and time sit in a table header, which the browser repeats at the top of every printed page.
 * A draft heat (only when an organiser asked for it) says DRAFT in words and as a watermark.
 */
export function ResultsPrintView({ input }: { input: ResultsExportInput }) {
  const heats = exportedHeats(input);
  const groups = printOrder(heats);
  const tz = input.site.event.timezone || "Africa/Cairo";
  const stamp = localStamp(input.exportedAt, tz);
  const headerLine = (
    <>
      <span data-testid="print-event-name" className="text-heading font-semibold">
        {input.site.event.name}
      </span>
      <span data-testid="print-exported-at" className="text-body font-semibold text-beach-muted">
        {P.exportedAt(stamp)}
      </span>
    </>
  );
  return (
    <div data-testid="results-print" className="results-print beach-day beach-text-normal min-h-screen bg-beach-bg text-beach-ink">
      <div className="no-print mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-3 pt-3">
        <PrintButton label={P.printButton} />
        <span className="text-small font-medium text-beach-muted">{copy.exportFiles.results.printableHint}</span>
        <span className="text-small font-medium text-beach-muted">{P.newestFirst}</span>
      </div>
      <table className="mx-auto w-full max-w-3xl border-separate">
        <thead>
          <tr>
            <th data-testid="print-header" className="border-b border-beach-line px-3 pb-2 pt-3 text-left">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">{headerLine}</div>
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 ? (
            <tr>
              <td data-testid="print-empty" className="px-3 py-4 text-body font-semibold">
                {P.noHeats}
              </td>
            </tr>
          ) : (
            groups.map((g) => (
              <tr key={g.division.id} data-testid="print-division" data-division={g.division.id} className="results-print-division">
                <td className="px-3 py-3">
                  <h2 className="mb-2 text-heading font-semibold">{P.division(g.division.name)}</h2>
                  <div className="flex flex-col gap-4">
                    {g.heats.map((h) => (
                      <section key={h.heat.id} data-testid="print-heat" data-heat-id={h.heat.id} data-draft={h.draft ? "true" : "false"} className="results-print-heat relative flex flex-col gap-1.5">
                        <h3 className="flex flex-wrap items-center gap-2 text-name font-semibold">
                          {h.tab.title}
                          <span className="rounded-full border border-beach-line px-2 text-small font-semibold">{R.complete}</span>
                          {h.draft ? <span data-testid="print-draft-word" className="rounded-full border-2 border-beach-crash px-2 text-small font-bold">{P.draftMark}</span> : null}
                        </h3>
                        {h.draft ? <p className="text-small font-semibold">{P.draftNote}</p> : null}
                        <HeatSummary heat={h.tab} />
                        {h.draft ? (
                          <span aria-hidden data-testid="print-watermark" className="results-print-watermark pointer-events-none absolute inset-0 flex items-center justify-center text-[96px] font-black tracking-widest">
                            {P.draftMark}
                          </span>
                        ) : null}
                      </section>
                    ))}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
