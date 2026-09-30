import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { test, expect } from "./base";
import { createOrganiser } from "./organiser";

// Organiser sign-in with email + password (invite-only). Needs Supabase keys and `npm run auth:password` applied to the hosted project.
type Organiser = Awaited<ReturnType<typeof createOrganiser>>;
const PASSWORD = "Sunny-beach-42";
let org: Organiser;

test.beforeAll(async () => {
  org = await createOrganiser({ password: PASSWORD });
});
test.afterAll(async () => {
  await org?.cleanup();
});

test("password sign-in: the right password opens the console, a wrong one gets one plain message", async ({ page }) => {
  await page.goto("/org/login");
  await expect(page.getByLabel("Your email address")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with a link instead" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Forgot password?" })).toBeVisible();

  // wrong password: one message, still on the login page
  await page.getByLabel("Your email address").fill(org.email);
  await page.getByLabel("Password", { exact: true }).fill("not-the-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("p[role=alert]")).toContainText("That email address and password do not match");
  await expect(page).toHaveURL(/\/org\/login/);

  // an address nobody registered gets exactly the same message: it does not reveal who has an account
  await page.getByLabel("Your email address").fill(`nobody-${org.run}@example.com`);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("p[role=alert]")).toContainText("That email address and password do not match");

  // the right password
  await page.getByLabel("Your email address").fill(org.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/org$/);
  await expect(page.getByRole("navigation", { name: "Organiser" })).toBeVisible();
  await expect(page.getByText(org.email)).toBeVisible();
});

test("password sign-in keeps the page you were going to", async ({ page }) => {
  await page.goto("/org/settings");
  await expect(page).toHaveURL(/\/org\/login\?next=%2Forg%2Fsettings/);
  await page.getByLabel("Your email address").fill(org.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/org\/settings$/);
});

test("invite-only: an account that is not an organiser is refused and signed out; no sign-up form exists", async ({ page }) => {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const email = `stranger-${randomBytes(4).toString("hex")}@example.com`;
  const { data: stranger, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  expect(error).toBeNull();
  try {
    await page.goto("/org/login");
    await page.getByLabel("Your email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator("p[role=alert]")).toContainText("not an organiser");
    await page.goto("/org");
    await expect(page).toHaveURL(/\/org\/login/); // signed out again
    await expect(page.getByRole("button", { name: /sign ?up|register|create account/i })).toHaveCount(0);
  } finally {
    await db.auth.admin.deleteUser(stranger.user!.id);
  }
});

test("forgot password: needs the email first; an unregistered address is refused politely (no email is sent)", async ({ page }) => {
  await page.goto("/org/login");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("Type your email address above first");
  await page.getByLabel("Your email address").fill("nobody-registered@example.com");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("not registered as an organiser");
});

test("set a password after signing in with the link, then sign in with it", async ({ page }) => {
  const fresh = await createOrganiser(); // an existing invite-only account with no password yet
  try {
    await fresh.signIn(page, "/org/set-password");
    await expect(page.getByRole("heading", { name: "Set a password" })).toBeVisible();
    await page.getByLabel("New password").fill("short");
    await page.getByLabel("Type it again").fill("short");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.locator("p[role=alert]")).toContainText("Use at least 8 characters");
    await page.getByLabel("New password").fill("First-password-1");
    await page.getByLabel("Type it again").fill("First-password-2");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.locator("p[role=alert]")).toContainText("not the same");
    await page.getByLabel("Type it again").fill("First-password-1");
    await page.getByRole("button", { name: "Save password" }).click();
    await expect(page.getByText("Password saved")).toBeVisible();

    // sign out, then in again with the new password
    await page.goto("/org");
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.goto("/org/login");
    await page.getByLabel("Your email address").fill(fresh.email);
    await page.getByLabel("Password", { exact: true }).fill("First-password-1");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/org$/);
  } finally {
    await fresh.cleanup();
  }
});

test("the officials' PIN sign-in is unchanged", async ({ page }) => {
  await page.goto("/join");
  await expect(page.getByLabel("Event code")).toBeVisible();
  await expect(page.getByLabel("Your 6-digit PIN")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
});
