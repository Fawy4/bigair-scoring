import type { Browser, Page } from "@playwright/test";
import { test, expect, installSupabaseProxy } from "./base";
import { createOrganiser } from "./organiser";

// Polish 1, item 2: organiser access, the way the owner uses it for a second customer. A throwaway platform owner invites a person to a throwaway organisation:
// the e-mailed link signs them in (in a private window), they choose a password, sign out and in again with it; the owner removes them (locked out at once) and
// invites them again. No e-mail is really sent (the plan allows 2 an hour): the link is the same address the e-mail carries, made by the auth service.
type Organiser = Awaited<ReturnType<typeof createOrganiser>>;
let owner: Organiser;
const PASSWORD = "Second-customer-42";

test.beforeAll(async () => {
  owner = await createOrganiser({ platformAdmin: "owner" });
});
test.afterAll(async () => {
  await owner?.cleanup();
});

const openAccount = async (page: Page) => {
  const menu = page.getByTestId("account-menu");
  if ((await menu.getByRole("button", { name: "Account" }).getAttribute("aria-expanded")) !== "true") await menu.getByRole("button", { name: "Account" }).click();
};
const privateWindow = async (browser: Browser, baseURL: string) => {
  const context = await browser.newContext({ baseURL });
  await installSupabaseProxy(context); // in a sandbox the browser reaches the auth service only through the proxy
  return { context, page: await context.newPage() };
};

test("invite, sign in with the link, set a password, sign in with it; remove, locked out; invite again", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const slug = `e2e-acc-${owner.run}`;
  const orgName = `E2E Access ${owner.run}`;
  const invitee = `e2e-acc-invitee-${owner.run}@example.com`;
  const { data: org, error } = await owner.db.from("organisations").insert({ name: orgName, slug }).select("id").single();
  if (error) throw new Error(error.message);
  owner.trackOrganisation(slug);
  await owner.db.from("events").insert({ organisation_id: org.id, name: "Access event", slug: `${slug}-ev`, status: "draft", timezone: "Africa/Cairo" });
  const baseURL = new URL((await (async () => { await owner.signIn(page, "/admin"); return page.url(); })())).origin;

  // ---- the owner invites (the sentence about the plan's limit is on the form; no password field anywhere)
  await page.goto(`/admin/organisations/${org.id}`);
  await expect(page.getByTestId("email-limit")).toHaveText("Only 2 sign-in e-mails per hour on this plan.");
  await expect(page.locator("input[type=password]")).toHaveCount(0);
  const invite = async () => {
    await page.getByLabel("Organiser's email").fill(invitee);
    await page.getByLabel("Send the sign-in email now").uncheck();
    await page.getByRole("button", { name: "Invite organiser" }).click();
    await expect(page.getByTestId("invite-follow-up")).toHaveText("Ask them to click the link today and set a password straight away.");
    return page.getByLabel("Sign-in link").inputValue();
  };
  const link = await invite();
  const created = (await owner.db.auth.admin.listUsers({ perPage: 200 })).data.users.find((u) => u.email === invitee);
  expect(created).toBeTruthy();
  owner.trackUser(created!.id);
  await expect(page.getByRole("cell", { name: invitee })).toBeVisible();

  // ---- the person opens the link in a private window: signed in, in their organisation, nothing else to do
  const first = await privateWindow(browser, baseURL);
  await first.page.goto(link);
  await expect(first.page).toHaveURL(/\/org$/);
  await expect(first.page.getByRole("heading", { name: `${orgName}: events` })).toBeVisible();
  await expect(first.page.getByText("Access event")).toBeVisible();
  // sees only their own organisation: no admin, no other organisation, no other events
  expect((await first.page.goto("/admin"))?.status()).toBe(404);
  await first.page.goto("/org");
  await openAccount(first.page);
  await expect(first.page.getByRole("menuitem", { name: new RegExp(`Organiser view`) })).toHaveCount(0);
  await expect(first.page.getByRole("menuitem", { name: "Set a password" })).toBeVisible();

  // ---- Set a password, sign out, sign in with e-mail + password
  await first.page.getByRole("menuitem", { name: "Set a password" }).click();
  await expect(first.page.getByRole("heading", { name: "Set a password" })).toBeVisible();
  await first.page.waitForLoadState("networkidle"); // the form must be live before it is submitted (a first visit compiles the page in dev mode)
  await first.page.getByLabel("New password").fill(PASSWORD);
  await first.page.getByLabel("Type it again").fill(PASSWORD);
  await first.page.getByRole("button", { name: "Save password" }).click();
  await expect(first.page.getByText("Password saved")).toBeVisible();
  await first.page.goto("/org");
  await openAccount(first.page);
  await first.page.getByRole("menuitem", { name: "Sign out" }).click();
  await first.page.goto("/org/login");
  await first.page.getByLabel("Your email address").fill(invitee);
  await first.page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await first.page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(first.page).toHaveURL(/\/org$/);
  await expect(first.page.getByRole("heading", { name: `${orgName}: events` })).toBeVisible();

  // ---- the e-mail's own link shape (auth service address, the session comes back after "#"): signs in in another window, and a used link says so
  const { data: gen, error: genError } = await owner.db.auth.admin.generateLink({ type: "magiclink", email: invitee, options: { redirectTo: `${baseURL}/auth/link?next=%2Forg` } });
  if (genError) throw new Error(genError.message);
  // the auth service answers the e-mail's address with a redirect to our page, the session after "#" (a browser test cannot follow that itself through the sandbox proxy)
  const landing = async () => (await fetch(gen.properties.action_link, { redirect: "manual" })).headers.get("location")!;
  const emailWindow = await privateWindow(browser, baseURL);
  await emailWindow.page.goto(await landing());
  await expect(emailWindow.page).toHaveURL(/\/org$/);
  await expect(emailWindow.page.getByRole("heading", { name: `${orgName}: events` })).toBeVisible();
  const reused = await privateWindow(browser, baseURL);
  await reused.page.goto(await landing());
  await expect(reused.page).toHaveURL(/\/org\/login\?error=expired/);
  await expect(reused.page.locator("p[role=alert]")).toContainText("already been used or has expired");
  await reused.context.close();
  await emailWindow.context.close();

  // ---- "Forgot password": the link it sends lands on the set-password page (the e-mail itself is not sent here)
  const forgot = await privateWindow(browser, baseURL);
  await forgot.page.goto("/org/login");
  await forgot.page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(forgot.page.locator("p[role=alert]")).toContainText("Type your email address above first");
  const { data: reset } = await owner.db.auth.admin.generateLink({ type: "magiclink", email: invitee });
  if (!reset?.properties) throw new Error("no link");
  await forgot.page.goto(`/auth/confirm?token_hash=${reset.properties.hashed_token}&type=magiclink&next=${encodeURIComponent("/org/set-password")}`);
  await expect(forgot.page.getByRole("heading", { name: /password/i }).first()).toBeVisible();
  await forgot.context.close();

  // ---- the owner removes them: gone from the table, access ends at once, their window is signed out
  await page.goto(`/admin/organisations/${org.id}`);
  const row = page.getByRole("row").filter({ hasText: invitee });
  await row.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("button", { name: "Yes, remove" }).click();
  await expect(page.getByRole("cell", { name: invitee })).toHaveCount(0);
  await first.page.goto("/org");
  await expect(first.page).toHaveURL(/\/org\/login/);
  // signing in again with the password works for the login but gets no further: not an organiser
  await first.page.getByLabel("Your email address").fill(invitee);
  await first.page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await first.page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(first.page.locator("p[role=alert]")).toContainText("not an organiser");
  await first.context.close();

  // ---- invited again later: works as before
  await page.goto(`/admin/organisations/${org.id}`);
  const again = await invite();
  const second = await privateWindow(browser, baseURL);
  await second.page.goto(again);
  await expect(second.page).toHaveURL(/\/org$/);
  await expect(second.page.getByRole("heading", { name: `${orgName}: events` })).toBeVisible();
  await second.context.close();
});

test("the owner cannot remove their own login, and an organiser has no Remove buttons", async ({ page }) => {
  const plain = await createOrganiser();
  try {
    await owner.signIn(page, `/admin/organisations/${owner.orgId}`);
    const row = page.getByRole("row").filter({ hasText: owner.email });
    await expect(row.getByRole("button", { name: "Remove" })).toHaveCount(0);
    await expect(row.getByText("That is your own login.")).toBeVisible();
    await plain.signIn(page, "/org");
    expect((await page.goto(`/admin/organisations/${plain.orgId}`))?.status()).toBe(404);
  } finally {
    await plain.cleanup();
  }
});
