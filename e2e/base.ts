import { test as base, expect, type BrowserContext } from "@playwright/test";
import { EVENT_FOLD_IDS, foldKey } from "../src/lib/org/fold-state";

/**
 * In sandboxes where all outbound HTTPS goes through a TLS-inspecting proxy, Chromium does not trust the proxy's
 * certificate. There, calls to Supabase are forwarded from Playwright's Node side (which trusts the proxy CA).
 * On a normal machine (no HTTPS_PROXY) this does nothing.
 */
export async function installSupabaseProxy(context: BrowserContext, opts: { newViews?: boolean; officialsOnly?: boolean } = {}): Promise<void> {
  // 0.24.0: officials see the Rider sheet only. The Queue and the Trick list are hidden code that only a TEST server opens (SHOW_HIDDEN_OFFICIAL_VIEWS=1, set by
  // playwright.config.ts, never on Vercel) and only for a phone carrying the marker below, so every phone of the browser tests written before has it. A phone of the
  // tests of the new rule (`officialsOnly: true`) has no marker: it is exactly what an official's phone is on the live site.
  if (!opts.officialsOnly) {
    await context.addInitScript(() => {
      try {
        window.localStorage.setItem("bigair.testViews", "1");
      } catch {
        /* no storage on this page */
      }
    });
  }
  // Rider sheets (0.20.0): a phone that never chose a view opens a judge on the Rider sheet and a spotter on the Rider sheet. The browser tests written before
  // that drive the Queue and the Trick list, so their phones start with those two chosen (the way a person picks them with the switch); the tests of the new
  // defaults pass `newViews: true` and get a phone that never chose anything.
  if (!opts.newViews && !opts.officialsOnly) {
    await context.addInitScript(() => {
      try {
        if (window.localStorage.getItem("bigair.judgeView") === null) window.localStorage.setItem("bigair.judgeView", "queue");
        if (window.localStorage.getItem("bigair.spotterView") === null) window.localStorage.setItem("bigair.spotterView", "list");
      } catch {
        /* no storage on this page */
      }
    });
  }
  if (!process.env.HTTPS_PROXY) return;
  await context.route(/https:\/\/[a-z0-9]+\.supabase\.co\//, async (route) => {
    // A request still in flight when its test ends (the page keeps polling while the test cleans up) is dropped quietly: left alone, Playwright fails the test with the
    // request's headers, sign-in token included, in the message.
    try {
      const response = await route.fetch();
      await route.fulfill({ response });
    } catch {
      await route.abort().catch(() => undefined);
    }
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
