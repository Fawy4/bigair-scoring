import { expect, test } from "./base";
import { createOrganiser } from "./organiser";

// CL1: the platform owner's Organisations list leaves test organisations out until "Show test organisations" is switched on. The organisation this test makes is marked as
// test the moment it is created, like every organisation a test makes; nothing is deleted afterwards.
let owner: Awaited<ReturnType<typeof createOrganiser>>;
test.beforeAll(async () => {
  owner = await createOrganiser({ platformAdmin: "owner" });
});

test("the default list hides a test organisation; the switch shows it with its Test organisation tag and hides it again", async ({ page }) => {
  const row = () => page.getByRole("row").filter({ hasText: `/e2e-${owner.run}` });
  expect((await owner.db.from("organisations").select("is_test").eq("id", owner.orgId).single()).data!.is_test).toBe(true);

  await owner.signIn(page, "/admin");
  await expect(page.getByRole("heading", { name: "Organisations", exact: true })).toBeVisible();
  await expect(row()).toHaveCount(0);
  await expect(page.getByTestId("test-organisations-note")).toContainText("hidden");
  await expect(page.getByRole("button", { name: "Create demo organisation" })).toHaveCount(0); // a demo organisation exists (hidden or not): no second one is offered

  await page.getByTestId("show-test-organisations").click();
  await expect(page).toHaveURL(/\/admin\?test=1/);
  await expect(row()).toBeVisible();
  await expect(row()).toContainText("Test organisation");
  await expect(page.getByTestId("show-test-organisations")).toHaveText("Hide test organisations");

  await page.getByTestId("show-test-organisations").click();
  await expect(row()).toHaveCount(0);
});
