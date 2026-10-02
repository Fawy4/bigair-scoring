import { PER_USER_HOURLY_LIMIT } from "./budget";

/** Questions a visitor's address may ask per hour when ASK_SENDBOOK_PUBLIC=1. */
export const PUBLIC_HOURLY_LIMIT = 10;
export const DEFAULT_ASK_MODEL = "claude-sonnet-5-5";
export const FALLBACK_ASK_MODEL = "claude-haiku-4-5";

export interface AskConfig {
  keyName: "ANTHROPIC_API_KEY";
  /** Only whether the key exists, never its value. */
  keyPresent: boolean;
  model: string;
  /** Used when the main model fails before it has written anything. */
  fallbackModel: string;
  /** ASK_SENDBOOK_PUBLIC=1: visitors on the public pages may ask too (per address limit). */
  publicAllowed: boolean;
  hourlyLimit: number;
  publicHourlyLimit: number;
}

const int = (v: string | undefined, fallback: number) => (v && /^\d+$/.test(v.trim()) ? Number(v.trim()) : fallback);

/** Ask Sendbook's server settings, from the environment. */
export function askConfig(env: Record<string, string | undefined>): AskConfig {
  return {
    keyName: "ANTHROPIC_API_KEY",
    keyPresent: Boolean(env.ANTHROPIC_API_KEY?.trim()),
    model: env.ASK_SENDBOOK_MODEL?.trim() || DEFAULT_ASK_MODEL,
    fallbackModel: env.ASK_SENDBOOK_FALLBACK_MODEL?.trim() || FALLBACK_ASK_MODEL,
    publicAllowed: env.ASK_SENDBOOK_PUBLIC?.trim() === "1",
    hourlyLimit: int(env.ASK_SENDBOOK_HOURLY_LIMIT, PER_USER_HOURLY_LIMIT),
    publicHourlyLimit: PUBLIC_HOURLY_LIMIT,
  };
}
