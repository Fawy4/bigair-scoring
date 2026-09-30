import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

/**
 * A throwaway organiser (login + organisation) created with the service key, signed in through a magic-link token
 * so the test never depends on an inbox. Everything it creates is removed by `cleanup()`.
 */
export async function createOrganiser(options: { password?: string; platformAdmin?: "owner" | "staff" } = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const db = createClient(url, key, { auth: { persistSession: false } });
  const run = randomBytes(4).toString("hex");
  const email = `e2e-${run}@example.com`;
  const { data: created, error } = await db.auth.admin.createUser({ email, email_confirm: true, ...(options.password ? { password: options.password } : {}) });
  if (error) throw new Error(`could not create the test organiser: ${error.message}`);
  const { data: org, error: orgError } = await db.from("organisations").insert({ name: `E2E Big Air ${run}`, slug: `e2e-${run}` }).select("id").single();
  if (orgError) throw new Error(orgError.message);
  await db.from("memberships").insert({ organisation_id: org.id, user_id: created.user.id, role: "owner" });
  if (options.platformAdmin) {
    const { error: adminError } = await db.from("platform_admins").insert({ user_id: created.user.id, role: options.platformAdmin });
    if (adminError) throw new Error(adminError.message);
  }
  /** Organisations made through the screens during a test; removed with the rest in cleanup(). */
  const extraOrgSlugs: string[] = [];
  const extraUsers: string[] = [];

  return {
    run,
    email,
    orgId: org.id,
    async signIn(page: Page, next = "/org") {
      const { data, error: linkError } = await db.auth.admin.generateLink({ type: "magiclink", email });
      if (linkError) throw new Error(linkError.message);
      await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink&next=${encodeURIComponent(next)}`);
    },
    trackOrganisation: (slug: string) => void extraOrgSlugs.push(slug),
    trackUser: (id: string) => void extraUsers.push(id),
    async cleanup() {
      for (const slug of extraOrgSlugs) {
        const { data: o } = await db.from("organisations").select("id").eq("slug", slug).maybeSingle();
        if (o) await db.rpc("purge_organisation", { p_org: o.id });
      }
      for (const id of extraUsers) await db.auth.admin.deleteUser(id);
      await db.storage.from("branding").remove((await db.storage.from("branding").list(org.id)).data?.map((o) => `${org.id}/${o.name}`) ?? []);
      await db.rpc("purge_organisation", { p_org: org.id });
      await db.auth.admin.deleteUser(created.user.id);
    },
    db,
  };
}

/** 1×1 PNG used as a logo. */
export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
