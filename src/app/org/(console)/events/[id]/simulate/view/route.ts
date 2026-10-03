import { NextResponse, type NextRequest } from "next/server";
import { destinationOf, needsPreviewCookie, parseView } from "@/lib/simulator/view-as";
import { SIM_PREVIEW_COOKIE } from "@/lib/simulator/preview";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * The door behind every "View as…" button. It prepares the view and moves the tab on to the real screen:
 * a public view switches the preview on for this login (the public pages then open for this simulation, for its organiser only);
 * an official's screen first gives that seat to the organiser's own sign-in (one seat at a time); the head console as organiser lets go of any seat.
 * The database checks on every call that this person is an organiser of a simulation event.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const back = new URL(`/org/events/${id}/simulate`, request.url);
  const target = parseView(request.nextUrl.searchParams);
  if (!target || !/^[0-9a-f-]{36}$/.test(id)) return NextResponse.redirect(back);

  const user = await createClient();
  const {
    data: { user: me },
  } = await user.auth.getUser();
  if (!me || me.is_anonymous) return NextResponse.redirect(new URL("/org/login", request.url));
  const allowed = await user.rpc("sim_stats", { p_event: id });
  if (allowed.error) return NextResponse.redirect(back);

  const service = createServiceClient();
  const { data: event } = await service.from("events").select("id, slug").eq("id", id).maybeSingle();
  if (!event) return NextResponse.redirect(back);

  let role: "judge" | "head" | "spotter" | "announcer" | "observer" | undefined;
  if (target.kind === "seat") {
    const { data: seat } = await service.from("judge_seats").select("id, role").eq("id", target.seatId).eq("event_id", id).maybeSingle();
    if (!seat) return NextResponse.redirect(back);
    role = seat.role as typeof role;
    const bound = await user.rpc("sim_view_as", { p_event: id, p_seat: seat.id });
    if (bound.error || (bound.data as { ok?: boolean } | null)?.ok === false) return NextResponse.redirect(back);
  } else if (target.kind === "head-organiser") {
    await user.rpc("sim_view_as", { p_event: id, p_seat: null as never });
  }

  const response = NextResponse.redirect(new URL(destinationOf(target, event, role), request.url));
  if (needsPreviewCookie(target)) {
    response.cookies.set(SIM_PREVIEW_COOKIE, `${event.slug}:${event.id}`, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 });
  }
  return response;
}
