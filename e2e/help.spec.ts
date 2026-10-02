import { expect, test } from "./base";
import { createOrganiser } from "./organiser";

/**
 * The Help section (the product manual at /help): it renders with its contents, search finds “Hold” and lands “grey” on the dependency map's Hold row, every
 * link inside it resolves, every picture loads, the Mermaid diagram is drawn, and “Download as PDF” opens the print window. Then the “Learn more” links on an
 * organiser screen: a grey button's reason and a “?” both open the matching part of the manual.
 */
test("the manual renders, searches, links, shows its pictures and its diagram, and prints", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/help");
  await expect(page.getByTestId("help")).toBeVisible();
  await expect(page.getByTestId("help-version")).toContainText(/Product version \d+\.\d+\.\d+/);
  await expect(page.locator("meta[name=robots]")).toHaveAttribute("content", /noindex/);
  await expect(page.locator("article.help-page")).toHaveCount(40);

  // search: “Hold” finds results; “grey” lands on the dependency map's Hold row
  await page.getByTestId("help-search").fill("Hold");
  await expect(page.getByTestId("help-result").first()).toBeVisible();
  await page.getByTestId("help-search").fill("grey");
  const first = page.getByTestId("help-result").first();
  await expect(first).toContainText("Hold");
  await first.click();
  await expect(page).toHaveURL(/#dep-hold$/);
  await expect(page.locator("#dep-hold")).toBeInViewport();

  // every link inside the manual points at an element on the page
  const broken = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLAnchorElement>(".help-md a[href^='#'], .help-toc a[href^='#']"))
      .map((a) => a.getAttribute("href")!.slice(1))
      .filter((id) => !document.getElementById(id)),
  );
  expect(broken).toEqual([]);

  // every picture exists and loads
  const srcs = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLImageElement>(".help-md img")).map((i) => i.getAttribute("src")!));
  expect(srcs.length).toBeGreaterThan(30);
  for (const src of new Set(srcs)) {
    const r = await page.request.get(src);
    expect(r.status(), src).toBe(200);
    expect(r.headers()["content-type"], src).toBe("image/png");
  }

  // the dependency diagram is drawn by Mermaid
  await expect(page.locator("pre.mermaid[data-rendered=true] svg").first()).toBeVisible({ timeout: 30_000 });

  // Download as PDF opens the browser's print window (stubbed here) once every picture has loaded
  await page.evaluate(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => {
      (window as unknown as { printed: number }).printed++;
    };
  });
  await page.getByTestId("help-pdf").click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed), { timeout: 60_000 }).toBe(1);
});

test("a grey button's reason and a “?” on the organiser screens link to the manual", async ({ page }) => {
  test.setTimeout(120_000);
  const org = await createOrganiser();
  try {
    const { data: ev, error } = await org.db
      .from("events")
      .insert({ organisation_id: org.orgId, name: `E2E Help ${org.run}`, slug: `e2e-help-${org.run}`, status: "draft", timezone: "Africa/Cairo" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    // Go live with no run order: Hold is grey, its reason has “Learn more” to its row of the errors page
    await org.signIn(page, `/org/events/${ev!.id}`);
    const reason = page.getByTestId("quick-actions").getByTestId("disabled-reason").filter({ hasText: "No run order is active for today" }).first();
    await expect(reason).toBeVisible();
    const link = reason.getByTestId("learn-more");
    await expect(link).toHaveAttribute("href", "/help#err-org-dashboard-noplantoday");
    // the anchor exists in the manual
    const help = await page.context().newPage();
    await help.goto("/help#err-org-dashboard-noplantoday");
    await expect(help.locator("#err-org-dashboard-noplantoday")).toBeVisible();
    await help.close();

    // a “?” on the Event step: its note has “Learn more” to the setting's row
    await page.goto(`/org/events/${ev!.id}/event`);
    await page.getByRole("button", { name: /About “Event name/ }).first().click();
    await expect(page.getByTestId("setting-example").getByTestId("learn-more").first()).toHaveAttribute("href", "/help#set-event-name");
  } finally {
    await org.cleanup();
  }
});
