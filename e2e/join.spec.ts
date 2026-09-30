import { test, expect } from "./base";

// Needs the demo seed (Demo Cup, judge PIN 100001) in the linked Supabase project and `npm run dev` (started automatically).

test("a judge joins with the event code and PIN, and the phone stays joined after a reload", async ({ page }) => {
  await page.goto("/join");
  await page.getByLabel("Event code").fill("demo-cup");
  await page.getByLabel("Your 6-digit PIN").fill("100 001");
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page).toHaveURL(/\/seat$/);
  await expect(page.getByText("Judge 1")).toBeVisible();
  await expect(page.getByText("Demo Cup")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Judge 1")).toBeVisible(); // still bound: no re-join needed
});

test("a wrong PIN gets a plain-language message and no seat", async ({ page }) => {
  await page.goto("/e/demo-cup/join");
  await expect(page.getByRole("heading", { name: "Demo Cup" })).toBeVisible();
  await page.getByLabel("Your 6-digit PIN").fill("999999");
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("not recognised");
  await page.goto("/seat");
  await expect(page.getByText("Not connected")).toBeVisible();
});

test("organiser pages send signed-out visitors to the sign-in page", async ({ page }) => {
  await page.goto("/org");
  await expect(page).toHaveURL(/\/org\/login\?next=%2Forg/);
});

test("sign-in is invite-only: an unknown email is refused politely and no email is sent", async ({ page }) => {
  await page.goto("/org/login");
  await page.getByRole("button", { name: "Sign in with a link instead" }).click();
  await page.getByLabel("Your email address").fill("nobody-registered@example.com");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("not registered as an organiser");
});
