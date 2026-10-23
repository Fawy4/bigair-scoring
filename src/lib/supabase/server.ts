import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { testOrganisationHeaders } from "@/lib/public/test-events";
import type { Database } from "./database.types";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: testOrganisationHeaders() },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component: cookies are read-only there; safe to ignore.
          }
        },
      },
    },
  );
}
