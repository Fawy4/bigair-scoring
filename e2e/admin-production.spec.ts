import { test, expect } from "./base";
import { createOrganiser } from "./organiser";

// Loads every /admin screen the way Vercel serves it. Run with `npm run test:e2e:prod` (builds first, then `next start`);
// it also runs in the normal suite. A crashed server page shows "Application error"; a hardened one shows a readable message instead.
type Organiser = Awaited<ReturnType<typeof createOrganiser>>;
let owner: Organiser;

test.beforeAll(async () => {
  owner = await createOrganiser({ platformAdmin: "owner", password: "Prod-Test-Pw-1234" });
});
test.afterAll(async () => {
  await owner?.cleanup();
});

test("every /admin screen loads for the owner without a server error", async ({ page }) => {
  // Production only: the dev server compiles each page on first visit and sometimes answers a rapid first hit with a 500
  // ("__webpack_modules__[moduleId] is not a function"), which says nothing about the code. Run with `npm run test:e2e:prod`.
  test.skip(process.env.E2E_PRODUCTION !== "1", "runs with npm run test:e2e:prod (production build)");
  test.setTimeout(240_000);
  await owner.signIn(page, "/admin");
  await expect(page.getByRole("heading", { name: "Organisations", exact: true })).toBeVisible({ timeout: 90_000 });
  for (const [path, heading] of [
    ["/admin", "Organisations"],
    ["/admin/organisations/new", "Create organisation"],
    ["/admin/settings", "Platform settings"],
    ["/admin/presets", "Master presets"],
    ["/admin/audit", "Audit log"],
    ["/admin/health", "Health"],
  ] as const) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.getByRole("heading", { name: heading, exact: true }).first(), path).toBeVisible();
    await expect(page.getByText("Application error"), path).toHaveCount(0);
    await expect(page.getByText("This admin page could not be shown"), path).toHaveCount(0);
  }
  // the organisation's own page, with its events table
  const response = await page.goto(`/admin/organisations/${owner.orgId}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: `E2E Big Air ${owner.run}`, exact: true })).toBeVisible();
  // the health page shows the server configuration by name only
  await page.goto("/admin/health");
  await expect(page.getByText(/SUPABASE_SERVICE_ROLE_KEY: (set|MISSING)/)).toBeVisible();
});

test("owners land on /admin after signing in with a password; organisers still land on /org", async ({ page, context }) => {
  test.setTimeout(240_000);
  // one browser context throughout (the sandbox's Supabase proxy workaround only covers the default one); cookies are cleared between people
  const signIn = async (email: string, startAt = "/org/login") => {
    await context.clearCookies();
    await page.goto(startAt);
    await page.waitForLoadState("networkidle"); // let the form come alive before typing: a native submit would reload the page
    await page.getByLabel("Your email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("Prod-Test-Pw-1234");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  };

  await signIn(owner.email);
  await expect(page).toHaveURL(/\/admin$/, { timeout: 90_000 });
  await expect(page.getByRole("heading", { name: "Organisations", exact: true })).toBeVisible();

  const plain = await createOrganiser({ password: "Prod-Test-Pw-1234" });
  try {
    await signIn(plain.email);
    await expect(page).toHaveURL(/\/org$/, { timeout: 90_000 });
  } finally {
    await plain.cleanup();
  }

  // a page they were heading for still wins, also for the owner
  await signIn(owner.email, "/org/login?next=%2Forg%2Fsettings");
  await expect(page).toHaveURL(/\/org\/settings$/, { timeout: 90_000 });
});

test("the emailed-link sign-in also lands the owner on /admin when no page was asked for", async ({ page }) => {
  await owner.signIn(page, ""); // no next parameter
  await expect(page).toHaveURL(/\/admin$/, { timeout: 90_000 });
});
