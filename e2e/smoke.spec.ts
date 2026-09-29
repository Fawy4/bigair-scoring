import { test, expect } from "@playwright/test";

test("home page builds and renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Build OK")).toBeVisible();
});
