import { redirect } from "next/navigation";
import { HeadRoot } from "@/components/live/head-page";
import { loadLiveContext } from "@/lib/live/context";
import { copy } from "@/lib/ui-copy";

export const metadata = { title: copy.head.title };
export const dynamic = "force-dynamic";

/** The head judge's page: a head seat of the event, or an organiser of it. Judges and spotters are sent to their own screens. */
export default async function HeadPageRoute({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const ctx = await loadLiveContext(eventId);
  if (!ctx) redirect("/join");
  if (ctx.viewer.kind === "seat") {
    if (ctx.viewer.role === "judge") redirect(`/judge/${eventId}`);
    if (ctx.viewer.role === "spotter") redirect(`/spot/${eventId}`);
    if (ctx.viewer.role !== "head") redirect("/seat?card=1");
  }
  return <HeadRoot ctx={ctx} />;
}
