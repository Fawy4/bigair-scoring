import { test, expect, installSupabaseProxy } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";
import { createOrganiser } from "./organiser";

// Phase 7a-2: a screenshot of every organiser and admin screen at 1280 and 390 px, Daylight and Dark, plus the checks that go with them (no sideways scrolling,
// no control under the control height, nothing painted white on a dark page). Runs only when SHOTS names a folder: `SHOTS=/tmp/shots npx playwright test design-system-shots`.
// One throwaway organisation with a live world, and one throwaway platform owner; Arrow, EKL and Demo are never touched.
const OUT = process.env.SHOTS;
test.skip(!OUT, "set SHOTS to a folder to take the screenshots");
test.describe.configure({ mode: "serial" });

let w: LiveWorld;
let owner: Awaited<ReturnType<typeof createOrganiser>>;
test.beforeAll(async () => {
  w = await createLiveWorld();
  owner = await createOrganiser({ platformAdmin: "owner" });
});
test.afterAll(async () => {
  await w?.cleanup();
  await owner?.cleanup();
});

const VIEWPORTS = [
  { key: "1280", width: 1280, height: 900, touch: false },
  { key: "390", width: 390, height: 844, touch: true },
] as const;
const THEMES = ["day", "dark"] as const;

const orgPages = (id: string): Array<[string, string]> => [
  ["org-home", "/org"],
  ["org-settings", "/org/settings"],
  ["org-feedback", "/org/feedback"],
  ["org-new-event", "/org/events/new"],
  ["org-set-password", "/org/set-password"],
  ["event-dashboard", `/org/events/${id}`],
  ["event-event", `/org/events/${id}/event`],
  ["event-divisions", `/org/events/${id}/divisions`],
  ["event-riders", `/org/events/${id}/riders`],
  ["event-officials", `/org/events/${id}/officials`],
  ["event-draw", `/org/events/${id}/draw`],
  ["event-schedule", `/org/events/${id}/schedule`],
];
const adminPages = (orgId: string): Array<[string, string]> => [
  ["admin-home", "/admin"],
  ["admin-organisations", "/admin/organisations"],
  ["admin-organisation-new", "/admin/organisations/new"],
  ["admin-organisation", `/admin/organisations/${orgId}`],
  ["admin-audit", "/admin/audit"],
  ["admin-feedback", "/admin/feedback"],
  ["admin-health", "/admin/health"],
  ["admin-presets", "/admin/presets"],
  ["admin-settings", "/admin/settings"],
  ["admin-tricks", "/admin/tricks"],
];

for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`organiser and admin screens at ${vp.key} px, ${theme}`, async ({ browser }) => {
      test.setTimeout(600_000);
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch, deviceScaleFactor: 1 });
      await installSupabaseProxy(context);
      await context.addInitScript((t) => {
        try {
          window.localStorage.setItem("bigair.beach-theme", t);
        } catch {
          /* not saved */
        }
      }, theme);
      const page = await context.newPage();
      const problems: string[] = [];
      const visit = async (name: string, path: string) => {
        await page.goto(path, { waitUntil: "networkidle" });
        await page.screenshot({ path: `${OUT}/${name}-${vp.key}-${theme}.png`, fullPage: true });
        const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (sideways > 1) problems.push(`${name}: scrolls sideways by ${sideways} px`);
        // a control under the control height (40 px on a computer, 44 on touch)
        const small = await page.evaluate((min) => {
          const out: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>("main button, main select, main textarea, main input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]):not([type=color])")) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && r.height < min - 0.5) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.height)}px`);
          }
          return out.slice(0, 6);
        }, vp.touch ? 44 : 40);
        if (small.length) problems.push(`${name}: controls under ${vp.touch ? 44 : 40} px: ${small.join("; ")}`);
        if (theme === "dark") {
          // nothing large painted white (or near white) on a dark page
          const white = await page.evaluate(() => {
            const out: string[] = [];
            for (const el of document.querySelectorAll<HTMLElement>("body *")) {
              const r = el.getBoundingClientRect();
              if (r.width < 24 || r.height < 24) continue;
              const m = getComputedStyle(el).backgroundColor.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/);
              if (m && Number(m[4] ?? 1) > 0.5 && Number(m[1]) > 225 && Number(m[2]) > 225 && Number(m[3]) > 225) out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`);
            }
            return out.slice(0, 5);
          });
          if (white.length) problems.push(`${name}: white panels in Dark: ${white.join("; ")}`);
        }
      };
      await w.org.signIn(page, "/org");
      for (const [name, path] of orgPages(w.eventId)) await visit(name, path);
      await owner.signIn(page, "/admin");
      for (const [name, path] of adminPages(w.org.orgId)) await visit(name, path);
      await context.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
      await context.close();
      expect(problems, problems.join("\n")).toEqual([]);
    });
  }
}
