import Link from "next/link";
import { MASTER_VOCABULARY_KEY } from "@/lib/org/trick-vocabulary";
import { formatWhen } from "@/lib/platform/event-label";
import { getPlatformSettings } from "@/lib/platform/public-settings";
import { requireAdmin } from "@/lib/platform/session";
import type { VocabularyJson } from "@/lib/trick-base";
import { publishedIds } from "@/lib/trick-base/master";
import { copy } from "@/lib/ui-copy";
import { TrickBaseEditor, type HistoryRow, type ProposalRow } from "./editor";

export const metadata = { title: copy.trickEditor.heading };
export const dynamic = "force-dynamic";

/** Master presets → Trick base: the form editor of the master trick base, its versions, and the proposals from events (owner writes; staff look). */
export default async function TrickBasePage({ searchParams }: { searchParams: Promise<{ version?: string }> }) {
  const { supabase, role } = await requireAdmin();
  const { version: wanted } = await searchParams;
  const C = copy.trickEditor;
  const [{ data: rows }, { data: history }, { data: proposals }, { defaultTimezone }] = await Promise.all([
    supabase.from("trick_vocabularies").select("id, version, json, published_at").is("organisation_id", null).is("event_id", null).eq("key", MASTER_VOCABULARY_KEY).order("version", { ascending: false }),
    supabase.rpc("admin_trick_base_history"),
    supabase.rpc("admin_trick_proposals"),
    getPlatformSettings(),
  ]);
  const versions = (rows ?? []) as unknown as Array<{ id: string; version: number; json: VocabularyJson; published_at: string | null }>;
  if (versions.length === 0) {
    return (
      <main className="flex flex-col gap-4">
        <h1>{C.heading}</h1>
        <p className="font-semibold">{copy.trickBase.errors.noVocabulary}</p>
      </main>
    );
  }
  const working = versions[0];
  const live = versions.find((v) => v.published_at) ?? null;
  const viewing = wanted ? versions.find((v) => String(v.version) === wanted) : undefined;
  const historyRows: HistoryRow[] = (history ?? []).map((h) => ({
    id: h.id,
    version: h.version,
    published: Boolean(h.published_at),
    isLive: live?.id === h.id,
    saved: [formatWhen(h.created_at, defaultTimezone), h.created_by_email].filter(Boolean).join(" · "),
    publishedText: h.published_at ? [formatWhen(h.published_at, defaultTimezone), h.published_by_email].filter(Boolean).join(" · ") : "",
    summary: h.change_summary ?? "",
  }));
  const proposalRows: ProposalRow[] = (proposals ?? []).map((p) => ({ eventId: p.event_id, eventName: p.event_name, organisationName: p.organisation_name, family: p.family, key: p.key, label: p.label, category: p.category }));

  return (
    <main className="flex max-w-5xl flex-col gap-4">
      <Link href="/admin/presets" className="font-semibold underline">
        {copy.admin.presets.back}
      </Link>
      <TrickBaseEditor
        key={`${viewing?.version ?? "w"}-${working.version}`}
        isOwner={role === "owner"}
        working={{ id: working.id, version: working.version, json: working.json, published: Boolean(working.published_at) }}
        live={live ? { version: live.version, json: live.json } : null}
        viewing={viewing ? { version: viewing.version, json: viewing.json } : null}
        publishedIdList={[...publishedIds(versions.filter((v) => v.published_at).map((v) => v.json))]}
        history={historyRows}
        proposals={proposalRows}
      />
    </main>
  );
}
