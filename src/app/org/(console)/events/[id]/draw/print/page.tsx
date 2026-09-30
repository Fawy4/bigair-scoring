import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { loadDivisionContext } from "@/lib/draw/server";
import { getOrgContext } from "@/lib/org/context";
import { parseEventBranding } from "@/lib/schemas/event-settings";
import { copy } from "@/lib/ui-copy";
import { Ladder } from "../ladder";

export const metadata = { title: copy.draw.print };
export const dynamic = "force-dynamic";

/** The ladder on paper (Print → Save as PDF). One division per page; nothing to tap. */
export default async function DrawPrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ division?: string }> }) {
  const { id } = await params;
  const { division } = await searchParams;
  const { supabase } = await getOrgContext();
  const { data: event } = await supabase.from("events").select("id, name, branding").eq("id", id).maybeSingle();
  if (!event || !division || !/^[0-9a-f-]{36}$/.test(division)) notFound();
  const ctx = await loadDivisionContext(supabase, division);
  if (ctx.eventId !== id || !ctx.draw) notFound();
  const branding = parseEventBranding(event.branding);
  return (
    <main className="flex flex-col gap-4 p-2" data-testid="draw-print">
      <div className="no-print flex items-center gap-3">
        <PrintButton label={copy.draw.printNow} />
        <span className="font-semibold">{copy.draw.printHelp}</span>
      </div>
      <header className="flex items-center gap-3">
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- the event's own logo, a plain image on paper
          <img src={branding.logoUrl} alt="" className="h-14 w-auto" />
        ) : null}
        <div>
          <h1 className="text-3xl font-extrabold">{copy.draw.printTitle(event.name, ctx.name)}</h1>
          <p className="font-semibold">{ctx.locked ? copy.draw.status.locked : copy.draw.status.draft}</p>
        </div>
      </header>
      <Ladder draw={ctx.draw} scheme={ctx.scheme} editable={false} />
    </main>
  );
}
