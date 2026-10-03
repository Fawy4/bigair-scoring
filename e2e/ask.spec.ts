import { expect, test } from "./base";
import { ASK_MOCK_PORT, HOLD_ANSWER, startAskMock, type MockRequest } from "./ask-mock";
import { createOrganiser } from "./organiser";
import { createLiveWorld, type LiveWorld } from "./live-world";

/**
 * Ask Sendbook end to end, with the model mocked (e2e/ask-mock.ts) and everything else real: the app must run with
 *   ANTHROPIC_API_KEY=mock ANTHROPIC_BASE_URL=http://127.0.0.1:4599 npm run dev
 * then ASK_E2E=1 npx playwright test e2e/ask.spec.ts. A throwaway organisation's head console with no active run order: Hold is grey; the organiser asks
 * "why is Hold grey" and sees the answer stream in, naming the missing active run order and the Run order step, citing the dependency map; the prompt
 * carried the dependency map, the errors page and the grey Hold reason (and no PIN); "No, not right" writes a Feedback note tagged "ask"; the platform owner
 * finds the exchange in Admin → Ask log with its cost. Visitors and a seat asking about another event are refused.
 * ASK_SHOTS=1 also takes the manual's pictures (docs/manual/img/ask-panel-1280.png, ask-panel-390.png).
 */
test.describe.configure({ mode: "serial" });
test.skip(!process.env.ASK_E2E, `needs the app started against the mock model (ANTHROPIC_BASE_URL=http://127.0.0.1:${ASK_MOCK_PORT}) and ASK_E2E=1`);

let mock: Awaited<ReturnType<typeof startAskMock>>;
let world: LiveWorld;
let owner: Awaited<ReturnType<typeof createOrganiser>>;

test.beforeAll(async () => {
  mock = await startAskMock();
  world = await createLiveWorld();
  // no active run order: Hold is grey
  await world.db.from("schedule_plans").update({ active: false }).eq("id", world.planId);
  owner = await createOrganiser({ platformAdmin: "owner" });
});

test.afterAll(async () => {
  await mock?.close();
  await world?.cleanup();
  await owner?.cleanup();
});

const lastPrompt = (): MockRequest => mock.requests[mock.requests.length - 1];

test("why is Hold grey: a streamed answer that cites the dependency map, a thumbs-down note, and the owner's Ask log", async ({ page, browser }) => {
  test.setTimeout(240_000);
  await world.org.signIn(page, `/head/${world.eventId}`);
  await expect(page.getByTestId("head-page")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("hold")).toBeDisabled();

  await page.getByTestId("ask-button").click();
  const panel = page.getByTestId("ask-panel");
  await expect(panel).toBeVisible();
  await page.getByTestId("ask-input").fill("why is Hold grey");
  await page.getByTestId("ask-send").click();

  const answer = panel.getByTestId("ask-answer").last();
  await expect(answer).toHaveAttribute("data-done", "1", { timeout: 30_000 });
  await expect(answer).toContainText("no run order is active for today");
  await expect(answer).toContainText("Run order");
  await expect(answer.getByText("Activate this plan")).toHaveJSProperty("tagName", "STRONG");
  const cite = answer.getByTestId("ask-cite");
  await expect(cite).toHaveAttribute("href", "/help#dep-hold");
  await expect(cite).toContainText("Hold");

  // what the server sent: instructions, the two core pages, the console's page, the live context with the grey Hold reason; never a PIN or an e-mail
  const sent = lastPrompt();
  expect(sent.model).toBe("claude-sonnet-5-5");
  expect(sent.system[0].text).toContain("You are Ask Sendbook, the in-product assistant of Sendbook");
  expect(sent.system[1].text).toContain('file="dependencies.md"');
  expect(sent.system[1].text).toContain('file="errors.md"');
  expect(sent.system[1].text).toContain('file="troubleshooting.md"');
  expect(sent.system[1].cache_control).toEqual({ type: "ephemeral" });
  expect(sent.system[2].text).toContain('file="screens/console-laptop.md"');
  const live = sent.system[3].text;
  expect(live).toContain(`Route: /head/${world.eventId}`);
  expect(live).toContain("Role: organiser");
  expect(live).toContain(`Event: E2E Live ${world.org.run}`);
  expect(live).toMatch(/Hold \(grey\): No active run order/);
  expect(live).not.toMatch(/@|\b\d{6}\b/);
  expect(sent.messages.at(-1)).toEqual({ role: "user", content: "why is Hold grey" });

  if (process.env.ASK_SHOTS) await page.screenshot({ path: "docs/manual/img/ask-panel-1280.png" });

  // thumbs down: a Feedback note tagged "ask" with the question, the answer and the context
  await answer.getByTestId("ask-wrong").click();
  await expect(answer.getByTestId("ask-rating")).toContainText("The owner will read it");
  await expect
    .poll(async () => (await world.db.from("feedback_notes").select("body, tag, author_role").eq("organisation_id", world.orgId).eq("tag", "ask")).data ?? [])
    .toEqual([expect.objectContaining({ tag: "ask", author_role: "organiser", body: expect.stringContaining("Question: why is Hold grey") })]);
  const { data: note } = await world.db.from("feedback_notes").select("body").eq("organisation_id", world.orgId).eq("tag", "ask").single();
  expect(note!.body).toContain("Ask Sendbook — not right");
  expect(note!.body).toContain("Answer: Hold is grey");
  expect(note!.body).toContain("No active run order");

  // the log: tokens, model, cost, verdict, the pages sent and the page cited
  const { data: log } = await world.db.from("ask_log").select("*").eq("organisation_id", world.orgId).single();
  expect(log).toMatchObject({ status: "answered", role: "organiser", model: "claude-sonnet-5-5", input_tokens: 1200, cache_write_tokens: 45000, output_tokens: 80, rating: "down", cited: "/help#dep-hold", budget_tokens: 1200 + 56250 });
  expect(Number(log!.cost_usd)).toBeCloseTo((1200 * 2 + 45000 * 2.5 + 80 * 10) / 1e6, 6);
  expect(log!.pages.slice(0, 4)).toEqual(["dependencies.md", "errors.md", "troubleshooting.md", "screens/console-laptop.md"]);

  // a follow-up carries the conversation
  await page.getByTestId("ask-input").fill("and on a phone?");
  await page.getByTestId("ask-send").click();
  await expect(panel.getByTestId("ask-answer").last()).toHaveAttribute("data-done", "1", { timeout: 30_000 });
  expect(lastPrompt().messages).toEqual([
    { role: "user", content: "why is Hold grey" },
    { role: "assistant", content: HOLD_ANSWER },
    { role: "user", content: "and on a phone?" },
  ]);

  // the organiser sees this month's use on Organisation settings
  await page.goto("/org/settings");
  await expect(page.getByTestId("ask-usage")).toContainText("tokens used");

  // the platform owner finds the exchange, with its cost
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await owner.signIn(ownerPage, "/admin/ask?q=why%20is%20Hold%20grey");
  await expect(ownerPage.getByRole("heading", { name: "Ask log", level: 1 })).toBeVisible({ timeout: 60_000 });
  const row = ownerPage.getByTestId("ask-log-row").filter({ hasText: `E2E Big Air ${world.org.run}` }).first();
  await expect(row).toContainText("why is Hold grey");
  await expect(row.getByTestId("ask-log-cost")).toHaveText(/^\$0\.\d+$/);
  await expect(row).toContainText("Not right");
  // and the menu entry is there for the owner
  await expect(ownerPage.getByTestId("org-places").getByRole("link", { name: "Ask log" })).toBeVisible();
  await ownerContext.close();
});

test("on a phone the panel is a sheet from the bottom", async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await world.org.signIn(page, `/org/events/${world.eventId}`);
  await page.getByTestId("ask-button").click();
  const panel = page.getByTestId("ask-panel");
  await expect(panel).toBeVisible();
  const box = (await panel.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(388);
  expect(box.y + box.height).toBeGreaterThanOrEqual(843);
  // beach standard: the send button and the thumbs are at least 56 px tall
  expect((await page.getByTestId("ask-send").boundingBox())!.height).toBeGreaterThanOrEqual(56);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(sideways).toBe(false);
  await page.getByTestId("ask-input").fill("why is Hold grey");
  await page.getByTestId("ask-send").click();
  await expect(panel.getByTestId("ask-answer").last()).toHaveAttribute("data-done", "1", { timeout: 30_000 });
  expect((await panel.getByTestId("ask-wrong").boundingBox())!.height).toBeGreaterThanOrEqual(56);
  if (process.env.ASK_SHOTS) await page.screenshot({ path: "docs/manual/img/ask-panel-390.png" });
  await context.close();
});

test("in Dark the panel is dark too (the frame's theme carries over)", async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext();
  await context.addInitScript(() => window.localStorage.setItem("bigair.beach-theme", "dark"));
  const page = await context.newPage();
  await world.org.signIn(page, `/head/${world.eventId}`);
  await page.getByTestId("ask-button").click();
  const panel = page.getByTestId("ask-panel");
  await expect(panel).toBeVisible();
  // --beach-bg of .beach-dark is #0b0e0f
  await expect(panel).toHaveCSS("background-color", "rgb(11, 14, 15)");
  const ink = await panel.evaluate((el) => getComputedStyle(el).color);
  expect(ink).not.toBe("rgb(0, 0, 0)");
  await context.close();
});

test("visitors and a seat asking about another event are refused; a seat on its own event may ask", async ({ page, playwright, baseURL }) => {
  test.setTimeout(120_000);
  // a visitor: no session at all
  const anon = await playwright.request.newContext({ baseURL });
  const r1 = await anon.post("/api/ask", { data: { question: "why is Hold grey", context: { route: `/head/${world.eventId}`, eventId: world.eventId } } });
  expect(r1.status()).toBe(401);
  expect((await r1.json()).error).toBe("Sign in to ask. The manual is at /help.");
  expect((await (await anon.get(`/api/ask?event=${world.eventId}`)).json()).enabled).toBe(false);
  await anon.dispose();

  // the judge seat of this event sees Ask on its screen
  await world.signInAs(page, "j1", `/judge/${world.eventId}`);
  await expect(page.getByTestId("ask-button")).toBeVisible({ timeout: 60_000 });
  // …but is refused about another event of the same organisation
  const other = await world.db.from("events").insert({ organisation_id: world.orgId, name: "Other", slug: `e2e-ask-other-${world.org.run}`, status: "published", timezone: "Africa/Cairo", start_date: world.today, end_date: world.today }).select("id").single();
  const r2 = await page.request.post("/api/ask", { data: { question: "why is Hold grey", context: { route: `/judge/${other.data!.id}`, eventId: other.data!.id } } });
  expect(r2.status()).toBe(403);
  expect((await r2.json()).error).toBe("You cannot ask about this event.");
  expect((await (await page.request.get(`/api/ask?event=${other.data!.id}`)).json()).enabled).toBe(false);
});
