// Timetable engine — pure functions only (docs/04 §7). "Now" is always a parameter; no I/O, no clock.
export * from "./types";
export { localToUtc, utcToLocalHHMM, addMinutes, tzOffsetMs, toIso } from "./time";
export { computeTimetable } from "./timetable";
export { startHold, resumeHold, shift, activatePlan, type HeatLookup } from "./actions";
export { breakCountdown, extendBreak, setBreak, resumeBreak, nextHeatInOrder, startsOutOfOrder, type BreakCountdown, type BreakNone } from "./break";
export { resolveHeatRefs } from "./resolve";
export {
  addHeatToPlan,
  addHeatsToPlan,
  addBreak,
  addNote,
  removeItem,
  moveItem,
  nudgeItem,
  setPin,
  setDuration,
  setBreakAfter,
  setWarmUp,
  renameItem,
  unscheduledHeats,
  clearPlan,
  duplicatePlan,
  activate,
  deletePlan,
  changeHeatLength,
  lengthText,
  timetableExportRows,
  ladderTime,
  aboutHours,
  RunOrderError,
  type HeatInfo,
  type UnscheduledGroup,
  type ExportRow,
} from "./run-order";
