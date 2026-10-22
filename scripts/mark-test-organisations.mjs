// Marks organisations as test (hidden from the public pages and from the default Organisations list) or switches the label back. A label only:
// the one thing this script writes is organisations.is_test. It never deletes or changes anything else, and it refuses Arrow, Redbull and EKL.
//   node scripts/mark-test-organisations.mjs list                 every organisation, whether it is marked, and its events
//   node scripts/mark-test-organisations.mjs mark <slug> [...]    mark as test
//   node scripts/mark-test-organisations.mjs unmark <slug> [...]  switch the label back (one command undoes any mark)
import { loadEnv, need } from "./env.mjs";

loadEnv();
need(["SUPABASE_PROJECT_REF", "SUPABASE_ACCESS_TOKEN"]);

const REAL = ["arrow", "redbull", "ekl"];
const api = `https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`;

async function sql(query) {
  const res = await fetch(api, { method: "POST", headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body?.message ?? "request failed"}`);
  return body;
}

const [command, ...slugs] = process.argv.slice(2);
if (!["list", "mark", "unmark"].includes(command ?? "")) {
  console.error("Use: list | mark <slug> [...] | unmark <slug> [...]");
  process.exit(1);
}

if (command === "list") {
  const rows = await sql(`select o.slug, o.name, o.is_test, o.archived_at is not null as archived, (select count(*) from public.events e where e.organisation_id = o.id) as events from public.organisations o order by o.created_at`);
  for (const r of rows) console.log(`${r.is_test ? "TEST" : "    "}  ${r.slug.padEnd(22)} ${String(r.events).padStart(3)} events  ${r.archived ? "archived  " : ""}${r.name}`);
  process.exit(0);
}

if (!slugs.length || slugs.some((s) => !/^[a-z0-9][a-z0-9-]*$/.test(s))) {
  console.error("Give one or more organisation web addresses (slugs), for example rls-a-f2156156.");
  process.exit(1);
}
if (command === "mark") {
  const real = slugs.filter((s) => REAL.includes(s));
  if (real.length) {
    console.error(`Refused: ${real.join(", ")} is a real organisation and cannot be marked as test.`);
    process.exit(1);
  }
}
const list = slugs.map((s) => `'${s}'`).join(", ");
const found = await sql(`select slug from public.organisations where slug in (${list})`);
const missing = slugs.filter((s) => !found.some((f) => f.slug === s));
if (missing.length) {
  console.error(`Not found, nothing changed: ${missing.join(", ")}`);
  process.exit(1);
}
const value = command === "mark";
await sql(`update public.organisations set is_test = ${value} where slug in (${list})`);
const after = await sql(`select slug, is_test from public.organisations where slug in (${list}) order by slug`);
for (const r of after) console.log(`${r.slug}: ${r.is_test ? "marked as test" : "not marked as test"}`);
