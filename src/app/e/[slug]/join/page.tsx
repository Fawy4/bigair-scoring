import { JoinForm } from "@/app/join/join-form";
import { SelfAddForm } from "@/app/join/self-add-form";
import { createClient } from "@/lib/supabase/server";
import { copy } from "@/lib/ui-copy";

export const metadata = { title: copy.join.title };

export default async function EventJoinPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> }) {
  const { slug } = await params;
  const { t } = await searchParams;
  const { data: event } = await (await createClient()).from("events").select("name").eq("slug", slug).maybeSingle();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-4 text-[#111]">
      <h1 className="text-3xl font-extrabold">{event?.name ?? copy.join.joinEvent}</h1>
      <p className="text-lg font-semibold">{copy.join.eventIntro(Boolean(t))}</p>
      <JoinForm slug={slug} token={t} />
      <SelfAddForm slug={slug} />
    </main>
  );
}
