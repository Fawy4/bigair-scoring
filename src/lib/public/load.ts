import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "react";
import { cookies } from "next/headers";
import { after } from "next/server";
import { previewMatches, SIM_PREVIEW_COOKIE } from "@/lib/simulator/preview";
import { createAnonClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createSharedCache, createValve } from "./shared-cache";
import type { PublicDrawPayload, PublicLiveHeat, PublicResults, PublicRules, PublicSite, PublicTimetable } from "./types";

/**
 * The only door of the public pages to the database: the public functions, called as a visitor. Each is read once per request (React `cache`), so a page and
 * its metadata share one answer. Null means "not public" (draft, simulation, archived, unknown): the page says not found.
 */

/**
 * Fix 2, item 1: what the crowd shares. A visitor's answer to one public function for one event is read once and kept for about 3 seconds (PUBLIC_CACHE_MS) per
 * server instance, so 300 phones refreshing cost one set of database calls per page per 3 s. The answers are exactly what the database gives a visitor (held
 * and unpublished things are never in them), so nothing private can be cached into a public response. The simulation preview (an organiser looking at their
 * own simulation) and the officials' screens never come through here.
 */
const PUBLIC_CACHE_MS = Number(process.env.PUBLIC_CACHE_MS ?? 3000);
const shared = createSharedCache({ ttlMs: PUBLIC_CACHE_MS });
/** The Flag view must show a flag change within a second: its reads never reuse an answer, they only join a read that is already on its way. */
export const freshReads = new AsyncLocalStorage<boolean>();

/** The safety valve: how many public requests one server instance works on at once before the rest get the calm "Updating…" page. */
const PUBLIC_MAX_IN_FLIGHT = Number(process.env.PUBLIC_MAX_IN_FLIGHT ?? 60);
const valve = createValve(PUBLIC_MAX_IN_FLIGHT);
/** Decided once per request. A refused request starts no database work at all; the layout shows the Updating page. Officials' paths never call this. */
export const admitPublicRequest = cache(async (): Promise<boolean> => {
  const place = valve.enter();
  if (!place) return false;
  try {
    after(place);
  } catch {
    place(); // outside a request (tests): nothing to wait for
  }
  return true;
});

const call = async <T>(fn: string, args: Record<string, unknown>): Promise<T | null> => {
  // The one exception to "as a visitor": the preview of a simulation event for its own signed-in organiser (docs/06 decisions log, simulator). The cookie names the
  // event; the database still decides (only an organiser of that simulation event gets anything), so any other event reads exactly as before.
  const jar = await cookies();
  const preview = previewMatches(jar.get(SIM_PREVIEW_COOKIE)?.value, { slug: typeof args.p_slug === "string" ? args.p_slug : undefined, eventId: typeof args.p_event === "string" ? args.p_event : undefined });
  const read = async (): Promise<T | null> => {
    const db = preview ? await createClient() : createAnonClient();
    const { data, error } = await db.rpc(fn as never, args as never);
    if (error || !data) return null;
    return data as T;
  };
  if (preview) return read();
  return shared.get(`${fn}:${JSON.stringify(args)}`, read, freshReads.getStore() ? 0 : undefined);
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
    // the preview of a simulation event: its organiser asks for the same live view through a function that checks the event is theirs
    const jar = await cookies();
    if (jar.get(SIM_PREVIEW_COOKIE)) {
      const { data } = await (await createClient()).rpc("sim_live_heat", { p_heat: heatId });
      if (data && (data as { allowed?: boolean }).allowed) return data as unknown as PublicLiveHeat;
    }
    const read = async () => {
      const { data, error } = await createServiceClient().rpc("get_live_heat_for_server" as never, { p_heat: heatId } as never);
      if (error || !data) return null;
      return allowed(data as PublicLiveHeat);
    };
    return await shared.get(`live:${heatId}`, read, freshReads.getStore() ? 0 : undefined);
  } catch {
    return null;
  }
});
