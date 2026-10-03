import { readFileSync } from "node:fs";
import path from "node:path";
import { PRODUCT_VERSION } from "../src/lib/product-version";
import { parseReleases } from "../src/lib/releases/releases";
import { expect, test } from "./base";
import { createOrganiser } from "./organiser";

// Admin → Releases on the hosted project. The ticks are real shared state (the owner ticks the same checks on the live address), so this test
// ticks only a check nobody has ticked, unticks it again, and finally removes every tick its throwaway login left. It never confirms a version.
type Organiser = Awaited<ReturnType<typeof createOrganiser>>;
let owner: Organiser;
let staff: Organiser;
let ownerId = "";

const current = parseReleases(readFileSync(path.join(process.cwd(), "docs", "RELEASES.md"), "utf8")).find((r) => r.version === PRODUCT_VERSION)!;

test.beforeAll(async () => {
  owner = await createOrganiser({ platformAdmin: "owner" });
  staff = await createOrganiser({ platformAdmin: "staff" });
  const { data } = await owner.db.auth.admin.listUsers({ perPage: 1000 });
  ownerId = data.users.find((u) => u.email === owner.email)!.id;
});
test.afterAll(async () => {
  if (ownerId) await owner?.db.from("release_check_ticks").delete().eq("ticked_by", ownerId);
  await owner?.cleanup();
  await staff?.cleanup();
});

test("the owner ticks a check of the current version, it stays after a reload, Health counts it, and unticking takes it back", async ({ page }) => {
  test.setTimeout(180_000); // the first visit to each page compiles it in dev mode
  const { data: before } = await owner.db.from("release_check_ticks").select("check_key").eq("version", PRODUCT_VERSION);
  const { data: signed } = await owner.db.from("release_signoffs").select("version").eq("version", PRODUCT_VERSION);
  const taken = new Set((before ?? []).map((r) => r.check_key));
  const free = current.checks.find((c) => !taken.has(c.key));
  test.skip(!free || Boolean(signed?.length), "every check of the current version is already ticked on the hosted project");

  await owner.signIn(page, "/admin/releases");
  await expect(page.getByTestId("release-current")).toContainText(`Current version ${PRODUCT_VERSION}`);
  const doneBefore = taken.size;
  await expect(page.getByTestId("release-current")).toContainText(`${PRODUCT_VERSION} — ${doneBefore} of ${current.checks.length} checks done`);

  const section = page.getByTestId(`release-${PRODUCT_VERSION}`);
  const box = section.locator(`[data-testid=release-check][data-key="${free!.key}"] input`);
  // a tap before the page's scripts run is lost: tick until the server has it
  await expect(async () => {
    if (!(await box.isChecked())) await box.check();
    const { data } = await owner.db.from("release_check_ticks").select("ticked_by").eq("version", PRODUCT_VERSION).eq("check_key", free!.key);
    expect(data?.[0]?.ticked_by).toBe(ownerId);
  }).toPass({ timeout: 30_000 });
  await expect(section.getByTestId("release-mark-tested")).toBeDisabled();
  await expect(section.getByTestId("disabled-reason")).toContainText("Tick every check first");

  await page.reload();
  await expect(box).toBeChecked();
  await expect(section.locator(`[data-testid=release-check][data-key="${free!.key}"]`)).toContainText(`Ticked by ${owner.email}`);
  await expect(page.getByTestId("release-current")).toContainText(`${doneBefore + 1} of ${current.checks.length} checks done`);

  await page.goto("/admin/health");
  await expect(page.getByTestId("release-status")).toContainText(`${PRODUCT_VERSION} — ${doneBefore + 1} of ${current.checks.length} checks done`);
  await page.goto("/admin");
  await expect(page.getByTestId("release-status")).toContainText(`${PRODUCT_VERSION} — ${doneBefore + 1} of ${current.checks.length} checks done`);

  await page.goto("/admin/releases");
  await box.uncheck();
  await expect(async () => {
    const { data } = await owner.db.from("release_check_ticks").select("check_key").eq("version", PRODUCT_VERSION).eq("check_key", free!.key);
    expect(data).toHaveLength(0);
  }).toPass({ timeout: 30_000 });
  await page.reload();
  await expect(box).not.toBeChecked();
});

test("staff see the releases but cannot tick", async ({ page }) => {
  test.setTimeout(120_000);
  await staff.signIn(page, "/admin/releases");
  await expect(page.getByTestId("release-current")).toContainText(`Current version ${PRODUCT_VERSION}`);
  await expect(page.getByText("Only platform owners can do this. You can look, but not change it.")).toBeVisible();
  await expect(page.getByTestId(`release-${PRODUCT_VERSION}`).locator("[data-testid=release-check] input").first()).toBeDisabled();
  await expect(page.getByTestId("release-mark-tested")).toHaveCount(0);
});
