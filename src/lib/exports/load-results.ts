import type { Access } from "@/lib/exports/access";
import { excludeSimulations } from "@/lib/exports/exclude-simulations";
import { draftHeatRows, type DraftHeat } from "@/lib/export-format/draft-heats";
import type { ResultsExportInput } from "@/lib/export-format/results-export";
import type { PublicDrawPayload, PublicResults, PublicRules, PublicSite } from "@/lib/public/types";
import { copy } from "@/lib/ui-copy";

type Ok = Extract<Access, { ok: true }>;
const R = copy.exportFiles.refused;

const allowed = <T extends { allowed?: boolean }>(data: unknown): T | null => (data && (data as T).allowed ? (data as T) : null);

/** Who published each heat, in words, from the audit log (the head judge's seat name, or the organiser's e-mail). A heat whose line names nobody is left out, never guessed. */
async function publisherNames(a: Ok): Promise<Map<string, string>> {
  const { data } = await a.service.from("audit_log").select("row_id, actor_user_id, actor_seat_id, at").eq("event_id", a.event.id).eq("action", "heat_published").order("at", { ascending: false });
  const latest = new Map<string, { user: string | null; seat: string | null }>();
  for (const r of data ?? []) if (r.row_id && !latest.has(r.row_id)) latest.set(r.row_id, { user: r.actor_user_id, seat: r.actor_seat_id });
  const seatIds = [...new Set([...latest.values()].map((x) => x.seat).filter((x): x is string => Boolean(x)))];
  const { data: seats } = seatIds.length ? await a.service.from("judge_seats").select("id, name").in("id", seatIds) : { data: [] as Array<{ id: string; name: string }> };
  const seatName = new Map((seats ?? []).map((s) => [s.id, s.name] as const));
  const userIds = [...new Set([...latest.values()].filter((x) => !x.seat || !seatName.has(x.seat)).map((x) => x.user).filter((x): x is string => Boolean(x)))];
  const emails = new Map<string, string>();
  await Promise.all(
    userIds.map(async (id) => {
      const { data: u } = await a.service.auth.admin.getUserById(id);
      if (u.user?.email) emails.set(id, u.user.email);
    }),
  );
  const out = new Map<string, string>();
  for (const [heat, who] of latest) {
    const name = (who.seat ? seatName.get(who.seat) : undefined) ?? (who.user ? emails.get(who.user) : undefined);
    if (name) out.set(heat, name);
  }
  return out;
}

/**
 * Everything the two results files are made from. The released results, the site, the rules and the ladder come from the database's public functions, called as the
 * person pressing the button: the visibility rules are the public's own (a heat under review or held is not in them), so the files cannot show more than the
 * public results page. Only when an organiser asked for it, heats under review or held are laid in as draft copies; nothing is written.
 */
export async function loadResultsExport(a: Ok, includeDraft: boolean, now: string = new Date().toISOString()): Promise<{ ok: true; input: ResultsExportInput } | { ok: false; sentence: string }> {
  if (excludeSimulations([a.event]).length === 0) return { ok: false, sentence: R.simulation };
  const { data: siteData } = await a.db.rpc("get_public_site", { p_slug: a.event.slug });
  const site = siteData && (siteData as { found?: boolean }).found ? (siteData as unknown as PublicSite) : null;
  if (!site) return { ok: false, sentence: R.notPublic };
  const [resultsData, rulesData, drawData, publishers] = await Promise.all([
    a.db.rpc("get_public_results", { p_event: a.event.id }),
    a.db.rpc("get_public_rules", { p_event: a.event.id }),
    a.db.rpc("get_public_draw", { p_event: a.event.id }),
    publisherNames(a),
  ]);
  const results = allowed<PublicResults>(resultsData.data);
  if (!results) return { ok: false, sentence: R.notPublic };
  const rules = allowed<PublicRules>(rulesData.data);
  const draw = allowed<PublicDrawPayload>(drawData.data);

  const draftHeatIds = new Set<string>();
  let laid = results;
  if (includeDraft) {
    const wanted: DraftHeat[] = results.divisions.flatMap((d) =>
      d.rounds.flatMap((r) =>
        r.heats.flatMap((h): DraftHeat[] => (h.status === "under_review" ? [{ id: h.id, division_id: d.id, kind: "under_review" }] : h.status === "published" && h.held ? [{ id: h.id, division_id: d.id, kind: "held" }] : [])),
      ),
    );
    const rows = await draftHeatRows(a.service, wanted, rules);
    for (const id of rows.keys()) draftHeatIds.add(id);
    // laid in as ordinary released heats, so the same rows and the same page components draw them; `draftHeatIds` is how the file and the page know they are drafts
    laid = { ...results, divisions: results.divisions.map((d) => ({ ...d, rounds: d.rounds.map((r) => ({ ...r, heats: r.heats.map((h) => (rows.has(h.id) ? { ...h, status: "published", held: false, results: rows.get(h.id)! } : h)) })) })) };
  }
  return { ok: true, input: { exportedAt: now, site, results: laid, rules, draw, draftHeatIds, includeDraft, publishers } };
}
