import { describe, expect, it } from "vitest";
import { copy } from "@/lib/ui-copy";
import { whatsappLink } from "./contact";

describe("whatsappLink", () => {
  it("keeps digits only and encodes the message", () => {
    expect(whatsappLink("+20 100-123 4567", copy.landing.contactMessage)).toBe("https://wa.me/201001234567?text=Hi!%20I%20saw%20Sendbook%20and%20I'd%20like%20to%20know%20more.");
  });
  it("is nothing when the number is empty or missing", () => {
    expect(whatsappLink("", "x")).toBeNull();
    expect(whatsappLink(undefined, "x")).toBeNull();
    expect(whatsappLink(" + - ", "x")).toBeNull();
  });
});
