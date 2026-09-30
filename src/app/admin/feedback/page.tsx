import { NotesFilters } from "@/components/feedback/notes-filters";
import { NotesList } from "@/components/feedback/notes-list";
import { loadNotes } from "@/lib/feedback/load";
import { requireAdmin } from "@/lib/platform/session";
import { copy } from "@/lib/ui-copy";
import { ExportPanel } from "./export-panel";

export const metadata = { title: copy.feedback.adminHeading };
export const dynamic = "force-dynamic";

/** Every organisation's notes (the owner); staff see only their own. Export for Claude is the owner's. */
export default async function AdminFeedbackPage({ searchParams }: { searchParams: Promise<{ tag?: string; status?: string; page?: string; event?: string }> }) {
  const filters = await searchParams;
  const { supabase, role } = await requireAdmin();
  const { notes, pages, events } = await loadNotes(supabase, filters);
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-3xl font-extrabold">{copy.feedback.adminHeading}</h1>
      <p className="max-w-3xl text-lg font-semibold">{copy.feedback.listIntro}</p>
      {role === "owner" ? <ExportPanel /> : null}
      <NotesFilters action="/admin/feedback" values={filters} pages={pages} events={events} />
      <NotesList notes={notes} canManage={role === "owner"} />
    </main>
  );
}
