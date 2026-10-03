import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { copy } from "@/lib/ui-copy";
import { SeatHeartbeat } from "./heartbeat";

export const metadata = { title: copy.seat.title };
export const dynamic = "force-dynamic";

const SCREEN: Record<string, string> = { judge: "judge", spotter: "spot", head: "head", observer: "observe" };

/** After joining, a phone goes straight to its own screen. The connected card stays at /seat?card=1 (and is the home of the announcer's seat). */
export default async function SeatPage({ searchParams }: { searchParams: Promise<{ card?: string }> }) {
  const { card } = await searchParams;
  const supabase = await createClient();
  const { data: seats } = await supabase.from("judge_seats").select("id, name, role, active, event_id, events(name, slug)");
  const seat = seats?.[0];
  if (seat && seat.active && !card && SCREEN[seat.role]) redirect(`/${SCREEN[seat.role]}/${seat.event_id}`);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-4 text-[#111]">
      {seat ? (
        <>
          <div role="status" className="rounded-lg border-4 border-[#111] p-4">
            <p className="text-lg font-semibold">{copy.seat.connected}</p>
            <p className="text-3xl font-extrabold">{seat.name}</p>
            <p className="text-xl font-bold">{copy.seat.roles[seat.role] ?? seat.role} · {seat.events?.name}</p>
            {!seat.active ? <p className="mt-2 text-lg font-bold">{copy.seat.switchedOff}</p> : null}
          </div>
          {seat.active && SCREEN[seat.role] ? (
            <Link href={`/${SCREEN[seat.role]}/${seat.event_id}`} data-testid="open-screen" className="flex h-16 items-center justify-center rounded-md bg-primary text-xl font-bold text-primary-foreground">
              {copy.seat.openScreen}
            </Link>
          ) : null}
          <p className="text-lg font-semibold">{copy.seat.later}</p>
          <SeatHeartbeat />
        </>
      ) : (
        <>
          <h1 className="text-3xl font-extrabold">{copy.seat.notConnected}</h1>
          <p className="text-lg font-semibold">{copy.seat.noSeat}</p>
          <Link href="/join" className="flex h-16 items-center justify-center rounded-md bg-primary text-xl font-bold text-primary-foreground">{copy.seat.joinLink}</Link>
        </>
      )}
    </main>
  );
}
