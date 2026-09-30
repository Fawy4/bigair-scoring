import { test, expect } from "./base";
import { createOrganiser } from "./organiser";

test.describe("event web addresses are links with a copy button", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("organiser's list and the Event step: a link to the public page in a new tab, and a button that copies the full address", async ({ page, baseURL }) => {
    const org = await createOrganiser();
    try {
      const slug = `e2e-link-${org.run}`;
      const { data: ev } = await org.db.from("events").insert({ organisation_id: org.orgId, name: `Link Cup ${org.run}`, slug, status: "published", start_date: "2026-10-10", end_date: "2026-10-11" }).select("id").single();
      await org.signIn(page, "/org");

      const inList = page.getByTestId("slug-link").first();
      await expect(inList).toHaveText(`/${slug}`);
      await expect(inList).toHaveAttribute("href", `/e/${slug}`);
      await expect(inList).toHaveAttribute("target", "_blank");
      await page.getByTestId("slug-copy").first().click();
      await expect(page.getByTestId("slug-copy").first()).toContainText("Copied");
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${baseURL}/e/${slug}`);

      await page.goto(`/org/events/${ev!.id}/event`);
      const inStep = page.getByTestId("slug-link");
      await expect(inStep).toHaveAttribute("href", `/e/${slug}`);
      await expect(inStep).toHaveAttribute("target", "_blank");
      await page.getByTestId("slug-copy").click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${baseURL}/e/${slug}`);

      // the link really opens the public page
      const [popup] = await Promise.all([page.waitForEvent("popup"), inStep.click()]);
      await expect(popup).toHaveURL(new RegExp(`/e/${slug}$`));
    } finally {
      await org.cleanup();
    }
  });

  test("admin events table: the same link and copy button", async ({ page, baseURL }) => {
    const admin = await createOrganiser({ platformAdmin: "owner" });
    try {
      const slug = `e2e-adm-${admin.run}`;
      await admin.db.from("events").insert({ organisation_id: admin.orgId, name: `Admin Link Cup ${admin.run}`, slug, status: "draft" });
      await admin.signIn(page, `/admin/organisations/${admin.orgId}`);
      const link = page.getByTestId("slug-link");
      await expect(link).toHaveAttribute("href", `/e/${slug}`);
      await expect(link).toHaveAttribute("target", "_blank");
      await page.getByTestId("slug-copy").click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${baseURL}/e/${slug}`);
    } finally {
      await admin.cleanup();
    }
  });
});
