import { loadFlagView } from "@/lib/public/flag-view";
import { freshReads } from "@/lib/public/load";

export const dynamic = "force-dynamic";

/** The Flag view's two-second poll: the same public functions as every public page, read as a visitor. 404 when the event is not public. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  // the marshal sees a flag change within a second: no shared answer older than the read itself
  const payload = await freshReads.run(true, () => loadFlagView(slug));
  if (!payload) return new Response(JSON.stringify({ found: false }), { status: 404, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  return new Response(JSON.stringify({ found: true, ...payload }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
