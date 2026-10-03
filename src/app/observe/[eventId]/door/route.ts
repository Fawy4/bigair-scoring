import { NextResponse, type NextRequest } from "next/server";
import { SIM_PREVIEW_COOKIE } from "@/lib/simulator/preview";
import { createClient } from "@/lib/supabase/server";

/**
 * The public page and the big screen for an observer. For a simulation event the public pages answer "not found" to everybody except its organiser, so this
 * door switches the preview on for the observer's own login first (the database decides: only an observer or an organiser of that simulation gets anything).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const to = request.nextUrl.searchParams.get("to") === "screen" ? "screen" : "public";
  if (!/^[0-9a-f-]{36}$/.test(eventId)) return NextResponse.redirect(new URL("/join", request.url));
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/join", request.url));
  const { data: seat } = await db.from("judge_seats").select("id").eq("event_id", eventId).eq("auth_user_id", user.id).eq("role", "observer").eq("active", true).eq("status", "active").maybeSingle();
  const { data: event } = await db.from("events").select("id, slug, is_simulation").eq("id", eventId).maybeSingle();
  if (!seat || !event) return NextResponse.redirect(new URL("/join", request.url));
  const response = NextResponse.redirect(new URL(to === "screen" ? `/screen/${event.slug}` : `/e/${event.slug}`, request.url));
  if (event.is_simulation) response.cookies.set(SIM_PREVIEW_COOKIE, `${event.slug}:${event.id}`, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 });
  return response;
}
