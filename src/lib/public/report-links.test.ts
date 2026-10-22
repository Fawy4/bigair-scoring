import { describe, expect, it } from "vitest";
import { previewHref, reportHref, riderPageHref } from "./report-links";

const riders = [{ id: "11111111-1111-4111-8111-111111111111" }, { id: "a/b c" }, { id: 'x"><img src=x onerror=alert(1)>' }];

describe("report links", () => {
  it("a rider id and an event address are encoded: a slash or a space cannot change the path", () => {
    expect(riderPageHref("my event/x", "a/b c")).toBe("/e/my%20event%2Fx/riders/a%2Fb%20c");
    expect(reportHref("e", "a b")).toBe("/e/e/riders/a%20b/report");
  });
  it("the preview address is built for a rider who is on the event's own list", () => {
    expect(previewHref("sample-open", riders[0].id, riders)).toBe("/e/sample-open/riders/11111111-1111-4111-8111-111111111111/report?preview=1");
  });
  it("an id with a slash or a space is encoded in the preview address", () => {
    expect(previewHref("sample-open", "a/b c", riders)).toBe("/e/sample-open/riders/a%2Fb%20c/report?preview=1");
  });
  it("markup in an id never reaches the address as markup", () => {
    const href = previewHref("sample-open", riders[2].id, riders)!;
    expect(href).not.toMatch(/[<>"' ]/);
  });
  it("an id that is not in the event's list gives no link, and neither does an empty choice or an unsaved event", () => {
    expect(previewHref("sample-open", "22222222-2222-4222-8222-222222222222", riders)).toBeNull();
    expect(previewHref("sample-open", "", riders)).toBeNull();
    expect(previewHref(null, riders[0].id, riders)).toBeNull();
    expect(previewHref("sample-open", riders[0].id, [])).toBeNull();
  });
});
