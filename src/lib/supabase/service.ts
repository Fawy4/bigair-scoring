import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Service-role client: SERVER CODE ONLY (server actions, route handlers). Bypasses RLS.
export function createServiceClient() {
  if (typeof window !== "undefined") {
    throw new Error("createServiceClient must never run in the browser");
  }
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}
