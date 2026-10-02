import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/org/context";
import { copy } from "@/lib/ui-copy";
import { CardsSheet } from "./cards-sheet";

export const metadata = { title: copy.officials.printCardsTitle };
export const dynamic = "force-dynamic";

/** One printable page of cards, for every seat or for one (?seat=…). The cards are made when this page opens. */
export default async function CardsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ seat?: string }> }) {
  const { id } = await params;
  const { seat } = await searchParams;
  const { supabase } = await getOrgContext();
  const { data: event } = await supabase.from("events").select("id").eq("id", id).maybeSingle();
  if (!event) notFound();
  return (
    <main className="print-page flex max-w-5xl flex-col gap-4">
      <h1 className="no-print text-3xl font-semibold">{copy.officials.printCardsTitle}</h1>
      <CardsSheet eventId={id} seatId={seat && /^[0-9a-f-]{36}$/.test(seat) ? seat : null} />
    </main>
  );
}
