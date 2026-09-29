// Scoring engine — pure functions only (doc 03). No I/O, no clock, no React/Supabase.
export { parseScoringModel, ScoringModelError } from "@/lib/schemas/scoring-model";
export type { ScoringModel } from "@/lib/schemas/scoring-model";
export * from "./types";
export { roundHalfUp, assertOnStep, formatScore, ScoringInputError } from "./round";
export { judgeTrickScore, mapHeight } from "./judge";
export { panelScore, type PanelInput } from "./panel";
export { selectCounted, type EligibleTrick } from "./counting";
export { normaliseTrickName, repeatIndexes, flagPossibleDuplicates, checkCanAddAttempt } from "./attempts";
export { computeHeat, computeRider, maxRawFor } from "./heat";
export { rankHeat, compareTied } from "./rank";
export { explain } from "./explain";
