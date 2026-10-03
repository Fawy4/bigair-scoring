import { RefusalLinks } from "@/components/manual/refusal-links";
import { redirect } from "next/navigation";
import { HeadRoot } from "@/components/live/head-page";
import { loadLiveContext } from "@/lib/live/context";
import { copy } from "@/lib/ui-copy";

export const metadata = { title: copy.head.title };
export const dynamic = "force-dynamic";

/** The head judge's page: a head seat of the event, or an organiser of it; `?mode=announcer` (or an announcer seat) shows the read-only announcer view. Judges and spotters are sent to their own screens. */
export default async function HeadPageRoute({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ mode?: string }> }) {
  const { eventId } = await params;
  const { mode } = await searchParams;
  const ctx = await loadLiveContext(eventId);
  if (!ctx) redirect("/join");
  if (ctx.viewer.kind === "seat") {
    if (ctx.viewer.role === "judge") redirect(`/judge/${eventId}`);
    if (ctx.viewer.role === "spotter") redirect(`/spot/${eventId}`);
    if (ctx.viewer.role === "observer") redirect(`/observe/${eventId}`);
    if (ctx.viewer.role !== "head" && ctx.viewer.role !== "announcer") redirect("/seat?card=1");
  }
  return (
    <>
      <HeadRoot ctx={ctx} mode={mode === "announcer" ? "announcer" : undefined} />
      {/* the head judge's console is also an organiser's screen: its refusals link to the manual */}
      <RefusalLinks />
    </>
  );
}
