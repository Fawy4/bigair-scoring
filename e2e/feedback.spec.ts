import { readFileSync } from "node:fs";
import { test, expect } from "./base";
import { createOrganiser, PNG } from "./organiser";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("the Note button saves a note with its context; it appears in /admin, is filtered, exported as a downloaded file (no token needed), set to done", async ({ page }) => {
  test.setTimeout(240_000);
  const owner = await createOrganiser({ platformAdmin: "owner" });
  try {
    const { data: ev } = await owner.db.from("events").insert({ organisation_id: owner.orgId, name: `Note Cup ${owner.run}`, slug: `e2e-note-${owner.run}`, status: "draft" }).select("id").single();
    const { data: div } = await owner.db.from("divisions").insert({ event_id: ev!.id, name: "Pro Men", sort_order: 1 }).select("id").single();
    await owner.signIn(page, `/org/events/${ev!.id}/riders?division=${div!.id}`);

    // the floating button, with the page, event, division and role that will be saved
    await expect(page.getByTestId("note-button")).toBeVisible();
    await page.getByTestId("note-button").click();
    await expect(page.getByTestId("note-context")).toContainText("Page: Riders step");
    await expect(page.getByTestId("note-context")).toContainText(`Event: Note Cup ${owner.run}`);
    await expect(page.getByTestId("note-context")).toContainText("Division: Pro Men");
    await expect(page.getByTestId("note-context")).toContainText("You are: owner");
    await expect(page.getByTestId("note-send")).toBeDisabled(); // nothing typed yet
    await page.getByLabel("What did you notice?").fill("Seed column too narrow on the phone");
    await page.getByLabel("Kind of note").selectOption({ label: "Layout" });
    await page.getByTestId("note-shot").setInputFiles({ name: "shot.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByTestId("note-shot-attached")).toContainText("shot.png");
    await page.getByTestId("note-send").click();
    await expect(page.getByTestId("note-saved")).toBeVisible();

    const { data: note } = await owner.db.from("feedback_notes").select("*").eq("organisation_id", owner.orgId).single();
    expect(note).toMatchObject({ body: "Seed column too narrow on the phone", tag: "layout", status: "open", author_role: "owner", page: `/org/events/${ev!.id}/riders`, page_label: "Riders step", event_name: `Note Cup ${owner.run}`, division_name: "Pro Men", event_id: ev!.id, division_id: div!.id });
    expect(note!.screenshot_path).toMatch(new RegExp(`^${owner.orgId}/[0-9a-f-]{36}\\.png$`));
    expect((await owner.db.storage.from("feedback").download(note!.screenshot_path)).error).toBeNull();
    await page.getByTestId("note-close").click();

    // a paste also attaches a screenshot
    await page.getByTestId("note-button").click();
    await page.getByLabel("What did you notice?").fill("Second note with a pasted image");
    await page.getByLabel("What did you notice?").evaluate((el, b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
    }, PNG.toString("base64"));
    await expect(page.getByTestId("note-shot-attached")).toContainText("pasted.png");
    await page.getByTestId("note-send").click();
    await expect(page.getByTestId("note-saved")).toBeVisible();
    await page.getByTestId("note-close").click();
    expect((await owner.db.from("feedback_notes").select("screenshot_path").eq("organisation_id", owner.orgId).like("body", "Second note%").single()).data!.screenshot_path).not.toBeNull();

    // the owner's list in /admin
    await page.goto("/admin/feedback");
    const mine = page.getByTestId("note-row").filter({ hasText: `Note Cup ${owner.run}` });
    const row = mine.filter({ hasText: "Seed column too narrow on the phone" });
    await expect(row).toContainText("Layout");
    await expect(row).toContainText("Riders step");
    await expect(row).toContainText(`Note Cup ${owner.run}`);
    await expect(row).toContainText("Pro Men");
    await expect(row).toContainText("owner");
    await expect(row).toContainText("not exported yet");
    await expect(row.getByRole("link", { name: "Screenshot" })).toBeVisible();
    // filters: by kind, by screen, by event
    await page.getByLabel("Kind", { exact: true }).selectOption({ label: "Bug" });
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(mine.filter({ hasText: "Seed column too narrow" })).toHaveCount(0);
    await page.getByLabel("Kind", { exact: true }).selectOption({ label: "Layout" });
    await page.getByLabel("Event", { exact: true }).selectOption({ label: `Note Cup ${owner.run}` });
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(mine.filter({ hasText: "Seed column too narrow" })).toHaveCount(1);

    // export for Claude: a downloaded FEEDBACK.md (there is no token to push with), one ready line per note
    await page.goto("/admin/feedback");
    await page.getByTestId("export-button").click();
    const text = await page.getByTestId("export-text").inputValue();
    expect(text).toContain("# Feedback from testing");
    expect(text).toContain("## Layout");
    expect(text).toContain("### Riders step");
    expect(text).toMatch(new RegExp(`- \\[Riders step · Note Cup ${owner.run} · Pro Men · owner\\] "Seed column too narrow on the phone" \\(screenshot: https://[^)]+\\)`));
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-download").click()]);
    expect(download.suggestedFilename()).toBe("FEEDBACK.md");
    expect(readFileSync(await download.path(), "utf8")).toBe(text);
    await page.getByTestId("export-copy").click();
    await expect(page.getByTestId("export-copy")).toContainText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
    const { data: exported } = await owner.db.from("feedback_notes").select("exported_at, status").eq("organisation_id", owner.orgId);
    expect(exported!.every((n) => n.exported_at !== null && n.status === "open")).toBe(true); // dated, and still open until set to done

    // notes stay open until the owner sets them to done; a done note is not exported again
    await page.goto("/admin/feedback");
    await expect(mine.filter({ hasText: "Seed column too narrow" })).toContainText("exported");
    for (const body of ["Seed column too narrow", "Second note"]) await mine.filter({ hasText: body }).getByRole("button", { name: "Set as done" }).click();
    await expect.poll(async () => (await owner.db.from("feedback_notes").select("status").eq("organisation_id", owner.orgId).eq("status", "done")).data?.length).toBe(2);
    await page.reload();
    await page.getByTestId("export-button").click();
    await expect(page.getByTestId("export-text")).not.toHaveValue(new RegExp(`Note Cup ${owner.run}`)); // done notes are not exported again
  } finally {
    await owner.cleanup();
  }
});

test("an organiser sees the Note button and a reduced list of their own notes; no export, no admin; visitors never see the button", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const org = await createOrganiser();
  const visitor = await browser.newContext();
  try {
    await org.signIn(page, "/org");
    await page.getByTestId("note-button").click();
    await expect(page.getByTestId("note-context")).toContainText("You are: organiser");
    await page.getByLabel("What did you notice?").fill("Wording: this sentence is confusing");
    await page.getByLabel("Kind of note").selectOption({ label: "Wording" });
    await page.getByTestId("note-send").click();
    await expect(page.getByTestId("note-saved")).toBeVisible();
    await page.getByTestId("note-close").click();

    await page.getByRole("link", { name: "Feedback" }).click();
    await expect(page.getByRole("heading", { name: "Feedback from your team" })).toBeVisible();
    await expect(page.getByTestId("note-row")).toContainText("Wording: this sentence is confusing");
    await expect(page.getByTestId("note-row")).toContainText("Events list");
    await expect(page.getByRole("button", { name: "Set as done" })).toHaveCount(0);
    await expect(page.getByTestId("export-button")).toHaveCount(0);
    await page.goto("/admin/feedback");
    await expect(page.getByRole("heading", { name: "This page doesn't exist" })).toBeVisible();

    // a visitor who is not signed in gets no button, on any public page
    const v = await visitor.newPage();
    await v.goto("/");
    await v.waitForLoadState("networkidle");
    await v.waitForTimeout(1500);
    await expect(v.getByTestId("note-button")).toHaveCount(0);
    await v.goto(`/e/demo-cup/join`);
    await v.waitForTimeout(1500);
    await expect(v.getByTestId("note-button")).toHaveCount(0);
  } finally {
    await visitor.close();
    await org.cleanup();
  }
});
