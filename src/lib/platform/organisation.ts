import { copy } from "@/lib/ui-copy";

/** The confirmation for deleting an organisation: the exact slug, ignoring capitals and spaces around it. */
export function slugMatches(slug: string, typed: string): boolean {
  return slug.length > 0 && typed.trim().toLowerCase() === slug.toLowerCase();
}

/** A plain-language reason why the organisation cannot be deleted, or null when it can. Published results are permanent. */
export function deleteBlockedReason(publishedResults: number): string | null {
  return publishedResults > 0 ? copy.admin.org.deleteBlocked(publishedResults) : null;
}

export function organisationStatus(archivedAt: string | null | undefined): "active" | "archived" {
  return archivedAt ? "archived" : "active";
}

/** The link that signs an invited organiser in without an inbox (the same route the email link uses). */
export function inviteConfirmLink(siteUrl: string, hashedToken: string): string {
  const url = new URL("/auth/confirm", siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`);
  url.searchParams.set("token_hash", hashedToken);
  url.searchParams.set("type", "magiclink");
  url.searchParams.set("next", "/org");
  return url.toString();
}

/** Web addresses that start with e2e- (browser tests) or rls-, plat-, evdel- (database tests) are automated test data; the admin list flags them. */
export function isTestData(slug: string): boolean {
  return /^(e2e|rls|plat|evdel)-/.test(slug);
}

/** Why an event cannot be deleted (published results are permanent), or null when it can. */
export function eventDeleteBlockedReason(publishedResults: number): string | null {
  return publishedResults > 0 ? copy.eventLifecycle.deleteBlocked(publishedResults) : null;
}
