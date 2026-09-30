// Rewrites src/lib/supabase/database.types.ts from the hosted project's current schema (Management API, over HTTPS).
// Needs SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN. Never prints secrets.
import { writeFileSync } from "node:fs";
import { loadEnv, need } from "./env.mjs";

loadEnv();
need(["SUPABASE_PROJECT_REF", "SUPABASE_ACCESS_TOKEN"]);
const res = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/types/typescript?included_schemas=public`, {
  headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` },
});
if (!res.ok) {
  console.error(`Could not read the schema types (HTTP ${res.status}).`);
  process.exit(1);
}
const { types } = await res.json();
writeFileSync("src/lib/supabase/database.types.ts", types);
console.log(`Wrote src/lib/supabase/database.types.ts (${types.length} characters).`);
