import { describe, expect, it } from "vitest";
import { brandingPath, brandingPathFromUrl, imageProblem } from "./image";

describe("logo files", () => {
  it("accepts PNG, JPEG and WebP up to 2 MB", () => {
    expect(imageProblem({ type: "image/png", size: 1000 })).toBeNull();
    expect(imageProblem({ type: "image/jpeg", size: 2 * 1024 * 1024 })).toBeNull();
    expect(imageProblem({ type: "image/webp", size: 5 })).toBeNull();
  });
  it("explains what is wrong in plain words", () => {
    expect(imageProblem({ type: "image/svg+xml", size: 100 })).toMatch(/PNG, JPEG or WebP/);
    expect(imageProblem({ type: "application/pdf", size: 100 })).toMatch(/PNG, JPEG or WebP/);
    expect(imageProblem({ type: "image/png", size: 3 * 1024 * 1024 })).toMatch(/3\.0 MB.*2 MB/);
    expect(imageProblem({ type: "image/png", size: 0 })).toMatch(/empty/);
  });
  it("builds a path that starts with the organisation folder", () => {
    expect(brandingPath("org-1", "Event logo!", "image/png", 42)).toBe("org-1/event-logo-42.png");
    expect(brandingPath("org-1", "", "image/jpeg", 1)).toBe("org-1/image-1.jpg");
  });
  it("finds our own file behind a public URL, and only for that organisation", () => {
    const url = "https://x.supabase.co/storage/v1/object/public/branding/org-1/logo-1.png?t=3";
    expect(brandingPathFromUrl(url, "org-1")).toBe("org-1/logo-1.png");
    expect(brandingPathFromUrl(url, "org-2")).toBeNull();
    expect(brandingPathFromUrl("https://example.com/a.png", "org-1")).toBeNull();
    expect(brandingPathFromUrl(null, "org-1")).toBeNull();
  });
});
