/**
 * The preview of a simulation event on the public pages. Every public door answers "not found" for a simulation event, on purpose. The one exception is its own
 * organiser, signed in, after pressing a public "View as…" button: the button sets this cookie, and the public pages then read as that organiser (not as a visitor)
 * for this one event. The database makes the final decision (private.event_is_public: an organiser of the simulation event, nobody else).
 */
export const SIM_PREVIEW_COOKIE = "bigair_sim_preview";

/** The cookie holds "slug:eventId"; a public loader asks about one slug or one event id. */
export function previewMatches(cookieValue: string | undefined, key: { slug?: string; eventId?: string }): boolean {
  if (!cookieValue) return false;
  const [slug, eventId] = cookieValue.split(":");
  if (!slug || !eventId) return false;
  return (key.slug !== undefined && key.slug.toLowerCase() === slug) || (key.eventId !== undefined && key.eventId === eventId);
}
