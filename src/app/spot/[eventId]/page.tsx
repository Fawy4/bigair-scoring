import { notFound, redirect } from "next/navigation";
import { SpotterRoot } from "@/components/live/spotter-screen";
import { loadLiveContext } from "@/lib/live/context";
import { copy } from "@/lib/ui-copy";

export const metadata = { title: copy.spotter.title };
export const dynamic = "force-dynamic";

/** The spotter's phone. It opens the running heat by itself; `?heat=` pins one. Other roles are sent to their own screen. */
export default async function SpotterPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ heat?: string }> }) {
  const { eventId } = await params;
  const { heat } = await searchParams;
  const ctx = await loadLiveContext(eventId);
  if (!ctx) redirect("/join");
  if (ctx.viewer.kind === "organiser") redirect(`/head/${eventId}`);
  if (ctx.viewer.role === "judge") redirect(`/judge/${eventId}`);
  if (ctx.viewer.role === "head") redirect(`/head/${eventId}`);
  if (ctx.viewer.role !== "spotter") redirect("/seat?card=1");
  if (!ctx.event) notFound();
  return <SpotterRoot ctx={ctx} pinnedHeatId={heat ?? null} />;
}
