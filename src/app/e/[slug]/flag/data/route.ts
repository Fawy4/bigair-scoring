import { loadFlagView } from "@/lib/public/flag-view";

export const dynamic = "force-dynamic";

/** The Flag view's two-second poll: the same public functions as every public page, read as a visitor. 404 when the event is not public. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const payload = await loadFlagView((await params).slug);
  if (!payload) return new Response(JSON.stringify({ found: false }), { status: 404, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  return new Response(JSON.stringify({ found: true, ...payload }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
