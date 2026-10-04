/**
 * A reason is always optional (Polish 3, item 2): the box stays, one click confirms, and an empty box is written to the audit log as "no reason given".
 * The database keeps its own minimum length for a reason it is handed, so an empty box is turned into this sentence on the server before any call.
 */
export const NO_REASON = "no reason given";

export const reasonOf = (typed: string | null | undefined): string => (typed ?? "").trim() || NO_REASON;
