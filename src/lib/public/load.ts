import { cache } from "react";
import { createAnonClient } from "@/lib/supabase/anon";
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
export const loadLive = cache(async (heatId: string) => allowed(await call<PublicLiveHeat>("get_public_live_heat", { p_heat: heatId })) as PublicLiveHeat | null);
