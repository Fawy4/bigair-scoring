import { describe, expect, it, vi } from "vitest";
import { attempt, isNextControlFlow } from "./safe";
import { checkServerConfig } from "./config-check";
import { formatWhen } from "./event-label";

describe("attempt: a failing part of a page becomes a readable message, not a crash", () => {
  it("returns the value when nothing fails", async () => {
    expect(await attempt("Organisations", async () => 42, 0)).toEqual({ value: 42, problem: null });
  });
  it("returns the fallback and a plain message when something throws, and logs it for the server logs", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await attempt("Organisations", async () => { throw new Error("boom: something specific"); }, [] as number[]);
    expect(r.value).toEqual([]);
    expect(r.problem).toBe("Organisations: boom: something specific");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
  it("never swallows Next.js redirects and 404s (they are not errors)", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/org/login;307;" });
    const notFound = Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(isNextControlFlow(redirect)).toBe(true);
    expect(isNextControlFlow(notFound)).toBe(true);
    expect(isNextControlFlow(new Error("x"))).toBe(false);
    await expect(attempt("x", async () => { throw redirect; }, 0)).rejects.toBe(redirect);
    await expect(attempt("x", async () => { throw notFound; }, 0)).rejects.toBe(notFound);
  });
  it("keeps very long messages short", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await attempt("Part", async () => { throw new Error("y".repeat(1000)); }, 0);
    expect(r.problem!.length).toBeLessThanOrEqual(260);
    log.mockRestore();
  });
});

describe("formatWhen never throws", () => {
  it("falls back to UTC when the time zone is not known to this machine", () => {
    expect(formatWhen("2026-10-10T12:30:00Z", "Mars/Olympus")).toBe("10 Oct 2026, 12:30");
    expect(formatWhen("2026-10-10T12:30:00Z", "")).toBe("10 Oct 2026, 12:30");
  });
});

describe("server configuration check: which settings exist, never their values", () => {
  const full = { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k1", SUPABASE_SERVICE_ROLE_KEY: "secret-value", NEXT_PUBLIC_PRODUCT_NAME: "Sendbook" };
  it("lists the required names and whether each is set", () => {
    const rows = checkServerConfig(full);
    expect(rows.find((r) => r.name === "SUPABASE_SERVICE_ROLE_KEY")).toMatchObject({ required: true, present: true });
    expect(rows.find((r) => r.name === "NEXT_PUBLIC_SUPABASE_URL")).toMatchObject({ required: true, present: true });
  });
  it("reports a missing or blank name as missing", () => {
    const rows = checkServerConfig({ NEXT_PUBLIC_SUPABASE_URL: "  ", SUPABASE_SERVICE_ROLE_KEY: undefined });
    expect(rows.find((r) => r.name === "NEXT_PUBLIC_SUPABASE_URL")?.present).toBe(false);
    expect(rows.find((r) => r.name === "SUPABASE_SERVICE_ROLE_KEY")?.present).toBe(false);
    expect(rows.find((r) => r.name === "NEXT_PUBLIC_PRODUCT_NAME")).toMatchObject({ required: false, present: false });
  });
  it("never contains a value", () => {
    expect(JSON.stringify(checkServerConfig(full))).not.toContain("secret-value");
    expect(JSON.stringify(checkServerConfig(full))).not.toContain("supabase.co");
  });
});
