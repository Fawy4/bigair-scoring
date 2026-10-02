import { describe, expect, it } from "vitest";
import { classifyEmailError, emailLimitPerHour } from "./email-send";

describe("a failed sign-in e-mail is told apart", () => {
  it("nothing failed", () => expect(classifyEmailError(null)).toBeNull());
  it("the hourly limit", () => {
    expect(classifyEmailError({ code: "over_email_send_rate_limit", status: 429, message: "email rate limit exceeded" })).toBe("rate_limit");
    expect(classifyEmailError({ status: 429, message: "For security purposes, you can only request this after 52 seconds." })).toBe("rate_limit");
  });
  it("an address the plan's sender may not write to", () => expect(classifyEmailError({ code: "email_address_not_authorized", status: 400, message: "Email address not authorized" })).toBe("not_authorised"));
  it("anything else", () => expect(classifyEmailError({ status: 500, message: "boom" })).toBe("other"));
});

describe("the plan's hourly e-mail limit", () => {
  it("is 2 unless the owner says otherwise", () => {
    expect(emailLimitPerHour(undefined)).toBe(2);
    expect(emailLimitPerHour("")).toBe(2);
    expect(emailLimitPerHour("nonsense")).toBe(2);
    expect(emailLimitPerHour("30")).toBe(30);
    expect(emailLimitPerHour("0")).toBe(0);
  });
});
