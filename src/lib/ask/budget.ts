/**
 * Ask Sendbook: what an answer costs, and what it counts against the organisation's monthly budget. Pure.
 *
 * The budget is in input tokens at their billed weight: a cached manual page read again costs a tenth of a fresh one, so it counts a tenth. Without this
 * the dependency map and errors page sent with every question (about 45 000 tokens) would use 2 million tokens in about 40 questions.
 */

export interface AskUsage {
  input_tokens: number | null;
  output_tokens: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** US dollars per million tokens (Anthropic's list prices, cached September 2026). Cache writes cost 1.25 × input, cache reads 0.1 ×. */
export const PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-opus-5-5": { input: 4, output: 20 },
};
const DEAREST = Object.values(PRICES).reduce((a, b) => (b.input > a.input ? b : a));
const CACHE_WRITE = 1.25;
const CACHE_READ = 0.1;

export const DEFAULT_MONTHLY_BUDGET = 2_000_000;
export const PER_USER_HOURLY_LIMIT = 30;

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** The cost estimate of one answer, in US dollars. An unknown model is priced at the dearest known rates. */
export function costUsd(model: string, u: AskUsage): number {
  const p = PRICES[model] ?? DEAREST;
  const input = n(u.input_tokens) * p.input + n(u.cache_creation_input_tokens) * p.input * CACHE_WRITE + n(u.cache_read_input_tokens) * p.input * CACHE_READ;
  return (input + n(u.output_tokens) * p.output) / 1_000_000;
}

/** What one answer counts against the monthly budget: input tokens at their billed weight, rounded up. Output is not counted. */
export function budgetTokens(u: AskUsage): number {
  return Math.ceil(n(u.input_tokens) + n(u.cache_creation_input_tokens) * CACHE_WRITE + n(u.cache_read_input_tokens) * CACHE_READ);
}

export interface BudgetState {
  used: number;
  limit: number;
  remaining: number;
  /** Rounded down: 99.9 % reads 99 %. */
  percent: number;
  /** At or over the budget: Ask answers with the paused sentence until the 1st of next month. */
  paused: boolean;
}

export function budgetState(used: number, limit: number): BudgetState {
  const u = Math.max(0, used);
  const l = Math.max(0, limit);
  return { used: u, limit: l, remaining: Math.max(0, l - u), percent: l > 0 ? Math.floor((u * 100) / l) : 100, paused: u >= l };
}

/** The month a budget counts: from the 1st at 00:00 UTC. */
export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** True when this person has asked `limit` questions in the last hour already. */
export function hourlyLimited(countLastHour: number, limit = PER_USER_HOURLY_LIMIT): boolean {
  return countLastHour >= limit;
}
