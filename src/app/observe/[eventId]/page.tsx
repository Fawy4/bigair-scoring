import { redirect } from "next/navigation";
import { loadObserver, ownScreen } from "@/lib/live/observer-load";
import { observerViews, parseViewKey, viewKey } from "@/lib/live/observer";
import { copy } from "@/lib/ui-copy";
import { ObserverShell } from "./observer-shell";

export const metadata = { title: copy.observer.title };
export const dynamic = "force-dynamic";

/** An Observer seat's phone or laptop: a top bar to pick whose screen to look at, and that screen, live and read only. Anybody else is sent to their own screen. */
export default async function ObservePage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ view?: string }> }) {
  const { eventId } = await params;
  const { view } = await searchParams;
  const r = await loadObserver(eventId);
  if (!r.ok) redirect(r.kind === "join" ? "/join" : ownScreen(eventId, r.role));
  const { ctx, seats, panels, observerSeatId } = r.data;
  const views = observerViews(seats, panels);
  const asked = parseViewKey(view);
  const start = asked && views.some((v) => v.key === viewKey(asked)) ? viewKey(asked) : views[0].key;
  return (
    <ObserverShell
      eventId={eventId}
      eventName={ctx.event.name}
      observerName={seats.find((s) => s.id === observerSeatId)?.name ?? ""}
      views={views.map((v) => ({ key: v.key, label: v.label, group: v.group, frame: v.frame }))}
      start={start}
    />
  );
}
