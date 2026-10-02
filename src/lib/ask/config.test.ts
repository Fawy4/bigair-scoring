import { describe, expect, it } from "vitest";
import { askConfig } from "./config";

// Ask Sendbook's server settings come from the environment; only names and yes/no ever leave the server.
describe("askConfig", () => {
  it("is off without a key, and says so by name only", () => {
    const c = askConfig({});
    expect(c.keyPresent).toBe(false);
    expect(c.keyName).toBe("ANTHROPIC_API_KEY");
    expect(JSON.stringify(c)).not.toMatch(/sk-/);
  });
  it("uses Sonnet 5.5 by default and Haiku 4.5 when it fails", () => {
    const c = askConfig({ ANTHROPIC_API_KEY: "sk-ant-secret" });
    expect(c).toMatchObject({ keyPresent: true, model: "claude-sonnet-5-5", fallbackModel: "claude-haiku-4-5", publicAllowed: false, hourlyLimit: 30, publicHourlyLimit: 10 });
    expect(JSON.stringify(c)).not.toContain("sk-ant-secret");
  });
  it("takes the model and the limits from the environment", () => {
    expect(askConfig({ ANTHROPIC_API_KEY: "k", ASK_SENDBOOK_MODEL: " claude-haiku-4-5 ", ASK_SENDBOOK_PUBLIC: "1", ASK_SENDBOOK_HOURLY_LIMIT: "12" })).toMatchObject({ model: "claude-haiku-4-5", publicAllowed: true, hourlyLimit: 12 });
  });
  it("ignores a key of spaces and a limit that is not a number", () => {
    expect(askConfig({ ANTHROPIC_API_KEY: "  ", ASK_SENDBOOK_HOURLY_LIMIT: "lots" })).toMatchObject({ keyPresent: false, hourlyLimit: 30 });
  });
});
