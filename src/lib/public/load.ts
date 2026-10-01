import { cache } from "react";
import { createAnonClient } from "@/lib/supabase/anon";
import { createServiceClient } from "@/lib/supabase/service";
import type { PublicDrawPayload, PublicLiveHeat, PublicResults, PublicRules, PublicSite, PublicTimetable } from "./types";

/**
 * The only door of the public pages to the database: the public functions, called as a visitor. Each is read once per request (React `cache`), so a page and
 * its metadata share one answer. Null means "not public" (draft, simulation, archived, unknown): the page says not found.
 */
const call = async <T>(fn: string, args: Record<string, unknown>): Promise<T | null> => {
  const { data, error } = await createAnonClient().rpc(fn as never, args as never);
  if (error || !data) return null;
  return data as T;
};

export const loadSite = cache(async (slug: string): Promise<PublicSite | null> => {
  const data = await call<PublicSite | { found: false }>("get_public_site", { p_slug: slug });
  return data && data.found ? data : null;
});

const allowed = <T extends { allowed: boolean }>(data: T | null): T | null => (data && data.allowed ? data : null);

export const loadTimetable = cache(async (eventId: string) => allowed(await call<PublicTimetable | { allowed: false }>("get_public_timetable", { p_event: eventId })) as PublicTimetable | null);
export const loadResults = cache(async (eventId: string) => allowed(await call<PublicResults | { allowed: false }>("get_public_results", { p_event: eventId })) as PublicResults | null);
export const loadDraw = cache(async (eventId: string) => allowed(await call<PublicDrawPayload | { allowed: false }>("get_public_draw", { p_event: eventId })) as PublicDrawPayload | null);
export const loadRules = cache(async (eventId: string) => allowed(await call<PublicRules | { allowed: false }>("get_public_rules", { p_event: eventId })) as PublicRules | null);
/**
 * The live view of a heat WITH the panel's scores by seat number, for the server only: the pages work the totals out here and send the browser nothing but the
 * panel's results. A visitor calling `get_public_live_heat` gets no scores at all. The same rules decide whether it is shown (the database answers "not allowed"
 * for a heat the public may not follow live). Null when the server has no service key or the heat may not be shown.
 */
export const loadLive = cache(async (heatId: string): Promise<PublicLiveHeat | null> => {
  try {
    const { data, error } = await createServiceClient().rpc("get_live_heat_for_server" as never, { p_heat: heatId } as never);
    if (error || !data) return null;
    return allowed(data as PublicLiveHeat);
  } catch {
    return null;
  }
});
