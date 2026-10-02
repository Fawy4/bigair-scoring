import { randomTrick, rng } from "@/lib/live/practice";
export { hash32 as seedFrom } from "./random";
import type { TrickParts, TrickVocab } from "@/lib/engine/tricks";

/** What the virtual spotter knows about one rider of the running heat. */
export interface SpotterRider {
  entryId: string;
  /** Attempts logged so far (not deleted). */
  used: number;
  /** Their latest attempt, for alternating directions and repeats. */
  last: { trickName: string; direction: "left" | "right"; categoryKey: string | null; parts: TrickParts } | null;
}

export interface AttemptPlan {
  entryId: string;
  status: "landed" | "crashed";
  direction: "left" | "right";
  trickName: string;
  categoryKey: string | null;
  parts: TrickParts;
  /** The same trick as their last attempt, in the same direction. */
  repeat: boolean;
}

export interface AttemptStyle {
  /** Share of attempts that crash (0 to 0.9). */
  crashShare: number;
  /** Share of attempts that repeat the rider's last trick exactly (not for a first attempt). */
  repeatShare: number;
}

/**
 * One made-up attempt, like a spotter calling it: a trick built from the division's ticked trick base, landed or crashed, in the direction opposite to the rider's last
 * attempt (the first one is either), and now and then the same trick again. Nothing past the cap. Pure: the same seed gives the same attempt.
 */
export function planAttempt(seed: number, vocab: TrickVocab, enabledIds: string[], rider: SpotterRider, style: AttemptStyle, cap: number | null): AttemptPlan | null {
  if (cap !== null && rider.used >= cap) return null;
  const rnd = rng(seed);
  const repeat = rider.last !== null && rnd() < style.repeatShare;
  const crashed = rnd() < style.crashShare;
  if (repeat && rider.last) {
    return { entryId: rider.entryId, status: crashed ? "crashed" : "landed", direction: rider.last.direction, trickName: rider.last.trickName, categoryKey: rider.last.categoryKey, parts: structuredClone(rider.last.parts), repeat: true };
  }
  const direction: "left" | "right" = rider.last ? (rider.last.direction === "left" ? "right" : "left") : rnd() < 0.5 ? "left" : "right";
  const trick = randomTrick(rnd, vocab, enabledIds, direction);
  return { entryId: rider.entryId, status: crashed ? "crashed" : "landed", direction, trickName: trick.trickName, categoryKey: trick.categoryKey, parts: trick.parts, repeat: false };
}

/**
 * How many more attempts this rider should have logged by now. The rate is "attempts per rider per heat"; the division's cap wins; riders start a little after each other
 * so the spotters' feed is not a burst. Everything is due by the end of the heat.
 */
export function attemptsDue(input: { fraction: number; perRider: number; cap: number | null; used: number; riderIndex: number }): number {
  const target = input.cap === null ? input.perRider : Math.min(input.perRider, input.cap);
  const phase = 0.04 * (input.riderIndex % 5);
  const f = Math.min(1, Math.max(0, (input.fraction - phase) / 0.8));
  const should = Math.min(target, Math.ceil(f * target - 1e-9));
  return Math.max(0, should - input.used);
}
