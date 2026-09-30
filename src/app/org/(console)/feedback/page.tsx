import { NotesFilters } from "@/components/feedback/notes-filters";
import { NotesList } from "@/components/feedback/notes-list";
import { loadNotes } from "@/lib/feedback/load";
import { getOrgContext } from "@/lib/org/context";
import { copy } from "@/lib/ui-copy";

export const metadata = { title: copy.feedback.orgHeading };
export const dynamic = "force-dynamic";

/** The reduced list: this organisation's own notes (kind, status and screen filters), no export. */
export default async function OrgFeedbackPage({ searchParams }: { searchParams: Promise<{ tag?: string; status?: string; page?: string; event?: string }> }) {
  const filters = await searchParams;
  const { supabase, current } = await getOrgContext();
  const { notes, pages, events } = await loadNotes(supabase, filters, { organisationId: current?.id ?? "00000000-0000-0000-0000-000000000000" });
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-3xl font-extrabold">{copy.feedback.orgHeading}</h1>
      <p className="max-w-3xl text-lg font-semibold">{copy.feedback.listIntro}</p>
      <NotesFilters action="/org/feedback" values={filters} pages={pages} events={events} />
      <NotesList notes={notes} canManage={false} />
    </main>
  );
}
