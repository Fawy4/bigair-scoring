/** Folded section cards (Polish 3, item 11): the first card on a page starts open and the others folded; what the person chose last is remembered in this browser. */
export const foldKey = (id: string): string => `bigair:fold:${id}`;

export type FoldSaved = "open" | "closed" | null;

/** The state a card starts in: the remembered choice if there is one, else open for the first card of the page and folded for the others. */
export function foldInitial(saved: FoldSaved, first: boolean): boolean {
  if (saved === "open") return true;
  if (saved === "closed") return false;
  return first;
}

export const foldSaved = (raw: string | null | undefined): FoldSaved => (raw === "open" || raw === "closed" ? raw : null);

/** The folded cards of the Event step (its "More settings"), in page order; the first one starts open. The browser tests open them all to keep their old steps simple. */
export const EVENT_FOLD_IDS = ["slug", "branding", "simulation", "timing", "scoring", "flags", "public-page", "registration", "join"] as const;
