import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Your seat" };
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = { judge: "Judge", head: "Head judge", spotter: "Spotter", announcer: "Announcer" };

export default async function SeatPage() {
  const supabase = await createClient();
  const { data: seats } = await supabase.from("judge_seats").select("id, name, role, active, events(name, slug)");
  const seat = seats?.[0];
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-4 text-[#111]">
      {seat ? (
        <>
          <div role="status" className="rounded-lg border-4 border-[#111] p-4">
            <p className="text-lg font-semibold">✔ Connected</p>
            <p className="text-3xl font-extrabold">{seat.name}</p>
            <p className="text-xl font-bold">{ROLE_LABEL[seat.role] ?? seat.role} · {seat.events?.name}</p>
            {!seat.active ? <p className="mt-2 text-lg font-bold">✖ This seat has been switched off by the organiser.</p> : null}
          </div>
          <p className="text-lg font-semibold">The scorecard and spotter screens arrive in Phase 5. This phone stays connected to your seat, so you will not need to join again.</p>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-extrabold">Not connected</h1>
          <p className="text-lg font-semibold">This phone does not hold a seat yet.</p>
          <Link href="/join" className="flex h-16 items-center justify-center rounded-md bg-primary text-xl font-bold text-primary-foreground">Join with a PIN</Link>
        </>
      )}
    </main>
  );
}
