import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";

export const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const ENV_OK = Boolean(URL_ && PUBLISHABLE && SECRET);

const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
export const service = (): SupabaseClient => createClient(URL_!, SECRET!, opts);
export const anonClient = (): SupabaseClient => createClient(URL_!, PUBLISHABLE!, opts);

export async function signedIn(email: string, password: string): Promise<SupabaseClient> {
  const c = anonClient();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for test user: ${error.message}`);
  return c;
}

/** Every failure a test expects: RLS denial, missing grant, or a named error raised by a function. */
export function failed(res: { error: { message: string; code?: string } | null; data?: unknown }): string {
  return res.error ? `${res.error.code ?? ""} ${res.error.message}` : "";
}

export const run = randomBytes(4).toString("hex");
export const uuid = randomUUID;

export interface Fixture {
  s: SupabaseClient;
  clients: Record<"anon" | "orgA" | "orgB" | "j1" | "j2" | "j3" | "head" | "spotter" | "announcer" | "revoked" | "bJudge", SupabaseClient>;
  ids: Record<string, string>;
  userIds: Record<string, string>;
  cleanup: () => Promise<void>;
}

/** One throwaway world: two organisations, events (published/draft), a division with a 3-attempt cap, heats in every state, and a bound seat for each official role. Removed by cleanup(). */
export async function buildFixture(): Promise<Fixture> {
  const s = service();
  const password = `Pw-${randomBytes(12).toString("hex")}`;
  const userIds: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const created: string[] = [];

  const user = async (key: string) => {
    const email = `rls-${run}-${key}@example.com`;
    const { data, error } = await s.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser ${key}: ${error.message}`);
    userIds[key] = data.user.id;
    created.push(data.user.id);
    return { email, id: data.user.id };
  };
  const ins = async <T>(table: string, row: object): Promise<T & { id: string }> => {
    const { data, error } = await s.from(table).insert(row).select().single();
    if (error) throw new Error(`insert ${table}: ${error.message}`);
    return data as T & { id: string };
  };

  // Organisations and organisers
  const oa = await user("orgA");
  const ob = await user("orgB");
  ids.orgA = (await ins("organisations", { name: `RLS test A ${run}`, slug: `rls-a-${run}` })).id;
  ids.orgB = (await ins("organisations", { name: `RLS test B ${run}`, slug: `rls-b-${run}` })).id;
  await ins("memberships", { organisation_id: ids.orgA, user_id: oa.id, role: "owner" });
  await ins("memberships", { organisation_id: ids.orgB, user_id: ob.id, role: "owner" });

  const evBase = { timezone: "Africa/Cairo", start_date: "2026-10-10", end_date: "2026-10-11" };
  ids.evA1 = (await ins("events", { ...evBase, organisation_id: ids.orgA, name: "A1 published", slug: `rls-a1-${run}`, status: "published", settings: { publicLiveScores: "live", judgeGraceSec: 180 } })).id;
  ids.evA2 = (await ins("events", { ...evBase, organisation_id: ids.orgA, name: "A2 draft", slug: `rls-a2-${run}`, status: "draft" })).id;
  ids.evB1 = (await ins("events", { ...evBase, organisation_id: ids.orgB, name: "B1 published", slug: `rls-b1-${run}`, status: "published" })).id;

  // Scoring models: A's model is used by the published event, a second one only by the draft event
  const model = { heat: { duplicateWindowSec: 20 } };
  ids.modelA1 = (await ins("scoring_models", { organisation_id: ids.orgA, key: `rls-${run}-1`, name: "A model 1", version: 1, json: model, content_hash: "x" })).id;
  ids.modelA2 = (await ins("scoring_models", { organisation_id: ids.orgA, key: `rls-${run}-2`, name: "A model 2", version: 1, json: model, content_hash: "y" })).id;
  ids.panelA1 = (await ins("panels", { event_id: ids.evA1, name: "Panel 1" })).id;
  ids.divA1 = (await ins("divisions", { event_id: ids.evA1, name: "Pro", sort_order: 1, scoring_model_id: ids.modelA1, scoring_overrides: { heat: { maxAttemptsPerRider: 3 } }, panel_id: ids.panelA1 })).id;
  ids.divA2 = (await ins("divisions", { event_id: ids.evA2, name: "Draft division", sort_order: 1, scoring_model_id: ids.modelA2 })).id;
  ids.divB1 = (await ins("divisions", { event_id: ids.evB1, name: "B Pro", sort_order: 1 })).id;

  // Riders and entries (personal data lives on riders)
  for (const [k, n] of [["r1", "Ana"], ["r2", "Ben"], ["r3", "Cy"], ["r4", "Di"]] as const) {
    const r = await ins<{ id: string }>("riders", { organisation_id: ids.orgA, first_name: n, last_name: "Test", nationality: "EG", email: `${n}@private.example.com`, phone: "+201000000000" });
    ids[k] = r.id;
    ids["e" + k.slice(1)] = (await ins("entries", { division_id: ids.divA1, rider_id: r.id, seed: Number(k.slice(1)), status: "confirmed", source: "manual", identifiers: { vest_colour: "red" } })).id;
  }
  ids.rB = (await ins("riders", { organisation_id: ids.orgB, first_name: "Bea", last_name: "Other", email: "bea@private.example.com" })).id;
  ids.eB = (await ins("entries", { division_id: ids.divB1, rider_id: ids.rB, seed: 1, status: "confirmed", source: "manual" })).id;

  // Rounds and heats in every state
  ids.round = (await ins("rounds", { division_id: ids.divA1, sort_order: 1, name: "Round 1", short_name: "R1", spec: {} })).id;
  const heat = async (key: string, number: number, patch: object) => {
    ids[key] = (await ins("heats", { round_id: ids.round, division_id: ids.divA1, event_id: ids.evA1, number, duration_sec: 600, ...patch })).id;
  };
  const ago = (sec: number) => new Date(Date.now() - sec * 1000).toISOString();
  await heat("H1", 1, { status: "running", started_at: ago(60) });                       // live
  await heat("H2", 2, { status: "scheduled" });                                          // not started
  await heat("H3", 3, { status: "ended", started_at: ago(3600), ended_at: ago(3000) });  // ended long ago
  await heat("H4", 4, { status: "running", started_at: ago(650), duration_sec: 600 });   // timer expired 50 s ago: inside the grace period
  await heat("H5", 5, { status: "running", started_at: ago(3000), duration_sec: 600 });  // timer expired long ago: past grace
  await heat("H6", 6, { status: "scheduled" });                                          // state machine tests
  for (const h of ["H1", "H2", "H3", "H4", "H5", "H6"]) {
    for (const [pos, e] of [[1, "e1"], [2, "e2"], [3, "e3"]] as const) await ins("heat_slots", { heat_id: ids[h], position: pos, entry_id: ids[e] });
  }
  const dbAttempt = async (heatKey: string, entryKey: string, seq: number) =>
    (await ins("trick_attempts", { heat_id: ids[heatKey], entry_id: ids[entryKey], seq, status: "landed", trick_name: "Backroll", client_key: uuid() })).id;
  ids.attH1 = await dbAttempt("H1", "e1", 1);
  ids.attH2 = await dbAttempt("H2", "e1", 1);
  ids.attH3 = await dbAttempt("H3", "e1", 1);
  ids.attH4 = await dbAttempt("H4", "e1", 1);
  ids.attH5 = await dbAttempt("H5", "e1", 1);

  // Officials: every seat is a real (non-anonymous) test user, to stay clear of the anonymous sign-in rate limit; one real anonymous join is tested separately
  const seatDefs: Array<[string, string, "judge" | "head" | "spotter" | "announcer", boolean, string]> = [
    ["j1", "Judge 1", "judge", true, ids.evA1], ["j2", "Judge 2", "judge", true, ids.evA1], ["j3", "Judge 3 (off panel)", "judge", true, ids.evA1],
    ["head", "Head judge", "head", false, ids.evA1], ["spotter", "Spotter", "spotter", false, ids.evA1],
    ["announcer", "Announcer", "announcer", false, ids.evA1], ["revoked", "Revoked judge", "judge", true, ids.evA1], ["bJudge", "B judge", "judge", true, ids.evB1],
  ];
  const clients: Record<string, SupabaseClient> = { anon: anonClient() };
  for (const [key, name, role, scores, eventId] of seatDefs) {
    const u = await user(key);
    const seat = await ins<{ id: string }>("judge_seats", { event_id: eventId, name, role, scores, auth_user_id: u.id, status: "active", active: true });
    ids["seat_" + key] = seat.id;
    clients[key] = await signedIn(u.email, password);
  }
  for (const key of ["j1", "j2"]) await ins("panel_members", { panel_id: ids.panelA1, judge_seat_id: ids["seat_" + key], seat_no: key === "j1" ? 1 : 2 });
  await s.from("judge_seats").update({ active: false }).eq("id", ids.seat_revoked);
  clients.orgA = await signedIn(oa.email, password);
  clients.orgB = await signedIn(ob.email, password);

  const cleanup = async () => {
    await s.from("scoring_models").delete().eq("key", `rls-${run}-system`);
    for (const org of [ids.orgA, ids.orgB]) if (org) await s.rpc("purge_organisation", { p_org: org });
    for (const id of created) await s.auth.admin.deleteUser(id);
  };
  return { s, clients: clients as Fixture["clients"], ids, userIds, cleanup };
}
