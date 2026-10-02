import { test, expect, installSupabaseProxy } from "./base";
import { createLiveWorld, type LiveWorld } from "./live-world";
import { createOrganiser } from "./organiser";

// Phase 7a-2: a screenshot of every organiser and admin screen at 1280 and 390 px, Daylight and Dark, plus the checks that go with them (no sideways scrolling,
// no control under the control height, nothing painted white on a dark page). Runs only when SHOTS names a folder: `SHOTS=/tmp/shots npx playwright test design-system-shots`.
// One throwaway organisation with a live world, and one throwaway platform owner; Arrow, EKL and Demo are never touched.
const OUT = process.env.SHOTS;
// SHOTS_ONLY=simulate limits a run to the screens whose name matches (a quick look while working on one screen)
const only = process.env.SHOTS_ONLY ? new RegExp(process.env.SHOTS_ONLY) : null;
test.skip(!OUT, "set SHOTS to a folder to take the screenshots");
test.describe.configure({ mode: "serial" });

let w: LiveWorld;
let owner: Awaited<ReturnType<typeof createOrganiser>>;
// the Simulator's control panel needs a simulation event: one copy of the live world, made through the page as the organiser would (Polish 1, item 1)
let simId = "";
test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  w = await createLiveWorld();
  owner = await createOrganiser({ platformAdmin: "owner" });
  const context = await browser.newContext();
  await installSupabaseProxy(context);
  const page = await context.newPage();
  await w.org.signIn(page, `/org/events/${w.eventId}/simulate`);
  await page.getByTestId("run-as-simulation-button").click();
  await page.getByTestId("clone-open").click();
  await page.getByTestId("sim-console").waitFor();
  simId = /events\/([0-9a-f-]{36})\/simulate/.exec(page.url())![1];
  await context.close();
});
test.afterAll(async () => {
  if (w && simId) {
    const { data } = await w.db.from("sim_seats").select("virtual_user").eq("event_id", simId);
    for (const r of data ?? []) if (r.virtual_user) await w.db.auth.admin.deleteUser(r.virtual_user).catch(() => undefined);
  }
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
  ["event-simulate-real", `/org/events/${id}/simulate`],
  ["event-simulate", `/org/events/${simId}/simulate`],
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
      // measuring and photographing are two passes: a full-page capture changes a phone context (it stops matching "touch"), which would skew everything measured after it
      const measure = async (name: string, path: string) => {
        if (only && !only.test(name)) return;
        await page.goto(path, { waitUntil: "networkidle" });
        const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (sideways > 1) problems.push(`${name}: scrolls sideways by ${sideways} px`);
        // a control under the control height (40 px on a computer, 44 on touch)
        const small = await page.evaluate((min) => {
          const out: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>("main button, main select, main textarea, main input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]):not([type=color])")) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && r.height < min - 0.5) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.height)}px (ctl ${getComputedStyle(el).getPropertyValue("--org-ctl")}, min ${getComputedStyle(el).minHeight}, coarse ${matchMedia("(pointer: coarse)").matches}, width ${innerWidth})`);
          }
          return out.slice(0, 6);
        }, vp.touch ? 44 : 40);
        if (small.length) problems.push(`${name}: controls under ${vp.touch ? 44 : 40} px: ${small.join("; ")}`);
        // text contrast: every piece of text reads at 4.5:1 or better against what is behind it (the tokens themselves are held to 7:1 by the unit tests)
        const faint = await page.evaluate(() => {
          const lum = (c: number[]) => {
            const [r, g, b] = c.map((v) => {
              const x = v / 255;
              return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          };
          const parse = (v: string) => (v.match(/[\d.]+/g) ?? []).map(Number);
          const back = (el: Element | null): number[] => {
            for (let e = el; e; e = e.parentElement) {
              const c = parse(getComputedStyle(e).backgroundColor);
              if (c.length >= 3 && (c[3] ?? 1) > 0.9) return c;
            }
            return [255, 255, 255];
          };
          const out: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>("main *, header *, aside *")) {
            if (![...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 1)) continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === "hidden") continue;
            const fg = parse(getComputedStyle(el).color);
            const bg = back(el);
            const a = fg[3] ?? 1;
            const mixed = fg.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a));
            const l1 = lum(mixed);
            const l2 = lum(bg);
            const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
            if (ratio < 4.5) out.push(`"${(el.textContent ?? "").trim().slice(0, 24)}" ${ratio.toFixed(1)}:1`);
          }
          return out.slice(0, 5);
        });
        if (faint.length) problems.push(`${name}: low contrast: ${faint.join("; ")}`);
        if (theme === "dark") {
          // nothing large painted white (or near white) on a dark page
          const white = await page.evaluate(() => {
            const out: string[] = [];
            for (const el of document.querySelectorAll<HTMLElement>("body *")) {
              const r = el.getBoundingClientRect();
              if (r.width < 24 || r.height < 24) continue;
              // the block-style Rider label has a white body by design (outlined in the page ink), and a logo is shown on its own light plate
              if (el.tagName === "IMG" || el.closest('[data-testid="rider-label"]')) continue;
              const m = getComputedStyle(el).backgroundColor.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/);
              if (m && Number(m[4] ?? 1) > 0.5 && Number(m[1]) > 225 && Number(m[2]) > 225 && Number(m[3]) > 225) out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`);
            }
            return out.slice(0, 5);
          });
          if (white.length) problems.push(`${name}: white panels in Dark: ${white.join("; ")}`);
        }
      };
      const shoot = async (name: string, path: string) => {
        if (only && !only.test(name)) return;
        await page.goto(path, { waitUntil: "networkidle" });
        await page.screenshot({ path: `${OUT}/${name}-${vp.key}-${theme}.png`, fullPage: true });
      };
      for (const pass of [measure, shoot]) {
        await w.org.signIn(page, "/org");
        for (const [name, path] of orgPages(w.eventId)) await pass(name, path);
        await owner.signIn(page, "/admin");
        for (const [name, path] of adminPages(w.org.orgId)) await pass(name, path);
      }
      // a platform owner inside an organisation: the slim strip (a fresh context: the full-page captures above leave a phone context changed)
      await context.close();
      const second = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch, deviceScaleFactor: 1 });
      await installSupabaseProxy(second);
      await second.addInitScript((t) => {
        try {
          window.localStorage.setItem("bigair.beach-theme", t);
        } catch {
          /* not saved */
        }
      }, theme);
      const strip = await second.newPage();
      await owner.signIn(strip, "/admin");
      await strip.goto("/admin", { waitUntil: "networkidle" });
      await strip.getByTestId("table-search").fill(w.org.run);
      await strip.getByRole("button", { name: "Open as this organiser" }).first().click();
      await strip.waitForURL(/\/org$/);
      await strip.waitForLoadState("networkidle");
      const small = await strip.evaluate((min) => [...document.querySelectorAll<HTMLElement>("main button, main select, main input:not([type=checkbox]):not([type=radio]):not([type=hidden])")].filter((el) => el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().height < min - 0.5).map((el) => `${el.tagName.toLowerCase()} ${Math.round(el.getBoundingClientRect().height)}px`), vp.touch ? 44 : 40);
      if (small.length) problems.push(`impersonation: controls under the control height: ${small.slice(0, 4).join("; ")}`);
      await strip.screenshot({ path: `${OUT}/impersonation-${vp.key}-${theme}.png`, fullPage: true });
      await second.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
      await second.close();
      expect(problems, problems.join("\n")).toEqual([]);
    });
  }
}
