import { copy } from "@/lib/ui-copy";

/** Rules for logo files, matching the `branding` bucket (docs: images only, 2 MB). Pure, so it is unit-tested. */
export const BRANDING_MAX_BYTES = 2 * 1024 * 1024;
export const BRANDING_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Returns a plain-language problem, or null when the file is fine. */
export function imageProblem(file: { type: string; size: number }): string | null {
  if (!BRANDING_TYPES[file.type]) return copy.logo.wrongType;
  if (file.size > BRANDING_MAX_BYTES) return copy.logo.tooBig((file.size / 1024 / 1024).toFixed(1));
  if (file.size === 0) return copy.logo.empty;
  return null;
}

/** `<organisation id>/<purpose>-<timestamp>.<ext>`: the folder is what the storage rules check. */
export function brandingPath(orgId: string, purpose: string, mime: string, now = Date.now()): string {
  const safe = purpose.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "image";
  return `${orgId}/${safe}-${now}.${BRANDING_TYPES[mime] ?? "png"}`;
}

/** The storage path behind one of our public URLs, or null when the URL points elsewhere. */
export function brandingPathFromUrl(url: string | null | undefined, orgId: string): string | null {
  if (!url) return null;
  const marker = "/storage/v1/object/public/branding/";
  const i = url.indexOf(marker);
  if (i < 0) return null;
  const path = decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
  return path.startsWith(`${orgId}/`) ? path : null;
}
