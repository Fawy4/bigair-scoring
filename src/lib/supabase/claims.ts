import type { SupabaseClient } from "@supabase/supabase-js";

export interface SignedInUser {
  id: string;
  email: string | null;
  isAnonymous: boolean;
}

/**
 * Who is signed in, read from the login token on this request WITHOUT asking the auth server (the project signs its tokens with a key pair, so the signature is checked
 * here against the public key, which is kept in memory; the library falls back to asking the auth server itself if the project ever goes back to a shared secret).
 * The database trusts the same token for every query it answers, so this gives nobody access they did not have; the one thing it cannot see is a login that was
 * revoked a moment ago, which stops working when its token runs out (an hour at most). A page that must know the account is still alive (changing the password,
 * leaving the organisation) keeps using `auth.getUser()`.
 */
export async function signedInUser(supabase: SupabaseClient): Promise<SignedInUser | null> {
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims;
  if (!c?.sub) return null;
  return { id: c.sub, email: typeof c.email === "string" ? c.email : null, isAnonymous: c.is_anonymous === true };
}
