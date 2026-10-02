import { describe, expect, it } from "vitest";
import { parseLinkHash } from "./link-hash";

describe("the part of the address after # on the sign-in link", () => {
  it("reads the session the auth service hands back", () => {
    expect(parseLinkHash("#access_token=abc&expires_in=3600&refresh_token=def&token_type=bearer&type=magiclink")).toEqual({ kind: "session", accessToken: "abc", refreshToken: "def" });
  });
  it("tells an expired or used link from a plain visit", () => {
    expect(parseLinkHash("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired")).toEqual({ kind: "expired" });
    expect(parseLinkHash("")).toEqual({ kind: "none" });
    expect(parseLinkHash("#")).toEqual({ kind: "none" });
  });
  it("one token without the other is not a session", () => {
    expect(parseLinkHash("#access_token=abc")).toEqual({ kind: "none" });
  });
});
