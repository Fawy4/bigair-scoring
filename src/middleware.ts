import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export function middleware(request: NextRequest) {
  return updateSession(request);
}

// Only the pages that depend on a login. Public pages never pay for a session check.
export const config = { matcher: ["/org/:path*", "/admin/:path*", "/seat", "/join", "/e/:slug/join", "/judge/:path*", "/spot/:path*", "/head/:path*"] };
