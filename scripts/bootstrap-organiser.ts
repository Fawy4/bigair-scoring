// Creates an organiser login and their organisation (invite-only sign-in: magic links cannot create users).
//   ORGANISER_EMAIL=you@example.com npm run bootstrap:organiser
//   npm run bootstrap:organiser -- --email you@example.com [--org-name "Arrow Big Air"] [--org-slug arrow-big-air]
// Idempotent. The user is created already confirmed; they then sign in with a magic link at /org/login.
// If the "Demo organisation" exists (demo seed) the organiser is added as its owner too.
import { z } from "zod";
import { loadEnv, need } from "./env.mjs";
import { createServiceClient } from "../src/lib/supabase/service";

loadEnv();
need(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const email = z.string().email().safeParse(arg("email") ?? process.env.ORGANISER_EMAIL);
if (!email.success) {
  console.error("Give the organiser's email: ORGANISER_EMAIL=you@example.com npm run bootstrap:organiser");
  process.exit(1);
}
const orgName = arg("org-name") ?? "Arrow Big Air";
const orgSlug = arg("org-slug") ?? "arrow-big-air";
const db = createServiceClient();

async function findUser(address: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email?.toLowerCase() === address.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  const address = email.data!;
  let user = await findUser(address);
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({ email: address, email_confirm: true });
    if (error) throw new Error(`could not create the login: ${error.message}`);
    user = data.user;
    console.log("  created login");
  } else console.log("  login already exists");

  let { data: org } = await db.from("organisations").select("id").eq("slug", orgSlug).maybeSingle();
  if (!org) {
    const { data, error } = await db.from("organisations").insert({ name: orgName, slug: orgSlug }).select("id").single();
    if (error) throw new Error(error.message);
    org = data;
    console.log(`  created organisation "${orgName}"`);
  } else console.log(`  organisation "${orgName}" already exists`);

  const orgs = [{ id: org.id, name: orgName }];
  const { data: demo } = await db.from("organisations").select("id, name").eq("slug", "demo-org").maybeSingle();
  if (demo && demo.id !== org.id) orgs.push(demo);
  for (const o of orgs) {
    const { error } = await db.from("memberships").upsert({ organisation_id: o.id, user_id: user.id, role: "owner" }, { onConflict: "organisation_id,user_id" });
    if (error) throw new Error(error.message);
    console.log(`  ${address} is owner of "${o.name}"`);
  }
}

main().catch((e) => {
  console.error(`FAILED: ${e.message}`);
  process.exit(1);
});
