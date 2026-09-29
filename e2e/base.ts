import { test as base, expect } from "@playwright/test";

/**
 * In sandboxes where all outbound HTTPS goes through a TLS-inspecting proxy, Chromium does not trust the proxy's
 * certificate. There, calls to Supabase are forwarded from Playwright's Node side (which trusts the proxy CA).
 * On a normal machine (no HTTPS_PROXY) this does nothing.
 */
export const test = base.extend({
  context: async ({ context }, provide) => {
    if (process.env.HTTPS_PROXY) {
      await context.route(/https:\/\/[a-z0-9]+\.supabase\.co\//, async (route) => {
        const response = await route.fetch();
        await route.fulfill({ response });
      });
    }
    await provide(context);
  },
});
export { expect };
