/** Lower case, accents removed: "José Núñez" → "jose nunez". */
export function normaliseForSearch(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** A row matches when every word typed is found somewhere in its text (any order, any column). An empty search matches everything. */
export function matchesSearch(rowText: string, query: string): boolean {
  const words = normaliseForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = normaliseForSearch(rowText);
  return words.every((w) => hay.includes(w));
}
