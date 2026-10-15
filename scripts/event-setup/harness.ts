// Lets a script call the app's own server actions (the ones the organiser's setup steps use) as a signed-in organiser, outside Next.js.
// Only what Next.js supplies is replaced (cookies, headers, cache refresh) and the one place that opens the database connection; every action runs unchanged.
import Module from "node:module";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Loader = (request: string, parent: unknown, isMain: boolean) => unknown;
const M = Module as unknown as { _load: Loader; _resolveFilename: (request: string, parent: unknown, isMain: boolean) => string };

export interface Session {
  client: SupabaseClient;
  userId: string;
  orgId: string;
}

let current: Session | null = null;
let installed = false;

const SERVER_CLIENT = path.resolve(process.cwd(), "src/lib/supabase/server.ts");

/** Installs the replacements once. Call before the first import of any action. */
export function install(): void {
  if (installed) return;
  installed = true;
  const original = M._load;
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const stubs: Record<string, unknown> = {
    "next/cache": { revalidatePath() {}, revalidateTag() {} },
    "next/headers": {
      cookies: async () => ({ get: (name: string) => (name === "bigair_org" && current ? { name, value: current.orgId } : undefined), getAll: () => [], set() {} }),
      headers: async () => new Headers({ host: new URL(origin).host, "x-forwarded-proto": new URL(origin).protocol.replace(":", "") }),
    },
  };
  M._load = function (request, parent, isMain) {
    if (request in stubs) return stubs[request];
    let resolved: string | null = null;
    if (request.endsWith("supabase/server")) {
      try {
        resolved = M._resolveFilename(request, parent, isMain);
      } catch {
        resolved = null;
      }
    }
    if (resolved === SERVER_CLIENT) {
      return {
        createClient: async () => {
          if (!current) throw new Error("No organiser is signed in for this script.");
          return current.client;
        },
      };
    }
    return original.call(this, request, parent, isMain);
  };
}

/** Signs in as one member of the organisation without an e-mail: the same sign-in link the browser tests use, opened here. Returns the session the actions will run as. */
export async function signInAs(orgId: string, userId: string, email: string): Promise<Session> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw new Error(`Could not prepare the sign-in: ${link.error.message}`);
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: true } });
  const verified = await client.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: "magiclink" });
  if (verified.error || !verified.data.user) throw new Error(`Could not sign in: ${verified.error?.message}`);
  current = { client, userId: verified.data.user.id, orgId };
  if (verified.data.user.id !== userId) throw new Error("Signed in as a different account than expected.");
  return current;
}
