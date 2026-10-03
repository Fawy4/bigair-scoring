import type { SheetRow } from "./types";

/** A sheet counts as submitted when it was submitted and not re-opened since. */
export const sheetSubmitted = (s: Pick<SheetRow, "submitted_at" | "reopened_at"> | undefined): boolean => Boolean(s?.submitted_at && (!s.reopened_at || s.submitted_at > s.reopened_at));
