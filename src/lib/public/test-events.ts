/**
 * The e2e and manual-picture runs create a throwaway organisation on the shared database; its name is always "E2E Big Air" and 8 hex characters (e2e/organiser.ts, the only
 * place that makes one). The public home page leaves those organisations' events out, so a visitor never sees a test event while tests run. Test servers show them
 * (SHOW_TEST_EVENTS=1 in playwright.config.ts) because the browser tests look for exactly those events. Simulations are already left out by the database function.
 */
const THROWAWAY_ORGANISATION = /^E2E Big Air [0-9a-f]{8}$/;

export const isThrowawayTestEvent = (e: { organisation_name: string | null }) => THROWAWAY_ORGANISATION.test((e.organisation_name ?? "").trim());

export function withoutTestEvents<T extends { organisation_name: string | null }>(events: T[], showTest = process.env.SHOW_TEST_EVENTS === "1"): T[] {
  return showTest ? events : events.filter((e) => !isThrowawayTestEvent(e));
}
