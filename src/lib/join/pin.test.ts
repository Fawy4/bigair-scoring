import { describe, expect, it } from "vitest";
import { generatePin, generateQrToken, isValidPin, normalizePin, joinUrl } from "./pin";

describe("PINs", () => {
  it("cleans up what a person types: spaces and dashes are ignored", () => {
    expect(normalizePin(" 482 913 ")).toBe("482913");
    expect(normalizePin("482-913")).toBe("482913");
    expect(normalizePin("48a2913")).toBe("482913");
  });
  it("accepts exactly six digits", () => {
    expect(isValidPin("482913")).toBe(true);
    expect(isValidPin("012345")).toBe(true);
    expect(isValidPin("12345")).toBe(false);
    expect(isValidPin("1234567")).toBe(false);
    expect(isValidPin("12345a")).toBe(false);
  });
  it("generates six digits including leading zeros, and covers the whole range", () => {
    expect(generatePin(() => 7)).toBe("000007");
    expect(generatePin(() => 999_999)).toBe("999999");
    for (let i = 0; i < 200; i++) expect(isValidPin(generatePin())).toBe(true);
  });
  it("generates long, URL-safe, different QR tokens", () => {
    const a = generateQrToken();
    const b = generateQrToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(a).not.toBe(b);
  });
  it("builds the QR link for a seat", () => {
    expect(joinUrl("https://x.example/", "arrow-launch", "tok_1-2")).toBe("https://x.example/e/arrow-launch/join?t=tok_1-2");
  });
});
