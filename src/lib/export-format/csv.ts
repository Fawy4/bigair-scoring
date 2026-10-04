/**
 * CSV the way Excel wants it: UTF-8 with a byte-order mark (so names with accents open right), CRLF line ends, every cell quoted only when it must be.
 * A text cell that starts with = + - @ (or a tab / return) gets a single quote put in front, so a rider called "=SUM(A1)" is shown as text
 * and never run as a formula. Numbers are written as they are.
 */
export const CSV_BOM = "﻿";

export type CsvCell = string | number | boolean | null | undefined;

const RISKY_START = /^[=+\-@\t\r]/;

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  const text = RISKY_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows to text. Rows may have different lengths (a CSV with several small tables one under the other); an empty row is a blank line. */
export function toCsv(rows: CsvCell[][]): string {
  return rows.map((r) => r.map(csvCell).join(",") + "\r\n").join("");
}
