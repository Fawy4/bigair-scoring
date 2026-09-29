import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

/**
 * A throwaway organiser (login + organisation) created with the service key, signed in through a magic-link token
 * so the test never depends on an inbox. Everything it creates is removed by `cleanup()`.
 */
export async function createOrganiser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const db = createClient(url, key, { auth: { persistSession: false } });
  const run = randomBytes(4).toString("hex");
  const email = `e2e-${run}@example.com`;
  const { data: created, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw new Error(`could not create the test organiser: ${error.message}`);
  const { data: org, error: orgError } = await db.from("organisations").insert({ name: `E2E Big Air ${run}`, slug: `e2e-${run}` }).select("id").single();
  if (orgError) throw new Error(orgError.message);
  await db.from("memberships").insert({ organisation_id: org.id, user_id: created.user.id, role: "owner" });

  return {
    run,
    email,
    orgId: org.id,
    async signIn(page: Page, next = "/org") {
      const { data, error: linkError } = await db.auth.admin.generateLink({ type: "magiclink", email });
      if (linkError) throw new Error(linkError.message);
      await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink&next=${encodeURIComponent(next)}`);
    },
    async cleanup() {
      await db.storage.from("branding").remove((await db.storage.from("branding").list(org.id)).data?.map((o) => `${org.id}/${o.name}`) ?? []);
      await db.rpc("purge_organisation", { p_org: org.id });
      await db.auth.admin.deleteUser(created.user.id);
    },
    db,
  };
}

/** 1×1 PNG used as a logo. */
export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
