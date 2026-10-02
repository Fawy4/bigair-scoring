/**
 * The sign-in link in the e-mail (Supabase's default template) goes through the auth service and comes back to our page with the session in the part of the address
 * after "#", which a server never receives. This reads it: tokens, or the reason the link did not work.
 */
export type LinkHash = { kind: "session"; accessToken: string; refreshToken: string } | { kind: "expired" } | { kind: "none" };

export function parseLinkHash(hash: string): LinkHash {
  const p = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const access = p.get("access_token");
  const refresh = p.get("refresh_token");
  if (access && refresh) return { kind: "session", accessToken: access, refreshToken: refresh };
  // "error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"
  if (p.get("error") || p.get("error_code")) return { kind: "expired" };
  return { kind: "none" };
}
