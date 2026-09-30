import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { FeedbackNote, FeedbackRole, FeedbackTag } from "./format";

export interface NoteFilters {
  tag?: string;
  status?: string;
  page?: string;
  event?: string;
}

export interface NoteRow extends FeedbackNote {
  exportedAt: string | null;
  doneAt: string | null;
  screenshotPath: string | null;
}

/** The notes the caller may see (the database decides: an owner sees all, an organiser their own organisation's), newest first. */
export async function loadNotes(supabase: SupabaseClient<Database>, filters: NoteFilters = {}, options: { signLinks?: number; organisationId?: string } = {}): Promise<{ notes: NoteRow[]; pages: string[]; events: string[] }> {
  let query = supabase
    .from("feedback_notes")
    .select("id, tag, status, page_label, event_name, organisation_name, division_name, heat_label, author_role, body, screenshot_path, exported_at, done_at, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (options.organisationId) query = query.eq("organisation_id", options.organisationId);
  const { data } = await query;
  const all = data ?? [];
  const pages = [...new Set(all.map((n) => n.page_label))].sort((a, b) => a.localeCompare(b, "en"));
  const events = [...new Set(all.map((n) => n.event_name).filter((e): e is string => Boolean(e)))].sort((a, b) => a.localeCompare(b, "en"));
  const shown = all.filter(
    (n) => (!filters.tag || n.tag === filters.tag) && (!filters.status || n.status === filters.status) && (!filters.page || n.page_label === filters.page) && (!filters.event || n.event_name === filters.event),
  );
  const paths = shown.map((n) => n.screenshot_path).filter((p): p is string => Boolean(p));
  const links = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("feedback").createSignedUrls(paths, options.signLinks ?? 3600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) links.set(s.path, s.signedUrl);
  }
  return {
    pages,
    events,
    notes: shown.map((n) => ({
      id: n.id,
      tag: n.tag as FeedbackTag,
      status: n.status as "open" | "done",
      pageLabel: n.page_label,
      eventName: n.event_name,
      organisationName: n.organisation_name,
      divisionName: n.division_name,
      heatLabel: n.heat_label,
      role: n.author_role as FeedbackRole,
      body: n.body,
      screenshotUrl: n.screenshot_path ? (links.get(n.screenshot_path) ?? null) : null,
      screenshotPath: n.screenshot_path,
      createdAt: n.created_at,
      exportedAt: n.exported_at,
      doneAt: n.done_at,
    })),
  };
}
