import { test, expect } from "./base";
import { effectiveProductName } from "./organiser";

test("landing page: the product name, the event lists, one field for an event code, two small links and a quiet Admin link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(await effectiveProductName());
  await expect(page.getByRole("link", { name: "Join with your PIN" })).toHaveAttribute("href", "/join");
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/org/login");
  await expect(page.getByTestId("admin-link")).toHaveAttribute("href", "/org/login?next=%2Fadmin");
  await expect(page.getByLabel("Have an event code?")).toBeVisible();
  // no sign-up anywhere
  await expect(page.getByRole("link", { name: /sign up|register|create account/i })).toHaveCount(0);
  // the code field says what is wrong instead of going anywhere
  await page.getByLabel("Have an event code?").fill("../admin");
  await page.getByRole("button", { name: "Go" }).click();
  await expect(page.getByText("Type the code from the event's address")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});
