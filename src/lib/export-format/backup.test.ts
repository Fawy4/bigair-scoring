import { describe, expect, it } from "vitest";
import { BackupSchema, buildBackup, findSecrets, ROW_SECTIONS, stripSecrets, type BackupSource } from "./backup";

// Values that must never reach the file, wherever they hide.
const SECRETS = ["482913", "$2a$06$hashedpinvalueXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", "enc:v1:abcdefSECRETCIPHER", "qrtokenhashZZZ", "joinpinhashYYY", "+201000000000", "auth-user-uuid-1"];

function source(): BackupSource {
  const empty: BackupSource = {
    exportedAt: "2026-10-04T12:00:00Z",
    exportedBy: { role: "organiser", name: "owner@example.com" },
    appVersion: "0.14.0",
    organisation: { id: "org-1", name: "Arrow", slug: "arrow" },
    event: { id: "ev-1", name: "Test Open", slug: "test-open", timezone: "Africa/Cairo", trick_vocabulary_version: 3, settings: { readyCallMin: 10, join_pin_hash: "joinpinhashYYY", nested: { pin: "482913" } } },
    master: { key: "big-air-vocabulary", version: 3, contentHash: "abc" },
    localBlocks: [{ key: "x", label: "Local block", family: "spin" }],
    divisions: [{ id: "d1", name: "Pro Men", scoringModel: { key: "kota", version: 2, json: {} }, formatTemplate: null, trick_base: { layout: [] } }],
    panels: [{ id: "p1", name: "Panel" }],
    panelMembers: [{ id: "pm1", seat_no: 1 }],
    riders: [{ id: "r1", first_name: "Sam", last_name: "Rivera", email: "sam@example.com" }],
    entries: [{ id: "en1", division_id: "d1", rider_id: "r1" }],
    seats: [{ id: "s1", event_id: "ev-1", name: "Fawy", role: "head", active: true, status: "active", scores: false, spotter_assignment: null, pin_hash: SECRETS[1], pin_enc: SECRETS[2], qr_token_hash: SECRETS[3], phone: SECRETS[5], auth_user_id: SECRETS[6], device_label: "iPhone" }],
    rounds: [{ id: "ro1" }],
    heats: [{ id: "h1", status: "published", flag_out: null }],
    heatSlots: [{ id: "hs1" }],
    plans: [{ id: "pl1", items: [], actual_starts: {} }],
    attempts: [{ id: "a1", seq: 1 }],
    scores: [{ id: "sc1", score: 7.5 }],
    impressionScores: [{ id: "i1", value: 7 }],
    penalties: [],
    attemptFlags: [],
    judgeSheets: [],
    decisions: [],
    results: [{ id: "res1", version: 1 }, { id: "res2", version: 2 }],
    windCalls: [],
    feedbackNotes: [{ id: "f1", body: "note" }],
    // the audit trigger strips most secrets, but the file must not rely on it
    auditLog: [{ id: "au1", action: "update", before: { name: "Fawy", pin_hash: SECRETS[1], pin_enc: SECRETS[2] }, after: { qr_token_hash: SECRETS[3] } }],
  };
  return empty;
}

describe("event backup file", () => {
  it("round-trips through the schema check", () => {
    const file = buildBackup(source());
    const again = BackupSchema.parse(JSON.parse(JSON.stringify(file)));
    expect(again).toEqual(file);
    expect(file.counts.results).toBe(2);
    expect(file.trickBase).toEqual({ masterVersion: 3, master: { key: "big-air-vocabulary", version: 3, contentHash: "abc" }, localBlocks: [{ key: "x", label: "Local block", family: "spin" }] });
    for (const k of ROW_SECTIONS) expect(file.counts[k]).toBe((file as unknown as Record<string, unknown[]>)[k].length);
  });

  it("holds no PIN, hash, token, phone or login id anywhere, as a key or as a value", () => {
    const text = JSON.stringify(buildBackup(source()));
    for (const s of SECRETS) expect(text, `the file must not contain ${s}`).not.toContain(s);
    expect(findSecrets(JSON.parse(text))).toEqual([]);
    // the seat keeps who it is and what it may do
    expect(buildBackup(source()).officials[0]).toMatchObject({ name: "Fawy", role: "head", active: true });
  });

  it("the schema refuses a file that carries a secret key, and says where", () => {
    const file = JSON.parse(JSON.stringify(buildBackup(source())));
    file.officials[0].pin_hash = "x";
    const res = BackupSchema.safeParse(file);
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.error?.issues)).toContain("officials[0].pin_hash");
  });

  it("the schema refuses a file whose counts do not match its rows", () => {
    const file = JSON.parse(JSON.stringify(buildBackup(source())));
    file.counts.heats = 9;
    expect(BackupSchema.safeParse(file).success).toBe(false);
  });

  it("stripSecrets keeps everything else, at any depth", () => {
    expect(stripSecrets({ a: 1, pin: "x", n: [{ token: "t", ok: true }] })).toEqual({ a: 1, n: [{ ok: true }] });
  });
});
