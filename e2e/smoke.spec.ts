import { test, expect } from "./base";
import { effectiveProductName } from "./organiser";

test("landing page shows the product name, the two entry buttons and the event list", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(await effectiveProductName());
  await expect(page.getByRole("link", { name: "Officials: join with a PIN" })).toHaveAttribute("href", "/join");
  await expect(page.getByRole("link", { name: "Organiser sign in" })).toHaveAttribute("href", "/org/login");
  await expect(page.getByRole("heading", { name: "Events" })).toBeVisible();
});
