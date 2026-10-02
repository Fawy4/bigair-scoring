import { z } from "zod";
import { askNoteBody, noteRole } from "@/lib/ask/note";
import { pageLabelFor } from "@/lib/feedback/format";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { copy } from "@/lib/ui-copy";

export const dynamic = "force-dynamic";

const E = copy.ask.errors;
const Body = z.object({ logId: z.string().uuid(), rating: z.enum(["up", "down"]) });
const json = (status: number, body: object) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * "Was this right?": records the verdict on the person's own answer (once) and writes a feedback note tagged "ask" with the question, the answer and the
 * context, so it shows in the owner's Feedback list. Written with the service key because a PIN seat cannot write notes itself.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json(400, { error: E.ratingFailed });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json(401, { error: E.signedOut });

  const s = createServiceClient();
  const { data: log } = await s.from("ask_log").select("id, user_id, organisation_id, event_id, role, route, question, answer, context, rating").eq("id", parsed.data.logId).maybeSingle();
  if (!log || log.user_id !== user.id) return json(403, { error: E.ratingFailed });
  if (log.rating) return json(409, { error: E.ratedAlready });

  const { data: rated } = await s.from("ask_log").update({ rating: parsed.data.rating }).eq("id", log.id).is("rating", null).select("id");
  if (!rated?.length) return json(409, { error: E.ratedAlready });

  const ctx = (log.context ?? {}) as { eventName?: string | null; refusals?: string[]; lastRefusal?: string | null; checklist?: Array<{ label: string; state: string }> };
  const contextLine = [
    `route ${log.route}`,
    `role ${log.role}`,
    ctx.eventName ? `event ${ctx.eventName}` : null,
    ctx.lastRefusal ? `last refusal “${ctx.lastRefusal}”` : null,
    ctx.checklist?.length ? `checklist ${ctx.checklist.map((c) => `[${c.state}] ${c.label}`).join("; ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const { data: ev } = log.event_id ? await s.from("events").select("name").eq("id", log.event_id).maybeSingle() : { data: null };
  const { data: org } = log.organisation_id ? await s.from("organisations").select("name").eq("id", log.organisation_id).maybeSingle() : { data: null };
  const path = log.route.slice(0, 300);
  const { error } = await s.from("feedback_notes").insert({
    organisation_id: log.organisation_id,
    author_user_id: user.id,
    author_role: noteRole(log.role),
    event_id: log.event_id,
    page: path,
    page_label: pageLabelFor(path).slice(0, 100),
    body: askNoteBody(parsed.data.rating, log.question, log.answer, contextLine),
    tag: "ask",
    organisation_name: org?.name ?? null,
    event_name: ev?.name ?? null,
  });
  if (error) {
    console.error("Ask feedback note failed:", error.message);
    await s.from("ask_log").update({ rating: null }).eq("id", log.id);
    return json(500, { error: E.ratingFailed });
  }
  return json(200, { ok: true });
}
