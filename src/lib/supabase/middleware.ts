import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { signedInUser } from "./claims";

/** Keeps the login cookie fresh on every request and sends signed-out visitors away from organiser pages. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const path = request.nextUrl.pathname;
  // The organiser's screens and the head judge's console read who is signed in from the login token (no round trip to the auth server; the token is renewed here when it
  // is about to run out). Every press on the console is a request through here, so the round trip was part of every Pause and Publish. The database checks the
  // head judge's seat on every call (private.can_run_heat), whatever the token says. Judges, spotters and the admin pages keep asking the auth server, as before.
  const user = path.startsWith("/org") || path.startsWith("/head")
    ? await signedInUser(supabase).then((u) => (u ? { is_anonymous: u.isAnonymous } : null))
    : (await supabase.auth.getUser()).data.user;
  const isOrganiserArea = (path.startsWith("/org") && path !== "/org/login") || path === "/admin" || path.startsWith("/admin/");
  if (isOrganiserArea && (!user || user.is_anonymous)) {
    const url = request.nextUrl.clone();
    url.pathname = "/org/login";
    url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return response;
}
