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
