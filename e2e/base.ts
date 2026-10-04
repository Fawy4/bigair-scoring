import { test as base, expect, type BrowserContext } from "@playwright/test";
import { EVENT_FOLD_IDS, foldKey } from "../src/lib/org/fold-state";

/**
 * In sandboxes where all outbound HTTPS goes through a TLS-inspecting proxy, Chromium does not trust the proxy's
 * certificate. There, calls to Supabase are forwarded from Playwright's Node side (which trusts the proxy CA).
 * On a normal machine (no HTTPS_PROXY) this does nothing.
 */
export async function installSupabaseProxy(context: BrowserContext): Promise<void> {
  if (!process.env.HTTPS_PROXY) return;
  await context.route(/https:\/\/[a-z0-9]+\.supabase\.co\//, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response });
  });
}

export const test = base.extend<{ foldCardsOpen: boolean }>({
  // Polish 3, item 11: the Event step's cards start folded. Most tests are about what is inside them, so every browser starts with them remembered as open (a person's own
  // choice, as stored by the page); e2e/fold-cards.spec.ts turns this off to see the real defaults.
  foldCardsOpen: [true, { option: true }],
  context: async ({ context, foldCardsOpen }, provide) => {
    await installSupabaseProxy(context);
    if (foldCardsOpen) {
      await context.addInitScript((keys: string[]) => {
        try {
          for (const k of keys) if (window.localStorage.getItem(k) === null) window.localStorage.setItem(k, "open");
        } catch {
          /* no storage on this page */
        }
      }, EVENT_FOLD_IDS.map(foldKey));
    }
    await provide(context);
  },
});
export { expect };

/** Closes the extra phones a test opened. Requests still in flight (the heartbeat) are given up on quietly, not reported as errors. */
export async function closePhones(list: BrowserContext[]): Promise<void> {
  while (list.length) {
    const context = list.pop()!;
    await context.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
    await context.close().catch(() => {});
  }
}
