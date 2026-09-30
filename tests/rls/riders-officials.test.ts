import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, buildFixture, ENV_OK, failed, run, signedIn, uuid, type Fixture } from "./helpers";

// Phase 4a-2: riders, officials, registration, trick base, feedback notes. Each `it` is one plain sentence about who may (or may not) do what.
const codeOf = (r: { error: { message: string } | null; data: unknown }): string => r.error?.message ?? (r.data as { error?: string } | null)?.error ?? "";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

describe.skipIf(!ENV_OK)("Riders, officials, registration, trick base and feedback (hosted development project)", () => {
  let f: Fixture;
  const password = `Pw-${randomBytes(12).toString("hex")}`;
  const extraUsers: string[] = [];
  let owner: SupabaseClient;
  let staff: SupabaseClient;
  let ownerId = "";
  const ids: Record<string, string> = {};

  const user = async (key: string, withPassword = true) => {
    const email = `rls-${run}-x-${key}@example.com`;
    const { data, error } = await f.s.auth.admin.createUser({ email, email_confirm: true, ...(withPassword ? { password } : {}) });
    if (error) throw new Error(error.message);
    extraUsers.push(data.user.id);
    return { email, id: data.user.id };
  };
  const settings = async (patch: object, eventId = f.ids.evA1) => {
    const { data } = await f.s.from("events").select("settings").eq("id", eventId).single();
    await f.s.from("events").update({ settings: { ...(data!.settings as object), ...patch } }).eq("id", eventId);
  };
  const reg = (slug: string, division: string, email: string, extra: Record<string, unknown> = {}, photo: string | null = null, ip = `ip-${run}-${randomBytes(3).toString("hex")}`) =>
    f.s.rpc("register_rider", {
      p_event_slug: slug,
      p_division: division,
      p_fields: { first_name: "Zed", last_name: "Rider", email, ...extra },
      p_identifiers: {},
      p_consent: true,
      p_ip: ip,
      ...(photo ? { p_photo_path: photo } : {}),
    });
  const cairoTime = (plusMinutes: number) => {
    const d = new Date(Date.now() + plusMinutes * 60_000);
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
  };

  beforeAll(async () => {
    f = await buildFixture();
    const o = await user("owner");
    const s = await user("staff");
    await f.s.from("platform_admins").insert([{ user_id: o.id, role: "owner" }, { user_id: s.id, role: "staff" }]);
    ownerId = o.id;
    owner = await signedIn(o.email, password);
    staff = await signedIn(s.email, password);
  });
  afterAll(async () => {
    // the owner's note has no organisation, so deleting an organisation would not remove it
    if (ownerId) await f?.s.from("feedback_notes").delete().eq("author_user_id", ownerId);
    if (ids.pendingPhoto) await f?.s.storage.from("rider-photos").remove([ids.pendingPhoto]);
    await f?.s.from("platform_admins").delete().in("user_id", extraUsers);
    await f?.cleanup();
    for (const id of extraUsers) await f?.s.auth.admin.deleteUser(id);
  });

  // ------------------------------------------------------------------ small fix: does this login have a password?
  describe("has_password", () => {
    it("is false until a password is saved or used, then true (the flag lives in the login's own metadata)", async () => {
      const linkOnly = await user("linkonly", false);
      const { data } = await f.s.auth.admin.generateLink({ type: "magiclink", email: linkOnly.email });
      const c = anonClient();
      const v = await c.auth.verifyOtp({ token_hash: data!.properties!.hashed_token, type: "magiclink" });
      expect(v.error).toBeNull();
      expect((await c.rpc("has_password")).data).toBe(false);
      expect(failed(await c.auth.updateUser({ password, data: { has_password: true } }))).toBe("");
      expect((await c.rpc("has_password")).data).toBe(true);
    });
    it("is not available to visitors", async () => {
      expect(failed(await f.clients.anon.rpc("has_password"))).not.toBe("");
    });
  });

  // ------------------------------------------------------------------ riders and entries stay inside their organisation
  describe("riders and entries only inside their organisation", () => {
    it("another organisation cannot add, change or remove riders or entries of this one", async () => {
      const rider = { organisation_id: f.ids.orgA, first_name: "Sneaky", last_name: "Rider" };
      expect(failed(await f.clients.orgB.from("riders").insert(rider))).not.toBe("");
      expect(failed(await f.clients.orgB.from("entries").insert({ division_id: f.ids.divA1, rider_id: f.ids.r1, status: "confirmed", source: "manual" }))).not.toBe("");
      expect((await f.clients.orgB.from("riders").update({ first_name: "X" }).eq("id", f.ids.r1).select()).data ?? []).toEqual([]);
      expect((await f.clients.orgB.from("entries").update({ seed: 99 }).eq("id", f.ids.e1).select()).data ?? []).toEqual([]);
      expect((await f.clients.orgB.from("entries").delete().eq("id", f.ids.e1).select()).data ?? []).toEqual([]);
      expect((await f.s.from("entries").select("seed").eq("id", f.ids.e1).single()).data!.seed).toBe(1);
    });
    it("an entry cannot join a rider of one organisation to a division of another", async () => {
      expect(failed(await f.clients.orgA.from("entries").insert({ division_id: f.ids.divB1, rider_id: f.ids.r1, status: "confirmed", source: "manual" }))).not.toBe("");
      expect(failed(await f.clients.orgA.from("entries").insert({ division_id: f.ids.divA1, rider_id: f.ids.rB, status: "confirmed", source: "manual" }))).not.toBe(""); // a guessed rider id of another organisation
      expect(failed(await f.s.from("entries").insert({ division_id: f.ids.divA1, rider_id: f.ids.rB, status: "confirmed", source: "manual" }))).not.toBe("");
    });
    it("officials and visitors cannot write riders or entries", async () => {
      for (const c of [f.clients.anon, f.clients.j1, f.clients.head, f.clients.spotter]) {
        expect(failed(await c.from("riders").insert({ organisation_id: f.ids.orgA, first_name: "Nope", last_name: "Nope" }))).not.toBe("");
        expect((await c.from("entries").update({ status: "withdrawn" }).eq("id", f.ids.e1).select()).data ?? []).toEqual([]);
      }
    });
    it("a rider can be in several divisions of one organisation, but only once in each", async () => {
      const second = (await f.s.from("divisions").insert({ event_id: f.ids.evA2, name: "Second", sort_order: 2 }).select("id").single()).data!.id;
      expect(failed(await f.clients.orgA.from("entries").insert({ division_id: second, rider_id: f.ids.r1, status: "confirmed", source: "manual" }))).toBe("");
      expect(failed(await f.clients.orgA.from("entries").insert({ division_id: second, rider_id: f.ids.r1, status: "confirmed", source: "manual" }))).not.toBe("");
    });
    it("an organiser can decline a registration with a reason, and the public list never shows declined riders", async () => {
      const rider = (await f.s.from("riders").insert({ organisation_id: f.ids.orgA, first_name: "Dee", last_name: "Cline", email: `dee-${run}@example.com` }).select("id").single()).data!.id;
      const entry = (await f.s.from("entries").insert({ division_id: f.ids.divA1, rider_id: rider, status: "registered", source: "self" }).select("id").single()).data!.id;
      expect(failed(await f.clients.orgA.from("entries").update({ status: "declined", decline_reason: "Over the age limit" }).eq("id", entry))).toBe("");
      const row = (await f.clients.orgA.from("entries").select("status, decline_reason").eq("id", entry).single()).data!;
      expect(row).toMatchObject({ status: "declined", decline_reason: "Over the age limit" });
      expect(((await f.clients.anon.from("v_entries").select("id").eq("id", entry)).data ?? []).length).toBe(0);
      expect(failed(await f.clients.orgA.from("entries").update({ status: "banana" }).eq("id", entry))).not.toBe("");
    });
  });

  // ------------------------------------------------------------------ CSV import in one transaction
  describe("import_riders", () => {
    const row = (first: string, extra: Record<string, unknown> = {}) => ({ first, last: "Imported", ...extra });
    const count = async () => (await f.s.from("entries").select("id", { count: "exact", head: true }).eq("division_id", f.ids.divA2)).count!;
    it("saves every row in one step, matching riders by email and not creating them twice", async () => {
      const before = await count();
      const r = await f.clients.orgA.rpc("import_riders", {
        p_division: f.ids.divA2,
        p_rows: [row("Ivy", { email: `ivy-${run}@example.com`, seed: 2, identifiers: { vest_colour: "red", bib: "7", hacker: 1 } }), row("Jay", { seed: 1 }), row("Ana", { email: "ANA@private.example.com" })],
      });
      expect(failed(r)).toBe("");
      expect(r.data).toEqual({ created: 2, matched: 1, already: 0 }); // Ana already exists in this organisation
      expect(await count()).toBe(before + 3);
      const ivy = (await f.s.from("entries").select("seed, status, source, identifiers, riders(email)").eq("division_id", f.ids.divA2).eq("seed", 2).single()).data!;
      expect(ivy).toMatchObject({ status: "confirmed", source: "import", identifiers: { vest_colour: "red", bib: "7" } });
      expect(ivy.identifiers).not.toHaveProperty("hacker");
      expect(((await f.s.from("riders").select("id").eq("organisation_id", f.ids.orgA).ilike("email", "ana@private.example.com")).data ?? []).length).toBe(1);
    });
    it("a second import of the same people adds nobody and says so", async () => {
      const before = await count();
      const r = await f.clients.orgA.rpc("import_riders", { p_division: f.ids.divA2, p_rows: [row("Ivy", { email: `ivy-${run}@example.com` }), row("Ana", { email: "ana@private.example.com" })] });
      expect(r.data).toEqual({ created: 0, matched: 2, already: 2 });
      expect(await count()).toBe(before);
    });
    it("one bad row undoes the whole import", async () => {
      const before = await count();
      const riders = (await f.s.from("riders").select("id", { count: "exact", head: true }).eq("organisation_id", f.ids.orgA)).count!;
      const r = await f.clients.orgA.rpc("import_riders", { p_division: f.ids.divA2, p_rows: [row("Good", { email: `good-${run}@example.com` }), { first: "", last: "Broken" }] });
      expect(failed(r)).toContain("INVALID_ROWS");
      expect(await count()).toBe(before);
      expect((await f.s.from("riders").select("id", { count: "exact", head: true }).eq("organisation_id", f.ids.orgA)).count).toBe(riders);
    });
    it("another organisation, officials and visitors cannot import, and the size is limited", async () => {
      for (const c of [f.clients.orgB, f.clients.head, f.clients.anon]) expect(failed(await c.rpc("import_riders", { p_division: f.ids.divA2, p_rows: [row("Nope")] }))).not.toBe("");
      expect(failed(await f.clients.orgA.rpc("import_riders", { p_division: f.ids.divA2, p_rows: Array.from({ length: 501 }, (_, i) => row(`R${i}`)) }))).toContain("TOO_MANY_ROWS");
    });
  });

  // ------------------------------------------------------------------ seed order
  describe("set_entry_order", () => {
    const order = () => f.s.from("entries").select("id, seed").eq("division_id", f.ids.divA1).in("id", [f.ids.e1, f.ids.e2, f.ids.e3, f.ids.e4]).order("seed");
    it("renumbers the listed riders 1, 2, 3… first and everybody else after them, in one step, and remembers the shuffle code", async () => {
      const r = await f.clients.orgA.rpc("set_entry_order", { p_division: f.ids.divA1, p_entry_ids: [f.ids.e4, f.ids.e3, f.ids.e2, f.ids.e1], p_shuffle_seed: 48213 });
      expect(failed(r)).toBe("");
      expect(((await order()).data ?? []).map((x) => x.id)).toEqual([f.ids.e4, f.ids.e3, f.ids.e2, f.ids.e1]);
      expect(((await order()).data ?? []).map((x) => x.seed)).toEqual([1, 2, 3, 4]);
      expect((await f.s.from("divisions").select("seed_shuffle_seed").eq("id", f.ids.divA1).single()).data!.seed_shuffle_seed).toBe(48213);
    });
    it("moving a rider by hand keeps the code of the last shuffle, so it can be repeated; a new shuffle replaces it", async () => {
      await f.clients.orgA.rpc("set_entry_order", { p_division: f.ids.divA1, p_entry_ids: [f.ids.e1, f.ids.e2, f.ids.e3, f.ids.e4] });
      expect((await f.s.from("divisions").select("seed_shuffle_seed").eq("id", f.ids.divA1).single()).data!.seed_shuffle_seed).toBe(48213);
      await f.clients.orgA.rpc("set_entry_order", { p_division: f.ids.divA1, p_entry_ids: [f.ids.e1, f.ids.e2, f.ids.e3, f.ids.e4], p_shuffle_seed: 777 });
      expect((await f.s.from("divisions").select("seed_shuffle_seed").eq("id", f.ids.divA1).single()).data!.seed_shuffle_seed).toBe(777);
    });
    it("refuses another organisation, an entry of another division and a missing entry", async () => {
      expect(failed(await f.clients.orgB.rpc("set_entry_order", { p_division: f.ids.divA1, p_entry_ids: [f.ids.e1, f.ids.e2, f.ids.e3, f.ids.e4] }))).not.toBe("");
      expect(failed(await f.clients.orgA.rpc("set_entry_order", { p_division: f.ids.divA1, p_entry_ids: [f.ids.e1, f.ids.eB] }))).not.toBe("");
      expect(failed(await f.clients.orgA.rpc("set_entry_order", { p_division: f.ids.divA1, p_entry_ids: [f.ids.e1, uuid()] }))).not.toBe("");
      expect(((await order()).data ?? []).map((x) => x.seed)).toEqual([1, 2, 3, 4]);
    });
    it("officials cannot reorder", async () => {
      expect(failed(await f.clients.head.rpc("set_entry_order", { p_division: f.ids.divA1, p_entry_ids: [f.ids.e4, f.ids.e3, f.ids.e2, f.ids.e1] }))).not.toBe("");
      expect(((await order()).data ?? []).map((x) => x.seed)).toEqual([1, 2, 3, 4]);
    });
  });

  // ------------------------------------------------------------------ public registration, Phase 4a-2 rules
  describe("public registration", () => {
    it("is refused while registration is closed, and closed is the default", async () => {
      await settings({ registrationOpen: false });
      expect(codeOf(await reg(`rls-a1-${run}`, f.ids.divA1, "closed1@example.com"))).toBe("REGISTRATION_CLOSED");
    });
    it("is refused for an archived event and for an event of an archived organisation", async () => {
      await settings({ registrationOpen: true });
      await f.s.from("events").update({ archived_at: new Date().toISOString() }).eq("id", f.ids.evA1);
      expect(codeOf(await reg(`rls-a1-${run}`, f.ids.divA1, "archived1@example.com"))).toBe("EVENT_NOT_FOUND");
      await f.s.from("events").update({ archived_at: null }).eq("id", f.ids.evA1);
      await f.s.from("organisations").update({ archived_at: new Date().toISOString() }).eq("id", f.ids.orgA);
      expect(codeOf(await reg(`rls-a1-${run}`, f.ids.divA1, "archived2@example.com"))).toBe("EVENT_NOT_FOUND");
      await f.s.from("organisations").update({ archived_at: null }).eq("id", f.ids.orgA);
      expect(codeOf(await reg(`rls-a1-${run}`, f.ids.divA1, "archived3@example.com"))).toBe("");
    });
    it("the closing date and time: a minute ago is closed, a minute ahead is open, in the event's time zone", async () => {
      const past = cairoTime(-2);
      await settings({ registrationOpen: true, registrationClosesOn: past.date, registrationClosesTime: past.time });
      expect(codeOf(await reg(`rls-a1-${run}`, f.ids.divA1, "timed1@example.com"))).toBe("REGISTRATION_CLOSED");
      const ahead = cairoTime(5);
      await settings({ registrationOpen: true, registrationClosesOn: ahead.date, registrationClosesTime: ahead.time });
      expect(codeOf(await reg(`rls-a1-${run}`, f.ids.divA1, "timed2@example.com"))).toBe("");
      await settings({ registrationOpen: true, registrationClosesOn: null, registrationClosesTime: null });
    });
    it("a division with a maximum says it is full: the next registration is refused, other divisions are not affected", async () => {
      await settings({ registrationOpen: true, registrationMaxPerDivision: 5 });
      // divA1 already holds 4 confirmed riders plus earlier registrations: over the maximum
      const count = (await f.s.from("entries").select("id", { count: "exact", head: true }).eq("division_id", f.ids.divA1).in("status", ["registered", "confirmed"])).count!;
      await settings({ registrationOpen: true, registrationMaxPerDivision: count });
      expect(codeOf(await reg(`rls-a1-${run}`, f.ids.divA1, "full1@example.com"))).toBe("DIVISION_FULL");
      await settings({ registrationOpen: true, registrationMaxPerDivision: count + 1 });
      expect(codeOf(await reg(`rls-a1-${run}`, f.ids.divA1, "full2@example.com"))).toBe("");
      expect(codeOf(await reg(`rls-a1-${run}`, f.ids.divA1, "full3@example.com"))).toBe("DIVISION_FULL");
      await settings({ registrationOpen: true, registrationMaxPerDivision: null });
    });
    it("withdrawn and declined riders do not count towards the maximum", async () => {
      const count = (await f.s.from("entries").select("id", { count: "exact", head: true }).eq("division_id", f.ids.divA1).in("status", ["registered", "confirmed"])).count!;
      await settings({ registrationOpen: true, registrationMaxPerDivision: count });
      await f.s.from("entries").update({ status: "withdrawn" }).eq("id", f.ids.e4);
      expect(codeOf(await reg(`rls-a1-${run}`, f.ids.divA1, "full4@example.com"))).toBe("");
      await f.s.from("entries").update({ status: "confirmed" }).eq("id", f.ids.e4);
      await settings({ registrationOpen: true, registrationMaxPerDivision: null });
    });
    it("nobody can write riders or entries directly, open or not", async () => {
      await settings({ registrationOpen: true });
      expect(failed(await f.clients.anon.from("riders").insert({ organisation_id: f.ids.orgA, first_name: "Direct", last_name: "Insert", email: "direct@example.com" }))).not.toBe("");
      expect(failed(await f.clients.anon.from("entries").insert({ division_id: f.ids.divA1, rider_id: f.ids.r1, status: "registered", source: "self" }))).not.toBe("");
    });
    it("a photo must be one this function was told about: inside the organisation's own folder and really uploaded", async () => {
      await settings({ registrationOpen: true });
      const missing = `${f.ids.orgA}/reg/${uuid()}.png`;
      expect(codeOf(await reg(`rls-a1-${run}`, f.ids.divA1, "photo0@example.com", {}, missing))).toBe("INVALID_PHOTO");
      const foreign = `${f.ids.orgB}/reg/${uuid()}.png`;
      await f.s.storage.from("rider-photos").upload(foreign, PNG, { contentType: "image/png" });
      expect(codeOf(await reg(`rls-a1-${run}`, f.ids.divA1, "photo1@example.com", {}, foreign))).toBe("INVALID_PHOTO");
      await f.s.storage.from("rider-photos").remove([foreign]);
      ids.pendingPhoto = `${f.ids.orgA}/reg/${uuid()}.png`;
      expect((await f.s.storage.from("rider-photos").upload(ids.pendingPhoto, PNG, { contentType: "image/png" })).error).toBeNull();
      expect(codeOf(await reg(`rls-a1-${run}`, f.ids.divA1, "photo2@example.com", {}, ids.pendingPhoto))).toBe("");
      const rider = (await f.s.from("riders").select("photo_url").eq("organisation_id", f.ids.orgA).ilike("email", "photo2@example.com").single()).data!;
      expect(rider.photo_url).toBe(ids.pendingPhoto);
    });
    it("a photo upload slot is only given while registration is open, to the server only, and is limited per address", async () => {
      const slot = (slug: string, ext = "jpg", ip = `ip-${run}-ph-${randomBytes(3).toString("hex")}`) => f.s.rpc("request_photo_upload", { p_event_slug: slug, p_ext: ext, p_ip: ip });
      await settings({ registrationOpen: true });
      for (const c of [f.clients.anon, f.clients.orgA]) expect(failed(await c.rpc("request_photo_upload", { p_event_slug: `rls-a1-${run}`, p_ext: "jpg", p_ip: "1.1.1.1" }))).not.toBe("");
      const ok = (await slot(`rls-a1-${run}`)).data as { ok: boolean; path: string };
      expect(ok.ok).toBe(true);
      expect(ok.path).toMatch(new RegExp(`^${f.ids.orgA}/reg/[0-9a-f-]{36}\\.jpg$`));
      expect(codeOf(await slot(`rls-a1-${run}`, "svg"))).toBe("INVALID_PHOTO");
      expect(codeOf(await slot(`rls-a1-${run}`, "exe"))).toBe("INVALID_PHOTO");
      expect(codeOf(await slot("no-such-event-" + run))).toBe("EVENT_NOT_FOUND");
      await settings({ registrationOpen: false });
      expect(codeOf(await slot(`rls-a1-${run}`))).toBe("REGISTRATION_CLOSED");
      await settings({ registrationOpen: true });
      await f.s.from("events").update({ archived_at: new Date().toISOString() }).eq("id", f.ids.evA1);
      expect(codeOf(await slot(`rls-a1-${run}`))).toBe("EVENT_NOT_FOUND");
      await f.s.from("events").update({ archived_at: null }).eq("id", f.ids.evA1);
      const ip = `ip-${run}-phflood`;
      for (let i = 0; i < 10; i++) expect(codeOf(await slot(`rls-a1-${run}`, "png", ip))).toBe("");
      expect(codeOf(await slot(`rls-a1-${run}`, "png", ip))).toBe("RATE_LIMITED");
      expect(codeOf(await slot(`rls-a1-${run}`, "png", `ip-${run}-phcalm`))).toBe("");
    });
    it("the information function is for the server only, and hides archived events", async () => {
      await settings({ registrationOpen: true });
      for (const c of [f.clients.anon, f.clients.orgA]) expect(failed(await c.rpc("public_registration_info", { p_slug: `rls-a1-${run}` }))).not.toBe("");
      const info = (await f.s.rpc("public_registration_info", { p_slug: `rls-a1-${run}` })).data as { found: boolean; open: boolean; divisions: Array<{ id: string }> };
      expect(info.found).toBe(true);
      expect(info.open).toBe(true);
      expect(info.divisions.map((d) => d.id)).toContain(f.ids.divA1);
      await f.s.from("events").update({ archived_at: new Date().toISOString() }).eq("id", f.ids.evA1);
      expect(((await f.s.rpc("public_registration_info", { p_slug: `rls-a1-${run}` })).data as { found: boolean }).found).toBe(false);
      await f.s.from("events").update({ archived_at: null }).eq("id", f.ids.evA1);
      expect(((await f.s.rpc("public_registration_info", { p_slug: `rls-a2-${run}` })).data as { found: boolean }).found).toBe(false); // a draft event is not public: not found
    });
    it("the photo bucket is private, takes images up to 2 MB, and only the organisation's own people can use its folder", async () => {
      const b = (await f.s.storage.getBucket("rider-photos")).data!;
      expect(b.public).toBe(false);
      expect(b.file_size_limit).toBe(2097152);
      expect(b.allowed_mime_types).toEqual(expect.arrayContaining(["image/jpeg", "image/png", "image/webp"]));
      expect(b.allowed_mime_types).not.toContain("image/svg+xml");
      const mine = `${f.ids.orgA}/${uuid()}.png`;
      expect((await f.clients.orgA.storage.from("rider-photos").upload(mine, PNG, { contentType: "image/png" })).error).toBeNull();
      expect((await f.clients.orgB.storage.from("rider-photos").upload(`${f.ids.orgA}/${uuid()}.png`, PNG, { contentType: "image/png" })).error).not.toBeNull();
      expect((await f.clients.anon.storage.from("rider-photos").upload(`${f.ids.orgA}/${uuid()}.png`, PNG, { contentType: "image/png" })).error).not.toBeNull();
      expect((await f.clients.orgB.storage.from("rider-photos").download(mine)).error).not.toBeNull();
      expect((await f.clients.orgA.storage.from("rider-photos").download(mine)).error).toBeNull();
      await f.clients.orgA.storage.from("rider-photos").remove([mine]);
    });
  });

  // ------------------------------------------------------------------ seats, PINs, pending seats
  describe("seats and PINs", () => {
    const setPin = (seat: string, pin: string, enc: string | null = `enc-${pin}`) => f.s.rpc("set_seat_pin", { p_seat: seat, p_pin: pin, p_enc: enc });
    const joinBy = (pin: string) => f.s.rpc("bind_seat_by_pin", { p_event: f.ids.evA1, p_pin: pin, p_user: f.userIds.orgA, p_ip: `ip-${run}-${randomBytes(3).toString("hex")}` });

    it("the stored PIN is unreadable to organisers, officials and visitors", async () => {
      await setPin(f.ids.seat_j3, "555001");
      for (const c of [f.clients.orgA, f.clients.head, f.clients.j1, f.clients.anon]) {
        const r = await c.from("judge_seats").select("pin_enc").eq("id", f.ids.seat_j3);
        expect(failed(r)).not.toBe("");
      }
      expect((await f.clients.orgA.from("judge_seats").select("id, name, last_seen_at").eq("id", f.ids.seat_j3)).error).toBeNull();
      expect(failed(await f.clients.orgA.from("judge_seats").select("phone").eq("id", f.ids.seat_j3))).not.toBe(""); // contact numbers: only through the organiser-only function
      expect((await f.s.from("judge_seats").select("pin_enc").eq("id", f.ids.seat_j3).single()).data!.pin_enc).toBe("enc-555001");
    });
    it("the stored PIN never appears in the audit log", async () => {
      const rows = (await f.s.from("audit_log").select("before, after").eq("row_id", f.ids.seat_j3)).data ?? [];
      expect(JSON.stringify(rows)).not.toContain("enc-555001");
      expect(JSON.stringify(rows)).not.toContain("pin_enc");
    });
    it("nobody but the server can set, regenerate or approve", async () => {
      for (const c of [f.clients.anon, f.clients.orgA, f.clients.head]) {
        expect(failed(await c.rpc("set_seat_pin", { p_seat: f.ids.seat_j3, p_pin: "111111", p_enc: "x" }))).not.toBe("");
        expect(failed(await c.rpc("regenerate_seat_pin", { p_seat: f.ids.seat_j3, p_pin: "111111", p_enc: "x" }))).not.toBe("");
        expect(failed(await c.rpc("approve_seat", { p_seat: f.ids.seat_j3, p_pin: "111111", p_enc: "x" }))).not.toBe("");
      }
    });
    it("a regenerated PIN: the new one joins, the old one is refused, and the seat's phone is signed out", async () => {
      await setPin(f.ids.seat_j3, "555002");
      expect(codeOf(await joinBy("555002"))).toBe("");
      expect((await f.s.from("judge_seats").select("auth_user_id").eq("id", f.ids.seat_j3).single()).data!.auth_user_id).toBe(f.userIds.orgA);
      const r = await f.s.rpc("regenerate_seat_pin", { p_seat: f.ids.seat_j3, p_pin: "555003", p_enc: "enc-555003" });
      expect(r.data).toEqual({ ok: true });
      expect(codeOf(await joinBy("555002"))).toBe("INVALID_PIN"); // the old value is refused
      expect((await f.s.from("judge_seats").select("auth_user_id, bound_at, pin_enc").eq("id", f.ids.seat_j3).single()).data).toMatchObject({ auth_user_id: null, bound_at: null, pin_enc: "enc-555003" });
      expect(codeOf(await joinBy("555003"))).toBe("");
      await f.s.from("judge_seats").update({ auth_user_id: null }).eq("id", f.ids.seat_j3);
    });
    it("a regenerated PIN that is already another seat's is refused and changes nothing", async () => {
      await setPin(f.ids.seat_j2, "555004");
      const r = await f.s.rpc("regenerate_seat_pin", { p_seat: f.ids.seat_j3, p_pin: "555004", p_enc: "e" });
      expect(codeOf(r)).toBe("PIN_IN_USE");
      expect((await f.s.from("judge_seats").select("pin_enc").eq("id", f.ids.seat_j3).single()).data!.pin_enc).toBe("enc-555003");
    });
    it("a seat that is connected and scoring in a heat that is running cannot be regenerated: it names the heat", async () => {
      // Judge 1 sits on the panel of Pro, where Heat 1 is running
      const r = await f.s.rpc("regenerate_seat_pin", { p_seat: f.ids.seat_j1, p_pin: "555005", p_enc: "e" });
      expect(r.data).toMatchObject({ ok: false, error: "SEAT_IN_HEAT", heat_number: 1 });
      expect((await f.s.from("judge_seats").select("auth_user_id").eq("id", f.ids.seat_j1).single()).data!.auth_user_id).toBe(f.userIds.j1);
      // the head judge and the spotter work every heat
      for (const k of ["head", "spotter"]) expect(((await f.s.rpc("regenerate_seat_pin", { p_seat: f.ids["seat_" + k], p_pin: "555006", p_enc: "e" })).data as { error: string }).error).toBe("SEAT_IN_HEAT");
    });
    it("a paused heat counts too", async () => {
      await f.s.from("heats").update({ status: "paused", paused_at: new Date().toISOString() }).eq("id", f.ids.H1);
      expect(((await f.s.rpc("regenerate_seat_pin", { p_seat: f.ids.seat_j1, p_pin: "555005", p_enc: "e" })).data as { error: string }).error).toBe("SEAT_IN_HEAT");
      await f.s.from("heats").update({ status: "running", paused_at: null }).eq("id", f.ids.H1);
    });
    it("a seat nobody is connected to can be regenerated even while a heat runs", async () => {
      await f.s.from("judge_seats").update({ auth_user_id: null }).eq("id", f.ids.seat_j2);
      expect((await f.s.rpc("regenerate_seat_pin", { p_seat: f.ids.seat_j2, p_pin: "555007", p_enc: "enc-555007" })).data).toEqual({ ok: true });
    });
    it("approving a pending seat gives it a PIN and lets it join; before that it cannot", async () => {
      await f.s.rpc("request_seat", { p_event_slug: `rls-a1-${run}`, p_name: "Pia Pending", p_role: "judge", p_ip: `ip-${run}-ap`, p_phone: "+201234567" });
      const seat = (await f.s.from("judge_seats").select("id, status, phone").eq("event_id", f.ids.evA1).eq("name", "Pia Pending").single()).data!;
      expect(seat).toMatchObject({ status: "pending", phone: "+201234567" });
      expect(((await f.clients.orgA.rpc("get_seat_contacts", { p_event: f.ids.evA1 })).data as Array<{ seat_id: string; phone: string }>).find((c) => c.seat_id === seat.id)?.phone).toBe("+201234567");
      expect(failed(await f.clients.head.rpc("get_seat_contacts", { p_event: f.ids.evA1 }))).not.toBe("");
      expect(failed(await f.clients.orgB.rpc("get_seat_contacts", { p_event: f.ids.evA1 }))).not.toBe("");
      expect(codeOf(await joinBy("555008"))).toBe("INVALID_PIN");
      expect((await f.s.rpc("approve_seat", { p_seat: seat.id, p_pin: "555008", p_enc: "enc-555008" })).data).toEqual({ ok: true });
      expect((await f.s.from("judge_seats").select("status").eq("id", seat.id).single()).data!.status).toBe("active");
      expect(codeOf(await joinBy("555008"))).toBe("");
      expect(codeOf(await f.s.rpc("approve_seat", { p_seat: seat.id, p_pin: "555009", p_enc: "e" }))).toBe("NOT_PENDING");
      await f.s.from("judge_seats").update({ auth_user_id: null }).eq("id", seat.id);
    });
    it("a pending seat cannot join with a QR token either", async () => {
      await f.s.rpc("request_seat", { p_event_slug: `rls-a1-${run}`, p_name: "Quinn Pending", p_role: "spotter", p_ip: `ip-${run}-qr` });
      const seat = (await f.s.from("judge_seats").select("id").eq("event_id", f.ids.evA1).eq("name", "Quinn Pending").single()).data!;
      await f.s.rpc("set_seat_qr", { p_seat: seat.id, p_token: "t".repeat(24), p_expires: new Date(Date.now() + 3600_000).toISOString() });
      const r = await f.s.rpc("bind_seat_by_token", { p_event: f.ids.evA1, p_token: "t".repeat(24), p_user: f.userIds.orgA, p_ip: `ip-${run}-qr2` });
      expect(codeOf(r)).toBe("INVALID_TOKEN");
    });
    it("an archived event refuses the self-add form like an unknown event", async () => {
      await f.s.from("events").update({ archived_at: new Date().toISOString() }).eq("id", f.ids.evA1);
      expect(codeOf(await f.s.rpc("request_seat", { p_event_slug: `rls-a1-${run}`, p_name: "Late Larry", p_role: "judge", p_ip: `ip-${run}-arc` }))).toBe("EVENT_NOT_FOUND");
      await f.s.from("events").update({ archived_at: null }).eq("id", f.ids.evA1);
    });
    it("the heartbeat updates only the caller's own seat, and does not fill the audit log", async () => {
      const before = (await f.s.from("audit_log").select("id", { count: "exact", head: true }).eq("row_id", f.ids.seat_head)).count!;
      expect(failed(await f.clients.head.rpc("touch_seat"))).toBe("");
      expect(failed(await f.clients.head.rpc("touch_seat"))).toBe("");
      const seen = (await f.s.from("judge_seats").select("id, last_seen_at").eq("event_id", f.ids.evA1)).data!;
      expect(seen.find((s) => s.id === f.ids.seat_head)!.last_seen_at).not.toBeNull();
      expect(seen.find((s) => s.id === f.ids.seat_spotter)!.last_seen_at).toBeNull();
      expect((await f.s.from("audit_log").select("id", { count: "exact", head: true }).eq("row_id", f.ids.seat_head)).count).toBe(before);
      expect(failed(await f.clients.anon.rpc("touch_seat"))).not.toBe("");
    });
    it("joining also records the first sighting", async () => {
      await setPin(f.ids.seat_announcer, "555010");
      await f.s.from("judge_seats").update({ auth_user_id: null, last_seen_at: null }).eq("id", f.ids.seat_announcer);
      await joinBy("555010");
      expect((await f.s.from("judge_seats").select("last_seen_at").eq("id", f.ids.seat_announcer).single()).data!.last_seen_at).not.toBeNull();
      await f.s.from("judge_seats").update({ auth_user_id: f.userIds.announcer }).eq("id", f.ids.seat_announcer);
    });
  });

  // ------------------------------------------------------------------ panels
  describe("panels", () => {
    it("an organiser picks the judges of a division: one panel, seats numbered in the order given", async () => {
      expect(failed(await f.clients.orgA.rpc("set_division_panel", { p_division: f.ids.divA1, p_seat_ids: [f.ids.seat_j2, f.ids.seat_j1] }))).toBe("");
      const pm = (await f.s.from("panel_members").select("judge_seat_id, seat_no").eq("panel_id", f.ids.panelA1).order("seat_no")).data!;
      expect(pm).toEqual([{ judge_seat_id: f.ids.seat_j2, seat_no: 1 }, { judge_seat_id: f.ids.seat_j1, seat_no: 2 }]);
    });
    it("a division without a panel gets one", async () => {
      expect(failed(await f.clients.orgA.rpc("set_division_panel", { p_division: f.ids.divA2, p_seat_ids: [] }))).toBe("");
      expect((await f.s.from("divisions").select("panel_id").eq("id", f.ids.divA2).single()).data!.panel_id).not.toBeNull();
    });
    it("a division with no panel gets one, with the scoring head judge already on it", async () => {
      await f.clients.orgA.rpc("set_seat_scores", { p_seat: f.ids.seat_head, p_scores: true });
      const fresh = (await f.s.from("divisions").insert({ event_id: f.ids.evA1, name: "Fresh division", sort_order: 7 }).select("id").single()).data!.id;
      const panel = await f.clients.orgA.rpc("ensure_division_panel", { p_division: fresh });
      expect(failed(panel)).toBe("");
      const members = (await f.s.from("panel_members").select("judge_seat_id").eq("panel_id", panel.data as string)).data!;
      expect(members.map((m) => m.judge_seat_id)).toEqual([f.ids.seat_head]);
      expect((await f.clients.orgA.rpc("ensure_division_panel", { p_division: fresh })).data).toBe(panel.data); // asking again changes nothing
      expect(failed(await f.clients.orgB.rpc("ensure_division_panel", { p_division: fresh }))).not.toBe("");
      expect(failed(await f.clients.head.rpc("ensure_division_panel", { p_division: fresh }))).not.toBe("");
      await f.clients.orgA.rpc("set_seat_scores", { p_seat: f.ids.seat_head, p_scores: false });
    });
    it("refuses another organisation, officials, and seats of another event or of the wrong role", async () => {
      expect(failed(await f.clients.orgB.rpc("set_division_panel", { p_division: f.ids.divA1, p_seat_ids: [f.ids.seat_j1] }))).not.toBe("");
      expect(failed(await f.clients.head.rpc("set_division_panel", { p_division: f.ids.divA1, p_seat_ids: [f.ids.seat_j1] }))).not.toBe("");
      expect(failed(await f.clients.orgA.rpc("set_division_panel", { p_division: f.ids.divA1, p_seat_ids: [f.ids.seat_bJudge] }))).not.toBe("");
      expect(failed(await f.clients.orgA.rpc("set_division_panel", { p_division: f.ids.divA1, p_seat_ids: [f.ids.seat_spotter] }))).not.toBe("");
      const pm = (await f.s.from("panel_members").select("judge_seat_id").eq("panel_id", f.ids.panelA1)).data!;
      expect(pm).toHaveLength(2); // unchanged after every refusal
    });
    it("'Head judge also scores' puts the head judge on every panel of the event, and off takes them out", async () => {
      const second = (await f.s.from("divisions").insert({ event_id: f.ids.evA1, name: "Second panel division", sort_order: 5 }).select("id").single()).data!.id;
      expect(failed(await f.clients.orgA.rpc("set_division_panel", { p_division: second, p_seat_ids: [f.ids.seat_j1] }))).toBe("");
      expect(failed(await f.clients.orgA.rpc("set_seat_scores", { p_seat: f.ids.seat_head, p_scores: true }))).toBe("");
      for (const d of [f.ids.divA1, second]) {
        const panel = (await f.s.from("divisions").select("panel_id").eq("id", d).single()).data!.panel_id;
        expect(((await f.s.from("panel_members").select("judge_seat_id").eq("panel_id", panel).eq("judge_seat_id", f.ids.seat_head)).data ?? []).length).toBe(1);
      }
      expect(failed(await f.clients.orgA.rpc("set_seat_scores", { p_seat: f.ids.seat_head, p_scores: false }))).toBe("");
      const panel = (await f.s.from("divisions").select("panel_id").eq("id", f.ids.divA1).single()).data!.panel_id;
      expect(((await f.s.from("panel_members").select("judge_seat_id").eq("panel_id", panel).eq("judge_seat_id", f.ids.seat_head)).data ?? []).length).toBe(0);
      expect(failed(await f.clients.orgB.rpc("set_seat_scores", { p_seat: f.ids.seat_head, p_scores: true }))).not.toBe("");
    });
  });

  // ------------------------------------------------------------------ trick base
  describe("trick base on the division", () => {
    it("is stored on the division and can be changed freely before any heat has started", async () => {
      expect(failed(await f.clients.orgA.from("divisions").update({ trick_base: { disabled: ["base:backroll", "addon:late"] } }).eq("id", f.ids.divA2))).toBe("");
      expect(failed(await f.clients.orgA.from("divisions").update({ trick_base: { disabled: [] } }).eq("id", f.ids.divA2))).toBe("");
    });
    it("once a heat has started: ticking more is fine, unticking a block is refused", async () => {
      await f.s.from("divisions").update({ trick_base: { disabled: ["base:backroll"] } }).eq("id", f.ids.divA1);
      expect(failed(await f.clients.orgA.from("divisions").update({ trick_base: { disabled: [] } }).eq("id", f.ids.divA1))).toBe("");
      expect(failed(await f.clients.orgA.from("divisions").update({ trick_base: { disabled: ["base:frontroll"] } }).eq("id", f.ids.divA1))).toContain("TRICK_BASE_LOCKED");
      expect((await f.s.from("divisions").select("trick_base").eq("id", f.ids.divA1).single()).data!.trick_base).toEqual({ disabled: [] });
    });
    it("a division's own scheme and description are kept; another organisation cannot change them", async () => {
      const scheme = { scheme: { id: "x" } };
      expect(failed(await f.clients.orgA.from("divisions").update({ identification: scheme, description: "Advanced riders" }).eq("id", f.ids.divA2))).toBe("");
      expect((await f.clients.orgB.from("divisions").update({ description: "hacked" }).eq("id", f.ids.divA2).select()).data ?? []).toEqual([]);
      expect(failed(await f.clients.orgA.from("divisions").update({ description: "x".repeat(400) }).eq("id", f.ids.divA2))).not.toBe("");
    });
    it("the event's own blocks can be added after a heat has started but not taken away", async () => {
      const vocab = (blocks: object[]) => ({ event_id: f.ids.evA1, organisation_id: f.ids.orgA, key: "event-additions", json: { blocks }, content_hash: "h" });
      const b1 = { family: "base", key: "local_sloth", label: "Sloth", status: "proposed" };
      const b2 = { family: "addon", key: "local_shark", label: "Shark", status: "proposed" };
      const ins = await f.clients.orgA.from("trick_vocabularies").insert(vocab([b1])).select("id").single();
      expect(ins.error).toBeNull();
      const id = ins.data!.id;
      expect(failed(await f.clients.orgA.from("trick_vocabularies").update({ json: { blocks: [b1, b2] } }).eq("id", id))).toBe("");
      expect(failed(await f.clients.orgA.from("trick_vocabularies").update({ json: { blocks: [b2] } }).eq("id", id))).toContain("TRICK_BASE_LOCKED");
      expect(((await f.s.from("trick_vocabularies").select("json").eq("id", id).single()).data!.json as { blocks: unknown[] }).blocks).toHaveLength(2);
      expect((await f.clients.orgB.from("trick_vocabularies").update({ json: { blocks: [] } }).eq("id", id).select()).data ?? []).toEqual([]);
    });
    it("the owner sees every event's proposals and other people do not", async () => {
      const seen = await owner.rpc("admin_trick_proposals");
      expect(seen.error).toBeNull();
      expect(JSON.stringify(seen.data)).toContain("local_sloth");
      expect(failed(await f.clients.orgA.rpc("admin_trick_proposals"))).not.toBe("");
      expect(failed(await f.clients.anon.rpc("admin_trick_proposals"))).not.toBe("");
    });
  });

  // ------------------------------------------------------------------ feedback notes
  describe("feedback notes", () => {
    const note = (client: SupabaseClient, author: string, org: string | null, extra: Record<string, unknown> = {}) =>
      client.from("feedback_notes").insert({ author_user_id: author, author_role: "organiser", organisation_id: org, page: "/org/events/x/riders", page_label: "Riders step", body: "Seed column too narrow", tag: "layout", ...extra }).select("id").single();

    it("an organiser leaves a note for their own organisation; their colleagues see it, another organisation does not", async () => {
      const r = await note(f.clients.orgA, f.userIds.orgA, f.ids.orgA);
      expect(r.error).toBeNull();
      ids.noteA = r.data!.id;
      expect(((await f.clients.orgA.from("feedback_notes").select("id").eq("id", ids.noteA)).data ?? []).length).toBe(1);
      expect(((await f.clients.orgB.from("feedback_notes").select("id").eq("id", ids.noteA)).data ?? []).length).toBe(0);
      expect(((await f.clients.anon.from("feedback_notes").select("id")).data ?? []).length).toBe(0);
    });
    it("officials and visitors cannot leave notes, and nobody can write a note in someone else's name or another organisation's", async () => {
      expect(failed(await note(f.clients.anon, f.userIds.orgA, f.ids.orgA))).not.toBe("");
      expect(failed(await note(f.clients.j1, f.userIds.j1, f.ids.orgA))).not.toBe("");
      expect(failed(await note(f.clients.head, f.userIds.head, f.ids.orgA))).not.toBe("");
      expect(failed(await note(f.clients.orgB, f.userIds.orgA, f.ids.orgB))).not.toBe(""); // not their own user id
      expect(failed(await note(f.clients.orgB, f.userIds.orgB, f.ids.orgA))).not.toBe(""); // not their organisation
      expect(failed(await note(f.clients.orgA, f.userIds.orgA, null))).not.toBe(""); // a note with no organisation is an owner's note
    });
    it("the owner sees the notes of every organisation; staff and organisers of other organisations do not", async () => {
      expect(((await owner.from("feedback_notes").select("id").eq("id", ids.noteA)).data ?? []).length).toBe(1);
      expect(((await staff.from("feedback_notes").select("id").eq("id", ids.noteA)).data ?? []).length).toBe(0);
    });
    it("the owner can leave a note with no organisation, and only the owner sees it", async () => {
      const r = await note(owner, ownerId, null, { author_role: "owner", page: "/admin", page_label: "Admin · Organisations" });
      expect(r.error).toBeNull();
      ids.noteOwner = r.data!.id;
      expect(((await f.clients.orgA.from("feedback_notes").select("id").eq("id", ids.noteOwner)).data ?? []).length).toBe(0);
    });
    it("only the owner can mark a note done, change its kind or record an export; the text cannot be edited by anyone", async () => {
      expect((await f.clients.orgA.from("feedback_notes").update({ status: "done" }).eq("id", ids.noteA).select()).data ?? []).toEqual([]);
      expect((await staff.from("feedback_notes").update({ status: "done" }).eq("id", ids.noteA).select()).data ?? []).toEqual([]);
      expect(failed(await owner.from("feedback_notes").update({ status: "done", tag: "bug", exported_at: new Date().toISOString() }).eq("id", ids.noteA))).toBe("");
      const row = (await f.s.from("feedback_notes").select("status, tag, exported_at, done_at").eq("id", ids.noteA).single()).data!;
      expect(row).toMatchObject({ status: "done", tag: "bug" });
      expect(row.exported_at).not.toBeNull();
      expect(row.done_at).not.toBeNull();
      expect(failed(await owner.from("feedback_notes").update({ body: "rewritten" }).eq("id", ids.noteA))).not.toBe("");
      expect(failed(await owner.from("feedback_notes").update({ tag: "banana" }).eq("id", ids.noteA))).not.toBe("");
    });
    it("a note needs a real kind and some text", async () => {
      expect(failed(await note(f.clients.orgA, f.userIds.orgA, f.ids.orgA, { tag: "banana" }))).not.toBe("");
      expect(failed(await note(f.clients.orgA, f.userIds.orgA, f.ids.orgA, { body: "   " }))).not.toBe("");
      expect(failed(await note(f.clients.orgA, f.userIds.orgA, f.ids.orgA, { body: "x".repeat(4001) }))).not.toBe("");
    });
    it("screenshots live in a private folder: an organisation reaches only its own, the owner reaches all", async () => {
      const path = `${f.ids.orgA}/${uuid()}.png`;
      expect((await f.clients.orgA.storage.from("feedback").upload(path, PNG, { contentType: "image/png" })).error).toBeNull();
      expect((await f.clients.orgB.storage.from("feedback").upload(`${f.ids.orgA}/${uuid()}.png`, PNG, { contentType: "image/png" })).error).not.toBeNull();
      expect((await f.clients.orgB.storage.from("feedback").download(path)).error).not.toBeNull();
      expect((await owner.storage.from("feedback").download(path)).error).toBeNull();
      expect((await f.clients.anon.storage.from("feedback").download(path)).error).not.toBeNull();
      expect((await f.s.storage.getBucket("feedback")).data!.public).toBe(false);
      await f.s.storage.from("feedback").remove([path]);
    });
    it("deleting an organisation deletes its notes", async () => {
      const r = await note(f.clients.orgB, f.userIds.orgB, f.ids.orgB);
      expect(r.error).toBeNull();
      await f.s.rpc("purge_organisation", { p_org: f.ids.orgB });
      expect(((await f.s.from("feedback_notes").select("id").eq("id", r.data!.id)).data ?? []).length).toBe(0);
    });
  });
});
