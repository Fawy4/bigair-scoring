import { redirect } from "next/navigation";
import { JudgeRoot } from "@/components/live/judge-screen";
import { loadLiveContext } from "@/lib/live/context";
import { copy } from "@/lib/ui-copy";

export const metadata = { title: copy.live.header.judgeTitle };
export const dynamic = "force-dynamic";

/** The judge's phone. It opens the running heat of the judge's panel by itself; `?heat=` pins one. Other roles are sent to their own screen. */
export default async function JudgePage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ heat?: string }> }) {
  const { eventId } = await params;
  const { heat } = await searchParams;
  const ctx = await loadLiveContext(eventId);
  if (!ctx) redirect("/join");
  if (ctx.viewer.kind === "organiser") redirect(`/head/${eventId}`);
  if (ctx.viewer.role === "spotter") redirect(`/spot/${eventId}`);
  if (ctx.viewer.role === "head") redirect(`/head/${eventId}`);
  if (ctx.viewer.role !== "judge") redirect("/seat?card=1");
  return <JudgeRoot ctx={ctx} pinnedHeatId={heat ?? null} />;
}
