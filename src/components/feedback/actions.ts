"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { FEEDBACK_TAGS, pageLabelFor, type FeedbackRole } from "@/lib/feedback/format";
import { ORG_COOKIE } from "@/lib/org/context";
import { readPlatformSession } from "@/lib/platform/session";
import { createClient } from "@/lib/supabase/server";
import { copy } from "@/lib/ui-copy";

const T = copy.feedback.errors;

async function who() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return null;
  const platform = await readPlatformSession(supabase);
  const { data: memberships } = await supabase.from("memberships").select("organisation_id, organisations(name)").eq("user_id", user.id).order("created_at");
  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  const inside = platform.impersonating?.organisationId ?? null;
  const mine = (memberships ?? []).map((m) => ({ id: m.organisation_id, name: m.organisations?.name ?? "" }));
  const current = mine.find((m) => m.id === wanted) ?? (inside ? { id: inside, name: platform.impersonating!.name } : null) ?? mine[0] ?? null;
  const role: FeedbackRole | null = platform.role ?? (mine.length > 0 ? "organiser" : null);
  return role ? { supabase, user, role, isAdmin: Boolean(platform.role), current } : null;
}

/** Is this login an owner or an organiser? Officials (PIN sessions) and visitors are not, so they never see the Note button. */
export async function feedbackEligible(): Promise<{ eligible: boolean; role?: FeedbackRole }> {
  const w = await who();
  return w ? { eligible: true, role: w.role } : { eligible: false };
}

export interface NoteContext {
  role: FeedbackRole;
  /** Folder for a screenshot: the organisation's own, or "platform" for an owner's note from the admin screens. */
  folder: string;
  pageLabel: string;
  eventName: string | null;
  divisionName: string | null;
  heatLabel: string | null;
  organisationName: string | null;
}

const Ids = z.object({ path: z.string().min(1).max(300), division: z.string().uuid().nullish(), heat: z.string().uuid().nullish() });

/** Works out what to save with a note: the page, the event, division and heat (by name), who is writing and in which organisation. */
async function contextFor(input: z.input<typeof Ids>): Promise<({ organisationId: string | null; eventId: string | null; divisionId: string | null; heatId: string | null } & NoteContext & { userId: string; supabase: Awaited<ReturnType<typeof createClient>> }) | null> {
  const w = await who();
  const parsed = Ids.safeParse(input);
  if (!w || !parsed.success) return null;
  const path = parsed.data.path.split("?")[0];
  const onAdmin = path.startsWith("/admin");
  const organisationId = onAdmin && w.isAdmin ? null : (w.current?.id ?? null);
  if (!organisationId && !w.isAdmin) return null;
  const eventId = /^\/org\/events\/([0-9a-f-]{36})/.exec(path)?.[1] ?? null;
  let eventName: string | null = null;
  let divisionName: string | null = null;
  let heatLabel: string | null = null;
  let divisionId: string | null = null;
  let heatId: string | null = null;
  let eventOk: string | null = null;
  if (eventId) {
    const { data } = await w.supabase.from("events").select("id, name").eq("id", eventId).maybeSingle();
    if (data) {
      eventOk = data.id;
      eventName = data.name;
    }
    if (eventOk && parsed.data.division) {
      const { data: d } = await w.supabase.from("divisions").select("id, name").eq("id", parsed.data.division).eq("event_id", eventOk).maybeSingle();
      if (d) {
        divisionId = d.id;
        divisionName = d.name;
      }
    }
    if (eventOk && parsed.data.heat) {
      const { data: h } = await w.supabase.from("heats").select("id, number").eq("id", parsed.data.heat).eq("event_id", eventOk).maybeSingle();
      if (h) {
        heatId = h.id;
        heatLabel = `Heat ${h.number}`;
      }
    }
  }
  return {
    supabase: w.supabase,
    userId: w.user.id,
    role: w.role,
    folder: organisationId ?? "platform",
    organisationId,
    organisationName: organisationId ? (w.current?.id === organisationId ? w.current.name : null) : null,
    pageLabel: pageLabelFor(path),
    eventId: eventOk,
    eventName,
    divisionId,
    divisionName,
    heatId,
    heatLabel,
  };
}

/** What the Note panel says it will save. */
export async function noteContext(input: z.input<typeof Ids>): Promise<{ ok: true; context: NoteContext } | { ok: false }> {
  const c = await contextFor(input);
  if (!c) return { ok: false };
  const { pageLabel, eventName, divisionName, heatLabel, role, folder, organisationName } = c;
  return { ok: true, context: { pageLabel, eventName, divisionName, heatLabel, role, folder, organisationName } };
}

const NoteInput = Ids.extend({
  body: z.string().trim().min(1, T.empty).max(4000, T.tooLong),
  tag: z.enum(FEEDBACK_TAGS),
  screenshotPath: z.string().max(300).nullish(),
});

export async function saveNote(input: z.input<typeof NoteInput>): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = NoteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? T.empty };
  const c = await contextFor(parsed.data);
  if (!c) return { ok: false, error: T.notAllowed };
  const shot = parsed.data.screenshotPath && parsed.data.screenshotPath.startsWith(`${c.folder}/`) ? parsed.data.screenshotPath : null;
  const { error } = await c.supabase.from("feedback_notes").insert({
    organisation_id: c.organisationId,
    author_user_id: c.userId,
    author_role: c.role,
    event_id: c.eventId,
    division_id: c.divisionId,
    heat_id: c.heatId,
    page: parsed.data.path.split("?")[0],
    page_label: c.pageLabel,
    body: parsed.data.body,
    tag: parsed.data.tag,
    screenshot_path: shot,
    organisation_name: c.organisationName,
    event_name: c.eventName,
    division_name: c.divisionName,
    heat_label: c.heatLabel,
  });
  return error ? { ok: false, error: copy.feedback.failed } : { ok: true };
}
