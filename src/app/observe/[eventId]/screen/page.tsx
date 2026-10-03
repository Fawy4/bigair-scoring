import { notFound, redirect } from "next/navigation";
import { HeadRoot } from "@/components/live/head-page";
import { JudgeRoot } from "@/components/live/judge-screen";
import { ReadOnlyFrame } from "@/components/live/read-only";
import { SpotterRoot } from "@/components/live/spotter-screen";
import { loadObserver, ownScreen } from "@/lib/live/observer-load";
import { observedViewer, parseViewKey } from "@/lib/live/observer";
import { copy } from "@/lib/ui-copy";

export const metadata = { title: copy.observer.title };
export const dynamic = "force-dynamic";

/** One official's screen as that official sees it, drawn for an observer inside its frame: the real screen, read only. */
export default async function ObservedScreen({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ view?: string }> }) {
  const { eventId } = await params;
  const { view: key } = await searchParams;
  const r = await loadObserver(eventId);
  if (!r.ok) redirect(r.kind === "join" ? "/join" : ownScreen(eventId, r.role));
  const view = parseViewKey(key);
  if (!view) notFound();
  if (view.kind === "screen" || view.kind === "public") redirect(`/observe/${eventId}/door?to=${view.kind}`);
  const viewer = observedViewer(view, r.data.seats, r.data.observerSeatId);
  if (!viewer) notFound();
  const ctx = { ...r.data.ctx, viewer };
  return (
    <ReadOnlyFrame>
      {view.kind === "judge" ? (
        <JudgeRoot ctx={ctx} pinnedHeatId={null} />
      ) : view.kind === "spotter" ? (
        <SpotterRoot ctx={ctx} pinnedHeatId={null} />
      ) : (
        <HeadRoot ctx={ctx} mode={view.kind === "announcer" ? "announcer" : undefined} />
      )}
    </ReadOnlyFrame>
  );
}
