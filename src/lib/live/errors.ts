import { copy } from "@/lib/ui-copy";

/** The database raises errors like "DRAW_NOT_LOCKED: Pro Men"; the part before the colon is the code, the rest is a detail for the sentence. */
export function parseError(message: string | null | undefined): { code: string | null; detail?: string } {
  const m = /^([A-Z][A-Z0-9_]{2,})(?::\s*(.*))?$/s.exec((message ?? "").trim());
  return m ? { code: m[1], ...(m[2] ? { detail: m[2] } : {}) } : { code: null };
}

/** A plain sentence for any error the live screens can meet. */
export function errorSentence(message: string | null | undefined): string {
  const { code, detail } = parseError(message);
  const make = code ? copy.liveErrors.codes[code] : undefined;
  if (make) return make(detail);
  if (/fetch|network|failed to load|timeout/i.test(message ?? "")) return copy.liveErrors.network;
  return copy.liveErrors.unknown;
}
