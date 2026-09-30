import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasExplicitNext, landingPath } from "@/lib/auth/landing";
import { readPlatformSession } from "@/lib/platform/session";

// Handles both link styles: ?token_hash=…&type=… (custom email, works in any browser) and ?code=… (default email, same browser only).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const rawNext = searchParams.get("next");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const supabase = await createClient();

  let failed = true;
  if (tokenHash && type) failed = Boolean((await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error);
  else if (code) failed = Boolean((await supabase.auth.exchangeCodeForSession(code)).error);

  if (failed) return NextResponse.redirect(`${origin}/org/login?error=link`);
  // a page they were heading for wins; otherwise platform admins land on /admin and everybody else on /org
  const isPlatformAdmin = hasExplicitNext(rawNext) ? false : Boolean((await readPlatformSession(supabase)).role);
  return NextResponse.redirect(`${origin}${landingPath({ next: rawNext, isPlatformAdmin })}`);
}
