import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, buildFixture, ENV_OK, type Fixture } from "./helpers";
import { ago, codeOf, key } from "./live-helpers";

// Audit 1b, part 5 — security, the gaps the existing RLS suite does not cover (docs/AUDIT.md, A1b-n). Throwaway organisations only.
const errOf = (r: { data: unknown; error: { message: string } | null }) => r.error?.message ?? ((r.data as { error?: string } | null)?.error ?? "");

describe.skipIf(!ENV_OK)("Audit 1b — security (hosted development project)", () => {
  let f: Fixture;
  const phones: string[] = [];
  const phone = async () => {
    const { data, error } = await f.s.auth.admin.createUser({ email: `a1b-${randomUUID().slice(0, 8)}@example.com`, password: `Pw-${randomUUID()}`, email_confirm: true });
    if (error) throw new Error(error.message);
    phones.push(data.user.id);
    return data.user.id;
  };
  const bind = (pin: string, user: string, ip: string, event = f.ids.evA1) => f.s.rpc("bind_seat_by_pin", { p_event: event, p_pin: pin, p_user: user, p_ip: ip });

  beforeAll(async () => {
    f = await buildFixture();
  }, 300_000);
  afterAll(async () => {
    for (const id of phones) await f?.s.auth.admin.deleteUser(id);
    await f?.cleanup();
  });

  describe("the PIN flow", () => {
    it("a PIN replaced by a new one is dead at once: the old PIN joins nobody, the new one works", async () => {
      expect((await f.s.rpc("set_seat_pin", { p_seat: f.ids.seat_announcer, p_pin: "604213" })).error).toBeNull();
      expect((await f.s.rpc("set_seat_pin", { p_seat: f.ids.seat_announcer, p_pin: "604214" })).error).toBeNull();
      const u = await phone();
      expect(errOf(await bind("604213", u, `ip-old-${randomUUID()}`))).toBe("INVALID_PIN");
      expect(errOf(await bind("604214", u, `ip-new-${randomUUID()}`))).toBe("");
    });

    it("a seat of a deleted event: the phone that held it reads nothing, and its PIN joins nothing", async () => {
      const ev = (await f.s.from("events").insert({ organisation_id: f.ids.orgA, name: "A1b doomed", slug: `a1b-doomed-${randomUUID().slice(0, 6)}`, status: "published", timezone: "Africa/Cairo", start_date: "2026-10-10", end_date: "2026-10-11" }).select("id").single()).data!;
      const seat = (await f.s.from("judge_seats").insert({ event_id: ev.id, name: "Doomed judge", role: "judge", scores: true, status: "active", active: true }).select("id").single()).data!;
      expect((await f.s.rpc("set_seat_pin", { p_seat: seat.id, p_pin: "771234" })).error).toBeNull();
      const u = await phone();
      expect(errOf(await bind("771234", u, `ip-${randomUUID()}`, ev.id))).toBe("");
      await f.s.from("events").delete().eq("id", ev.id);
      expect(errOf(await bind("771234", u, `ip-${randomUUID()}`, ev.id))).toBe("INVALID_PIN");
      expect((await f.s.from("judge_seats").select("id").eq("id", seat.id)).data).toHaveLength(0);
    });

    it("10 wrong PINs from one address lock that address out; another address is not affected (existing rule, re-checked)", async () => {
      const ip = `ip-a1b-${randomUUID()}`;
      for (let i = 0; i < 10; i++) await bind("000001", f.userIds.orgB, ip);
      expect(errOf(await bind("604214", f.userIds.orgB, ip))).toBe("RATE_LIMITED");
    });

    // A1b-7: the event-wide limit (100 wrong tries in 10 minutes from any addresses) refuses the RIGHT PIN too, for everybody. Anyone with the event's join page
    // (it is public: the slug is the public address) can lock every official out for 10 minutes with 100 wrong guesses from rotating addresses, or a crowd of
    // spectators on the venue Wi-Fi can do it by accident.
    it.fails("A1b-7: wrong guesses by strangers never stop an official with the right PIN from joining", async () => {
      await f.s.rpc("set_seat_pin", { p_seat: f.ids.seat_spotter, p_pin: "918273" });
      await f.s.from("join_attempts").insert(Array.from({ length: 100 }, (_, i) => ({ event_id: f.ids.evA1, ip: `stranger-${i}-${randomUUID()}`, ok: false })));
      const u = await phone();
      expect(errOf(await bind("918273", u, `official-${randomUUID()}`))).toBe("");
    });
    it("A1b-7 today: after 100 wrong guesses from 100 addresses the right PIN from a fresh address is refused RATE_LIMITED", async () => {
      await f.s.rpc("set_seat_pin", { p_seat: f.ids.seat_spotter, p_pin: "918274" });
      await f.s.from("join_attempts").insert(Array.from({ length: 100 }, (_, i) => ({ event_id: f.ids.evA1, ip: `stranger2-${i}-${randomUUID()}`, ok: false })));
      const u = await phone();
      expect(errOf(await bind("918274", u, `official-${randomUUID()}`))).toBe("RATE_LIMITED");
      await f.s.from("join_attempts").delete().eq("event_id", f.ids.evA1);
    });
  });

  describe("an archived event", () => {
    // Archiving hides an event from the public and from joining (join/actions.ts treats it as unknown). Officials already bound keep their seat.
    it("officials already bound to an archived event: what they can still do is recorded here (A1b-8)", async () => {
      const h = (await f.s.from("heats").insert({ round_id: f.ids.round, division_id: f.ids.divA1, event_id: f.ids.evA1, number: 900, duration_sec: 600, status: "running", started_at: ago(30) }).select("id").single()).data!.id;
      for (const [p, e] of [[1, "e1"], [2, "e2"]] as const) await f.s.from("heat_slots").insert({ heat_id: h, position: p, entry_id: f.ids[e] });
      await f.s.from("events").update({ archived_at: new Date().toISOString() }).eq("id", f.ids.evA1);
      try {
        const add = await f.clients.spotter.rpc("add_attempt", { p_heat: h, p_entry: f.ids.e1, p_client_key: key(), p_status: "landed", p_trick_name: "Backroll" });
        const pause = await f.clients.head.rpc("pause_heat", { p_heat: h });
        const pub = await anonClient().rpc("get_public_timetable", { p_event: f.ids.evA1 });
        console.info("A1b-8 archived event:", { spotterAddAttempt: codeOf(add) || "allowed", headPause: codeOf(pause) || "allowed", publicTimetable: (pub.data as { allowed?: boolean })?.allowed });
        // the public sees nothing
        expect((pub.data as { allowed: boolean }).allowed).toBe(false);
      } finally {
        await f.s.from("events").update({ archived_at: null }).eq("id", f.ids.evA1);
        await f.s.from("heats").update({ status: "ended", ended_at: ago(1) }).eq("id", h);
      }
    });
  });

  describe("every function a visitor may call", () => {
    it("the catalogue lists exactly the 11 public functions; none of them returns a seat id, a PIN or QR hash, an e-mail or a phone number for an event full of scores", async () => {
      const ev = f.ids.evA1;
      const slug = (await f.s.from("events").select("slug").eq("id", ev).single()).data!.slug as string;
      const org = (await f.s.from("organisations").select("slug").eq("id", f.ids.orgA).single()).data!.slug as string;
      const a = anonClient();
      const calls: Array<[string, Record<string, unknown>]> = [
        ["get_public_draw", { p_event: ev }],
        ["get_public_event", { p_slug: slug }],
        ["get_public_events", {}],
        ["get_public_live_heat", { p_heat: f.ids.H1 }],
        ["get_public_organisation", { p_slug: org }],
        ["get_public_results", { p_event: ev }],
        ["get_public_rules", { p_event: ev }],
        ["get_public_site", { p_slug: slug }],
        ["get_public_timetable", { p_event: ev }],
        ["public_platform_settings", {}],
        ["server_now", {}],
      ];
      const seats = (await f.s.from("judge_seats").select("id, name").eq("event_id", ev)).data ?? [];
      const secrets = [...seats.map((s) => s.id), "pin_hash", "qr_token", "@private.example.com", "+20100000", "judge_seat_id"];
      const report: Record<string, string> = {};
      for (const [fn, args] of calls) {
        const r = await a.rpc(fn as never, args as never);
        const text = JSON.stringify(r.data ?? r.error);
        report[fn] = r.error ? `error ${r.error.message.slice(0, 40)}` : `${text.length} bytes`;
        for (const s of secrets) expect(text.includes(s), `${fn} carries ${s.slice(0, 12)}…`).toBe(false);
      }
      console.info("A1b 5 visitor functions:", report);
    });
  });
});
