import { readFileSync } from "node:fs";
import { test, expect } from "./base";
import { createOrganiser } from "./organiser";

type Org = Awaited<ReturnType<typeof createOrganiser>>;

async function eventWithDivisions(org: Org, names: string[], settings: object = {}) {
  const { data: ev } = await org.db.from("events").insert({ organisation_id: org.orgId, name: `Riders Cup ${org.run}`, slug: `e2e-riders-${org.run}`, status: "draft", start_date: "2026-10-10", end_date: "2026-10-11", settings }).select("id").single();
  const divisions: Record<string, string> = {};
  for (const [i, name] of names.entries()) {
    const { data: d } = await org.db.from("divisions").insert({ event_id: ev!.id, name, sort_order: i + 1 }).select("id").single();
    divisions[name] = d!.id;
  }
  return { eventId: ev!.id, divisions };
}

const names = async (page: import("@playwright/test").Page) => page.getByTestId("rider-row").evaluateAll((rows) => rows.map((r) => (r.querySelector("input[aria-label^='First name']") as HTMLInputElement).value));

const CSV_10 = [
  "First,Last,Nationality,Email,Phone,Sponsor,Seed",
  "Ana,Alpha,EG,ana@example.com,,Acme,1",
  "Ben,Bravo,DE,ben@example.com,,,2",
  "Cy,Charlie,FR,cy@example.com,,,3",
  "Di,Delta,ES,di@example.com,,,4",
  "Eli,Echo,IT,eli@example.com,,,5",
  "Fay,Foxtrot,NL,not-an-email,,,6",
  "Gus,Golf,GR,gus@example.com,,,7",
  "Hal,Hotel,PL,hal@example.com,,,8",
  "Ida,India,SE,ida@example.com,,,9",
  "Jo,Juliet,DK,jo@example.com,,,10",
].join("\n");

test("Riders step: paste a CSV with one bad row, see the problem line before anything is saved, import the rest, then reorder, shuffle, add, print", async ({ page }) => {
  test.setTimeout(240_000);
  const org = await createOrganiser();
  try {
    const { eventId, divisions } = await eventWithDivisions(org, ["Pro Men"]);
    await org.signIn(page, `/org/events/${eventId}/riders`);
    await expect(page.getByRole("heading", { name: "Step 3: Riders" })).toBeVisible();
    await expect(page.getByTestId("scheme-line")).toContainText("Name call-out");

    // paste: the preview lists one line per problem and saves nothing
    await page.getByLabel("Paste the rows here").fill(CSV_10);
    await page.getByTestId("csv-preview").click();
    await expect(page.getByTestId("csv-summary")).toContainText("9 riders ready to import, 1 row with a problem");
    await expect(page.getByTestId("csv-problem")).toHaveCount(1);
    await expect(page.getByTestId("csv-problem")).toContainText("Line 7");
    await expect(page.getByTestId("csv-problem")).toContainText("not-an-email");
    const { count: before } = await org.db.from("entries").select("id", { count: "exact", head: true }).eq("division_id", divisions["Pro Men"]);
    expect(before).toBe(0);

    await page.getByTestId("csv-import").click();
    await expect(page.getByTestId("rider-row")).toHaveCount(9);
    expect(await names(page)).toEqual(["Ana", "Ben", "Cy", "Di", "Eli", "Gus", "Hal", "Ida", "Jo"]);
    // Rider label column: under Name call-out the name is the big text
    await expect(page.getByTestId("rider-label-cell").first()).toContainText("Ana Alpha");

    // the tap alternative: move Cy up one place; seeds are renumbered 1…9
    await page.getByRole("button", { name: "Move Cy Charlie up" }).click();
    await expect.poll(async () => (await names(page)).slice(0, 3).join(",")).toBe("Ana,Cy,Ben");
    await expect
      .poll(async () => (await org.db.from("entries").select("seed").eq("division_id", divisions["Pro Men"]).order("seed")).data!.map((e) => e.seed).join(","))
      .toBe("1,2,3,4,5,6,7,8,9");
    const { data: seeds } = await org.db.from("entries").select("seed, riders(first_name)").eq("division_id", divisions["Pro Men"]).order("seed");
    expect((seeds![1].riders as unknown as { first_name: string }).first_name).toBe("Cy");

    // drag: take the first rider by the handle and drop them below the third
    const beforeDrag = await names(page);
    const handle = page.getByRole("button", { name: /^Drag .* to a new place$/ }).first();
    const target = page.getByTestId("rider-row").nth(2);
    const hb = (await handle.boundingBox())!;
    const tb = (await target.boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + 10, { steps: 4 });
    await page.mouse.move(tb.x + 20, tb.y + tb.height / 2 + 10, { steps: 12 });
    await page.mouse.up();
    await expect.poll(async () => (await names(page)).join(",")).not.toBe(beforeDrag.join(","));
    const afterDrag = await names(page);
    expect(afterDrag[0]).toBe(beforeDrag[1]);
    expect(afterDrag.slice().sort()).toEqual(beforeDrag.slice().sort());
    await expect.poll(async () => (await org.db.from("entries").select("seed, riders(first_name)").eq("division_id", divisions["Pro Men"]).order("seed")).data!.map((e) => (e.riders as unknown as { first_name: string }).first_name).join(",")).toBe(afterDrag.join(","));

    // shuffle is repeatable: the same stored code gives the same order again
    await page.getByTestId("shuffle").click();
    await expect(page.getByTestId("shuffle-code")).toBeVisible();
    const shuffled = await (async () => {
      await expect.poll(async () => (await names(page)).join(",")).not.toBe(afterDrag.join(","));
      return names(page);
    })();
    const { data: stored } = await org.db.from("divisions").select("seed_shuffle_seed").eq("id", divisions["Pro Men"]).single();
    expect(stored!.seed_shuffle_seed).toBeGreaterThan(0);
    // move somebody by hand, then repeat the shuffle: everybody goes back to exactly the shuffled order
    const moved = shuffled[2];
    await page.getByRole("button", { name: new RegExp(`^Move ${moved} .* down$`) }).click();
    await expect.poll(async () => (await names(page)).join(",")).not.toBe(shuffled.join(","));
    await page.getByTestId("shuffle-repeat").click();
    await expect.poll(async () => (await names(page)).join(",")).toBe(shuffled.join(","));

    // sort by seed number: type a seed into a cell, then sort
    await page.getByLabel(/^Seed: Jo Juliet$/).fill("1");
    await page.getByLabel(/^Seed: Jo Juliet$/).blur();
    await expect(page.getByTestId("clash-warnings")).toContainText("Seed 1 is given to more than one rider"); // a warning, not a block
    await page.getByTestId("sort-by-seed").click();
    await expect.poll(async () => (await org.db.from("entries").select("seed").eq("division_id", divisions["Pro Men"]).order("seed")).data!.map((e) => e.seed).join(",")).toBe("1,2,3,4,5,6,7,8,9");

    // add by hand, then mark withdrawn
    await page.getByLabel("First name", { exact: true }).last().fill("Kai");
    await page.getByLabel("Last name", { exact: true }).last().fill("Kilo");
    await page.getByTestId("add-rider").click();
    await expect(page.getByTestId("rider-row")).toHaveCount(10);
    await page.getByLabel("Status: Kai Kilo").selectOption("withdrawn");
    await expect.poll(async () => (await org.db.from("entries").select("status, riders!inner(first_name)").eq("riders.first_name", "Kai").single()).data?.status).toBe("withdrawn");

    // inline edit of a name is saved
    await page.getByLabel("Sponsor: Ana Alpha").fill("Big Sponsor");
    await page.getByLabel("Sponsor: Ana Alpha").blur();
    await expect.poll(async () => (await org.db.from("riders").select("sponsor").eq("organisation_id", org.orgId).eq("first_name", "Ana").single()).data?.sponsor).toBe("Big Sponsor");

    // the start list prints the nine riders taking part
    const [popup] = await Promise.all([page.waitForEvent("popup"), page.getByTestId("print-start-list").click()]);
    await expect(popup.getByTestId("start-list").locator("tbody tr")).toHaveCount(9);
    await expect(popup.getByRole("heading", { name: "Start list: Pro Men" })).toBeVisible();
  } finally {
    await org.cleanup();
  }
});

test("Riders step: warns, never blocks, when two riders share a bib; every scheme shows the Rider label judges will see", async ({ page }) => {
  test.setTimeout(180_000);
  const org = await createOrganiser();
  try {
    const file = JSON.parse(readFileSync("presets/identification/schemes.json", "utf8")) as { palette: unknown; schemes: Array<{ id: string }> };
    const bib = { ...file.schemes.find((s) => s.id === "bib-numbers")!, palette: file.palette };
    const { eventId } = await eventWithDivisions(org, ["Pro Men"], { identification: { scheme: bib, basedOn: "bib-numbers", allowDivisionOverride: false } });
    await org.signIn(page, `/org/events/${eventId}/riders`);
    await expect(page.getByTestId("scheme-line")).toContainText("Bib / sail numbers");
    await page.getByLabel("Paste the rows here").fill("First,Last,Bib,Kite brand,Kite model,Kite size,Kite colours\nAna,Alpha,14,North,Orbit,9,blue\nBen,Bravo,14,Duotone,Evo,12,red\nCy,Charlie,7,,,,");
    await page.getByTestId("csv-preview").click();
    await expect(page.getByTestId("csv-warnings")).toContainText("Bib 14");
    await page.getByTestId("csv-import").click(); // a warning never blocks
    await expect(page.getByTestId("rider-row")).toHaveCount(3);
    await expect(page.getByTestId("clash-warnings")).toContainText("Bib 14 is used by more than one rider: Ana Alpha, Ben Bravo");
    // the Rider label column shows the bib as the big text
    await expect(page.getByTestId("rider-label-cell").first()).toContainText("14");
    await expect(page.getByLabel("Bib: Ana Alpha")).toHaveValue("14");
    // fixing it inline clears the warning
    await page.getByLabel("Bib: Ben Bravo").fill("15");
    await page.getByLabel("Bib: Ben Bravo").blur();
    await expect(page.getByTestId("clash-warnings")).toHaveCount(0);
  } finally {
    await org.cleanup();
  }
});

test("Riders step: add a returning rider from the organisation, approve and decline registrations from the public page", async ({ page }) => {
  test.setTimeout(180_000);
  const org = await createOrganiser();
  try {
    const { eventId, divisions } = await eventWithDivisions(org, ["Pro Men", "Pro Women"]);
    const mk = async (first: string, email: string) => (await org.db.from("riders").insert({ organisation_id: org.orgId, first_name: first, last_name: "Returning", email }).select("id").single()).data!.id;
    const ret = await mk("Rex", `rex-${org.run}@example.com`);
    await org.db.from("entries").insert({ division_id: divisions["Pro Men"], rider_id: ret, seed: 1, status: "confirmed", source: "manual" });
    const reg1 = await mk("Reg", `reg1-${org.run}@example.com`);
    const reg2 = await mk("Nope", `reg2-${org.run}@example.com`);
    for (const r of [reg1, reg2]) await org.db.from("entries").insert({ division_id: divisions["Pro Women"], rider_id: r, status: "registered", source: "self", consent_at: new Date().toISOString() });

    await org.signIn(page, `/org/events/${eventId}/riders?division=${divisions["Pro Women"]}`);
    await expect(page.getByTestId("registration")).toHaveCount(2);
    // approve → confirmed and in the table
    await page.getByTestId("registration").filter({ hasText: "Reg Returning" }).getByRole("button", { name: "Approve" }).click();
    await expect(page.getByTestId("rider-row")).toHaveCount(1);
    await expect(page.getByTestId("registration")).toHaveCount(1);
    expect((await org.db.from("entries").select("status").eq("rider_id", reg1).single()).data!.status).toBe("confirmed");
    // decline with a reason
    await page.getByTestId("registration").getByRole("button", { name: "Decline" }).click();
    await page.getByLabel("Reason (optional").fill("Over the age limit");
    await page.getByRole("button", { name: "Decline this registration" }).click();
    await expect(page.getByTestId("registration")).toHaveCount(0);
    expect((await org.db.from("entries").select("status, decline_reason").eq("rider_id", reg2).single()).data).toMatchObject({ status: "declined", decline_reason: "Over the age limit" });

    // a returning rider is ticked, not retyped
    await page.getByLabel("Search by name").fill("Rex");
    await page.getByTestId("org-rider-list").getByRole("checkbox").first().check();
    await page.getByRole("button", { name: /^Add 1 rider$/ }).click();
    await expect(page.getByTestId("rider-row")).toHaveCount(2);
    const { count } = await org.db.from("riders").select("id", { count: "exact", head: true }).eq("organisation_id", org.orgId).eq("first_name", "Rex");
    expect(count).toBe(1); // one rider record, now in two divisions
  } finally {
    await org.cleanup();
  }
});
