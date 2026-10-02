import { describe, expect, it } from "vitest";
import { budgetState, budgetTokens, costUsd, DEFAULT_MONTHLY_BUDGET, hourlyLimited, monthStartUtc, PER_USER_HOURLY_LIMIT } from "./budget";

// Ask Sendbook: what an answer costs, what it counts against the organisation's monthly budget, and the per-person hourly limit.
const usage = { input_tokens: 1_000, output_tokens: 500, cache_creation_input_tokens: 40_000, cache_read_input_tokens: 0 };
const cached = { input_tokens: 1_000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 40_000 };

describe("costUsd", () => {
  it("prices a first question on Sonnet 5.5 (cache written)", () => {
    // 1 000 × $2 + 40 000 × $2.50 + 500 × $10, per million
    expect(costUsd("claude-sonnet-5-5", usage)).toBeCloseTo(0.002 + 0.1 + 0.005, 6);
  });
  it("prices a follow-up on Sonnet 5.5 (cache read at a tenth)", () => {
    expect(costUsd("claude-sonnet-5-5", cached)).toBeCloseTo(0.002 + 0.008 + 0.005, 6);
  });
  it("prices Haiku 4.5 at its own rates", () => {
    expect(costUsd("claude-haiku-4-5", cached)).toBeCloseTo(0.001 + 0.004 + 0.0025, 6);
  });
  it("prices an unknown model at the dearest known rates (never under-reports)", () => {
    expect(costUsd("claude-something-new", cached)).toBeGreaterThanOrEqual(costUsd("claude-sonnet-5-5", cached));
  });
  it("treats missing numbers as 0", () => {
    expect(costUsd("claude-sonnet-5-5", { input_tokens: 0, output_tokens: 0 })).toBe(0);
  });
});

describe("budgetTokens", () => {
  it("counts input at its billed weight: cache writes 1.25, cache reads 0.1, output not at all", () => {
    expect(budgetTokens(usage)).toBe(1_000 + 50_000);
    expect(budgetTokens(cached)).toBe(1_000 + 4_000);
  });
  it("rounds up", () => {
    expect(budgetTokens({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 5 })).toBe(1);
  });
});

describe("budgetState", () => {
  it("default budget is 2 million input tokens", () => {
    expect(DEFAULT_MONTHLY_BUDGET).toBe(2_000_000);
  });
  it("is open below the budget and paused at or over it (a soft stop)", () => {
    expect(budgetState(0, 2_000_000)).toEqual({ used: 0, limit: 2_000_000, remaining: 2_000_000, percent: 0, paused: false });
    expect(budgetState(1_999_999, 2_000_000).paused).toBe(false);
    expect(budgetState(2_000_000, 2_000_000)).toMatchObject({ remaining: 0, percent: 100, paused: true });
    expect(budgetState(2_600_000, 2_000_000)).toMatchObject({ remaining: 0, percent: 130, paused: true });
  });
  it("a budget of 0 pauses Ask for that organisation", () => {
    expect(budgetState(0, 0).paused).toBe(true);
  });
  it("rounds the percentage down so 99.9 % does not read as 100 %", () => {
    expect(budgetState(1_999_000, 2_000_000).percent).toBe(99);
  });
});

describe("monthStartUtc", () => {
  it("is the first day of the month at 00:00 UTC", () => {
    expect(monthStartUtc(new Date("2026-10-08T21:30:00Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(monthStartUtc(new Date("2026-01-01T00:00:00Z")).toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("hourlyLimited", () => {
  it("allows 30 questions an hour per person, the 31st is refused", () => {
    expect(PER_USER_HOURLY_LIMIT).toBe(30);
    expect(hourlyLimited(29)).toBe(false);
    expect(hourlyLimited(30)).toBe(true);
    expect(hourlyLimited(5, 5)).toBe(true);
  });
});
