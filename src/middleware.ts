import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export function middleware(request: NextRequest) {
  return updateSession(request);
}

// Only the pages that depend on a login. Public pages never pay for a session check.
// The public pages pay for it only while the simulator's preview cookie is set (the organiser looking at their own simulation; the cookie name is spelled out
// because a matcher has to be a literal).
export const config = {
  matcher: [
    "/org/:path*",
    "/admin/:path*",
    "/seat",
    "/join",
    "/e/:slug/join",
    "/judge/:path*",
    "/spot/:path*",
    "/head/:path*",
    { source: "/e/:slug/:path*", has: [{ type: "cookie", key: "bigair_sim_preview" }] },
    { source: "/screen/:slug", has: [{ type: "cookie", key: "bigair_sim_preview" }] },
    { source: "/screen/:slug/follow/:path*", has: [{ type: "cookie", key: "bigair_sim_preview" }] },
  ],
};
