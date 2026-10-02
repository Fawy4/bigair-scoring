import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Requester } from "./access";
import { budgetState, monthStartUtc, type BudgetState } from "./budget";
import type { AskContext, ServerFacts } from "./context";

type Service = SupabaseClient<Database>;

/** Questions this person (or, for a visitor, this address) asked in the last hour. Limited and paused attempts do not count. */
export async function askedLastHour(s: Service, who: { userId: string | null; ipHash: string | null }, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 3600_000).toISOString();
  let q = s.from("ask_log").select("id", { count: "exact", head: true }).gte("created_at", since).in("status", ["answered", "failed"]);
  q = who.userId ? q.eq("user_id", who.userId) : q.eq("ip_hash", who.ipHash ?? "-");
  const { count } = await q;
  return count ?? 0;
}

/** This month's use of an organisation's budget. */
export async function organisationBudget(s: Service, organisationId: string, now = new Date()): Promise<BudgetState> {
  const [{ data: org }, { data: rows }] = await Promise.all([
    s.from("organisations").select("ask_monthly_budget").eq("id", organisationId).maybeSingle(),
    s.from("ask_log").select("budget_tokens").eq("organisation_id", organisationId).gte("created_at", monthStartUtc(now).toISOString()),
  ]);
  const used = (rows ?? []).reduce((n, r) => n + (r.budget_tokens ?? 0), 0);
  return budgetState(used, org?.ask_monthly_budget ?? 0);
}

/**
 * The names in the prompt, read with the person's own login (their RLS): a page cannot make the assistant name an event, division or heat the person may
 * not see. Division and heat must belong to the event.
 */
export async function serverFacts(own: SupabaseClient<Database>, ctx: AskContext, requester: Requester): Promise<ServerFacts> {
  const facts: ServerFacts = { role: requester.role, eventName: null, divisionName: null, heatLabel: null, heatStatus: null };
  const eventId = requester.eventId;
  if (!eventId) return facts;
  const [{ data: ev }, { data: div }, { data: heat }] = await Promise.all([
    own.from("events").select("name").eq("id", eventId).maybeSingle(),
    ctx.divisionId ? own.from("divisions").select("name").eq("id", ctx.divisionId).eq("event_id", eventId).maybeSingle() : Promise.resolve({ data: null }),
    ctx.heatId ? own.from("heats").select("name, number, status, divisions(name)").eq("id", ctx.heatId).eq("event_id", eventId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  facts.eventName = ev?.name ?? null;
  facts.divisionName = div?.name ?? null;
  if (heat) {
    const h = heat as { name: string | null; number: number; status: string; divisions: { name: string } | null };
    facts.heatLabel = [h.divisions?.name, h.name || `Heat ${h.number}`].filter(Boolean).join(" · ");
    facts.heatStatus = h.status;
    if (!facts.divisionName && h.divisions?.name) facts.divisionName = h.divisions.name;
  }
  return facts;
}

/** A visitor's address, never stored as it is. */
export function ipHash(ip: string | null, secret: string): string | null {
  return ip ? createHmac("sha256", secret || "ask").update(ip).digest("hex").slice(0, 32) : null;
}

export type AskLogRow = Database["public"]["Tables"]["ask_log"]["Insert"];

export async function writeLog(s: Service, row: AskLogRow): Promise<string | null> {
  const { data, error } = await s.from("ask_log").insert(row).select("id").single();
  if (error) console.error("ask_log insert failed:", error.message);
  return data?.id ?? null;
}
