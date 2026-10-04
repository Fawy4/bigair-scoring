import { beforeEach, describe, expect, it, vi } from "vitest";
import { valuesFromRow } from "@/lib/schemas/event-values";

// Saving an event answers as soon as it is stored (Speed 1): it used to call revalidatePath, which made the answer wait for the server to draw the whole page again
// (43 database requests, 8 of them one after another, 3.9 s). The screen shows what it saved by itself and refreshes the page in the background.
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const calls: string[] = [];
const fakeDb = {
  from: (table: string) => {
    calls.push(`from ${table}`);
    const row = { organisation_id: "org-1", status: "published", settings: { keep: "me" }, branding: {} };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: row, error: null }),
      update: (patch: unknown) => {
        calls.push("update");
        (fakeDb as unknown as { lastPatch: unknown }).lastPatch = patch;
        return { eq: () => ({ select: async () => ({ data: [{ id: "ev-1", slug: "my-event" }], error: null }) }) };
      },
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: "ev-new", slug: "my-event" }, error: null }) }) }),
    };
    return chain;
  },
  storage: { from: () => ({ remove: async () => ({}) }) },
};
vi.mock("@/lib/org/context", () => ({
  getDb: async () => ({ supabase: fakeDb, user: { id: "u1", email: "o@example.com", isAnonymous: false } }),
  getOrgContext: async () => ({ supabase: fakeDb, current: { id: "org-1" } }),
}));

const values = () =>
  valuesFromRow({ name: "My event", slug: "my-event", location: "El Gouna", timezone: "Africa/Cairo", start_date: "2026-10-10", end_date: "2026-10-11", settings: {}, branding: {}, is_simulation: false });

describe("saveEvent", () => {
  beforeEach(() => {
    revalidatePath.mockClear();
    calls.length = 0;
  });

  it("saving an existing event does not ask the server to draw the whole page again; it reads once and writes once", async () => {
    const { saveEvent } = await import("./actions");
    const r = await saveEvent("ev-1", values(), "published");
    expect(r).toEqual({ ok: true, id: "ev-1", slug: "my-event" });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(calls).toEqual(["from events", "from events", "update"]); // one read (to keep what later phases stored), one write
    // what was written keeps the settings later phases stored and adds the form's
    const patch = (fakeDb as unknown as { lastPatch: { settings: Record<string, unknown>; name: string } }).lastPatch;
    expect(patch.settings.keep).toBe("me");
    expect(patch.name).toBe("My event");
  });

  it("creating an event still refreshes the lists around it", async () => {
    const { saveEvent } = await import("./actions");
    const r = await saveEvent(null, values(), "draft");
    expect(r).toEqual({ ok: true, id: "ev-new", slug: "my-event" });
    expect(revalidatePath).toHaveBeenCalledWith("/org", "layout");
  });

  it("a form with a problem is refused before anything is read or written", async () => {
    const { saveEvent } = await import("./actions");
    const r = await saveEvent("ev-1", { ...values(), name: "" }, null);
    expect(r.ok).toBe(false);
    expect(calls).toEqual([]);
  });
});
