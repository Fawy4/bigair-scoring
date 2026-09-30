import type { SupabaseClient, User } from "@supabase/supabase-js";

/** Finds a login by email (case-insensitive). The auth API has no lookup by email, so this pages through the users. */
export async function findUserByEmail(db: SupabaseClient, address: string): Promise<User | null> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email?.toLowerCase() === address.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}
