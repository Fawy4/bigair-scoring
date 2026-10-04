import { loadFollowPayload } from "@/lib/public/follow-load";
import { admitPublicRequest } from "@/lib/public/load";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/**
 * The Follow screen's one-second poll. It reads through exactly the same shared 3-second answers as the public pages and the other big screen (no database path of
 * its own) and counts against the same safety valve; the answer is what a visitor may see, plus a simulation event for its own organiser (the preview cookie).
 * The screen keeps its last good page when this answers anything but 200.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await admitPublicRequest())) return json({ updating: true }, 503);
  const payload = await loadFollowPayload((await params).slug);
  if (!payload) return json({ found: false }, 404);
  return json({ found: true, payload });
}
