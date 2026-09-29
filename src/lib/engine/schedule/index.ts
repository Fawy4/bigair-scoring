// Timetable engine — pure functions only (docs/04 §7). "Now" is always a parameter; no I/O, no clock.
export * from "./types";
export { localToUtc, utcToLocalHHMM, addMinutes, tzOffsetMs, toIso } from "./time";
export { computeTimetable } from "./timetable";
export { startHold, resumeHold, shift, activatePlan, type HeatLookup } from "./actions";
export { resolveHeatRefs } from "./resolve";
