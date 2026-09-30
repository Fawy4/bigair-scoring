// Makes an existing login a PLATFORM ADMIN (owner by default): the person who runs the whole platform, not one customer.
//   npm run bootstrap:platform-admin -- --email you@example.com [--role owner|staff]
//   npm run bootstrap:platform-admin                 (no --email: uses the only owner of the organisation "arrow"; --org-slug picks another)
// Idempotent. The login must already exist (npm run bootstrap:organiser creates it). Never prints secrets or full email addresses.
import { z } from "zod";
import { loadEnv, need } from "./env.mjs";
import { createServiceClient } from "../src/lib/supabase/service";
import { findUserByEmail } from "../src/lib/supabase/admin-users";

loadEnv();
need(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const role = z.enum(["owner", "staff"]).safeParse(arg("role") ?? "owner");
if (!role.success) {
  console.error('--role must be "owner" or "staff".');
  process.exit(1);
}
const orgSlug = arg("org-slug") ?? "arrow";
const db = createServiceClient();

/** a***@example.com: enough to recognise the account without printing it in full. */
const mask = (address: string) => address.replace(/^(.).*(@.*)$/, "$1***$2");

async function resolveUser() {
  const given = arg("email") ?? process.env.PLATFORM_ADMIN_EMAIL;
  if (given) {
    const parsed = z.string().email().safeParse(given);
    if (!parsed.success) throw new Error("That is not an email address.");
    const user = await findUserByEmail(db, parsed.data);
    if (!user) throw new Error(`No login exists for ${mask(parsed.data)}. Create it first: npm run bootstrap:organiser -- --email … --org-name … --org-slug …`);
    return user;
  }
  const { data: org } = await db.from("organisations").select("id").eq("slug", orgSlug).maybeSingle();
  if (!org) throw new Error(`There is no organisation "${orgSlug}". Give the login explicitly: npm run bootstrap:platform-admin -- --email you@example.com`);
  const { data: owners } = await db.from("memberships").select("user_id").eq("organisation_id", org.id).eq("role", "owner");
  if ((owners ?? []).length !== 1) throw new Error(`"${orgSlug}" has ${(owners ?? []).length} owners, so I cannot tell which one you are. Give the login explicitly: --email you@example.com`);
  const { data, error } = await db.auth.admin.getUserById(owners![0].user_id);
  if (error || !data.user) throw new Error("The owner's login could not be read.");
  return data.user;
}

async function main() {
  const user = await resolveUser();
  const label = mask(user.email ?? "unknown@unknown");
  const { error } = await db.from("platform_admins").upsert({ user_id: user.id, role: role.data! }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  console.log(`  ${label} is now platform ${role.data}`);

  const { data: org } = await db.from("organisations").select("id, name").eq("slug", orgSlug).maybeSingle();
  if (org) {
    const { data: m } = await db.from("memberships").select("role").eq("organisation_id", org.id).eq("user_id", user.id).maybeSingle();
    console.log(m ? `  still ${m.role} of "${org.name}" (organiser view keeps working)` : `  note: not a member of "${org.name}"`);
  }
  const { data: admins } = await db.from("platform_admins").select("role");
  console.log(`  platform admins now: ${(admins ?? []).filter((a) => a.role === "owner").length} owner, ${(admins ?? []).filter((a) => a.role === "staff").length} staff`);
}

main().catch((e) => {
  console.error(`FAILED: ${e.message}`);
  process.exit(1);
});
