/**
 * Every export (Phase 7: results, CSV, PDF, series points) leaves out simulation events: a rehearsal or a practice heat must never reach a real result sheet.
 * Run the events (or anything carrying `is_simulation`) through this before building an export.
 */
export function excludeSimulations<T extends { is_simulation?: boolean | null; isSimulation?: boolean | null }>(rows: readonly T[]): T[] {
  return rows.filter((r) => !(r.is_simulation === true || r.isSimulation === true));
}
