/**
 * Addresses of the rider report pages. Every part that a person can pick or type (the event's address, a rider's id) is encoded, and the preview address is built only for a
 * rider who is on the list the page itself loaded for this event, so a value taken from the screen can never become part of an address (CodeQL: DOM text reinterpreted as HTML).
 */
const enc = encodeURIComponent;

/** The rider's own page. */
export const riderPageHref = (slug: string, entryId: string): string => `/e/${enc(slug)}/riders/${enc(entryId)}`;

/** The rider's report. */
export const reportHref = (slug: string, entryId: string): string => `${riderPageHref(slug, entryId)}/report`;

/** The organiser's preview of a rider's report, or null unless `entryId` is one of this event's own riders. */
export function previewHref(slug: string | null, entryId: string, riders: ReadonlyArray<{ id: string }>): string | null {
  if (!slug) return null;
  const own = riders.find((r) => r.id === entryId);
  return own ? `${reportHref(slug, own.id)}?preview=1` : null;
}
