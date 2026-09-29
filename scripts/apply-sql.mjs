// Applies supabase/migrations/*.sql (or one --file) to the hosted project over HTTPS using the
// Management API, because a direct Postgres connection (`supabase db push`) is blocked in some
// environments. Records applied migrations in supabase_migrations.schema_migrations (same table the
// CLI uses). Needs SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN. Never prints secrets.
//   node scripts/apply-sql.mjs            apply pending migrations
//   node scripts/apply-sql.mjs --status   list applied / pending
//   node scripts/apply-sql.mjs --file supabase/seed.sql   run one file (not recorded)
import { readdirSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { loadEnv, need } from "./env.mjs";

loadEnv();
need(["SUPABASE_PROJECT_REF", "SUPABASE_ACCESS_TOKEN"]);

const api = `https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`;

export async function query(sql) {
  const res = await fetch(api, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg = typeof body === "object" && body ? body.message ?? JSON.stringify(body) : String(body);
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
  return body;
}

const TRACK = `
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key, statements text[], name text
);`;

const args = process.argv.slice(2);
const fileArg = args.includes("--file") ? args[args.indexOf("--file") + 1] : null;

async function main() {
  if (fileArg) {
    await query(readFileSync(fileArg, "utf8"));
    console.log(`Ran ${fileArg}`);
    return;
  }
  await query(TRACK);
  const done = new Set((await query("select version from supabase_migrations.schema_migrations")).map((r) => r.version));
  const files = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
  if (args.includes("--status")) {
    for (const f of files) console.log(`${done.has(f.split("_")[0]) ? "applied " : "pending "} ${f}`);
    return;
  }
  let n = 0;
  for (const f of files) {
    const [version, ...rest] = f.replace(/\.sql$/, "").split("_");
    if (done.has(version)) continue;
    const sql = readFileSync(`supabase/migrations/${f}`, "utf8");
    // One request = one implicit transaction: a failing statement rolls the whole migration back.
    const record = `\ninsert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${rest.join("_")}');`;
    try {
      await query(sql + record);
    } catch (e) {
      console.error(`FAILED ${basename(f)}: ${e.message}`);
      process.exit(1);
    }
    console.log(`applied ${f}`);
    n++;
  }
  console.log(n ? `${n} migration(s) applied.` : "Nothing to apply: database is up to date.");
}

if (import.meta.url === `file://${process.argv[1]}`) main();
