import { notFound } from "next/navigation";
import { loadDivisionContext } from "@/lib/draw/server";
import { loadDrawTimes } from "@/lib/draw/print-times";
import { PrintActions } from "@/lib/draw/print-actions";
import { buildPrintSheet, type PrintHeader } from "@/lib/draw/print-sheet";
import { PrintSheetView } from "@/lib/draw/print-sheet-view";
import { getOrgContext } from "@/lib/org/context";
import { parseEventBranding } from "@/lib/schemas/event-settings";
import { copy } from "@/lib/ui-copy";

export const metadata = { title: copy.draw.print };
export const dynamic = "force-dynamic";

/**
 * The draw on paper (Print → Save as PDF) and as a picture (Export PNG): one A4 landscape page to send on WhatsApp. Rounds are named
 * columns, heats are boxes with their number and, when a run order exists, their start time; lycra colours print as colours and as words.
 */
export default async function DrawPrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ division?: string }> }) {
  const { id } = await params;
  const { division } = await searchParams;
  const { supabase } = await getOrgContext();
  const { data: event } = await supabase.from("events").select("id, name, branding, timezone, start_date").eq("id", id).maybeSingle();
  if (!event || !division || !/^[0-9a-f-]{36}$/.test(division)) notFound();
  const ctx = await loadDivisionContext(supabase, division);
  if (ctx.eventId !== id || !ctx.draw) notFound();
  const times = await loadDrawTimes(supabase, id, division, event.timezone || "Africa/Cairo");
  const sheet = buildPrintSheet(ctx.draw, ctx.scheme, { times: times.byUid });
  const day = times.day ?? event.start_date;
  const header: PrintHeader = {
    eventName: event.name,
    divisionName: ctx.name,
    date: day ? copy.draw.sheet.date(day) : null,
    status: ctx.locked ? copy.draw.status.locked : copy.draw.status.draft,
    logoUrl: parseEventBranding(event.branding).logoUrl ?? null,
  };
  return (
    <main className="flex flex-col gap-4 p-2" data-testid="draw-print">
      <PrintActions sheet={sheet} header={header} />
      <div className="overflow-x-auto pb-4">
        <PrintSheetView sheet={sheet} header={header} />
      </div>
    </main>
  );
}
