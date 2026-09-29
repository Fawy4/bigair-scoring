import { JoinForm } from "@/app/join/join-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Join as an official" };

export default async function EventJoinPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> }) {
  const { slug } = await params;
  const { t } = await searchParams;
  const { data: event } = await (await createClient()).from("events").select("name").eq("slug", slug).maybeSingle();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-4 text-[#111]">
      <h1 className="text-3xl font-extrabold">{event?.name ?? "Join the event"}</h1>
      <p className="text-lg font-semibold">Officials: enter your 6-digit PIN{t ? ", or wait a moment while your QR code signs you in" : ""}.</p>
      <JoinForm slug={slug} token={t} />
    </main>
  );
}
