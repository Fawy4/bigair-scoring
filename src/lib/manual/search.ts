import type { SearchEntry } from "./build";

export interface SearchHit {
  id: string;
  title: string;
  page: string;
  snippet: string;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** Every word of the query must appear in the heading or its text; a hit in the heading ranks first. A short piece of text around the first match is the snippet. */
export function searchManual(entries: readonly SearchEntry[], query: string, limit = 30): SearchHit[] {
  const words = norm(query).split(/\s+/).filter((w) => w.length > 0);
  if (!words.length) return [];
  const scored: Array<{ hit: SearchHit; score: number; order: number }> = [];
  entries.forEach((e, order) => {
    const title = norm(e.title);
    const text = norm(e.text);
    if (!words.every((w) => title.includes(w) || text.includes(w))) return;
    const score = words.reduce((s, w) => s + (title.includes(w) ? 10 : 0) + (text.includes(w) ? 1 : 0), 0);
    const at = Math.max(0, text.indexOf(words[0]));
    const start = Math.max(0, at - 40);
    const snippet = e.text ? `${start > 0 ? "…" : ""}${e.text.slice(start, start + 140)}${start + 140 < e.text.length ? "…" : ""}` : "";
    scored.push({ hit: { id: e.id, title: e.title, page: e.page, snippet }, score, order });
  });
  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map((s) => s.hit);
}
