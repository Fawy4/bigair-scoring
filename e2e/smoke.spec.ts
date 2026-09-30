import { test, expect } from "./base";

test("landing page shows the product name, the two entry buttons and the event list", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(process.env.NEXT_PUBLIC_PRODUCT_NAME || "[PRODUCT_NAME]");
  await expect(page.getByRole("link", { name: "Officials: join with a PIN" })).toHaveAttribute("href", "/join");
  await expect(page.getByRole("link", { name: "Organiser sign in" })).toHaveAttribute("href", "/org/login");
  await expect(page.getByRole("heading", { name: "Events" })).toBeVisible();
});
