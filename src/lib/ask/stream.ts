/** Ask Sendbook's answer travels as one JSON object per line: pieces of text as they arrive, then one "done" (or one "error"). */

export interface Citation {
  href: string;
  title: string;
}

export type AskEvent =
  | { type: "text"; text: string }
  | { type: "done"; logId: string | null; cite: Citation | null; model: string }
  | { type: "error"; message: string };

export const ASK_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

export function encodeEvent(e: AskEvent): string {
  return `${JSON.stringify(e)}\n`;
}

/** Splits what arrived into events; an unfinished last line is kept in `rest` for the next chunk. A line that is not JSON is skipped. */
export function decodeLines(rest: string, chunk: string): { events: AskEvent[]; rest: string } {
  const lines = (rest + chunk).split("\n");
  const tail = lines.pop() ?? "";
  const events: AskEvent[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as AskEvent;
      if (e && typeof e === "object" && typeof e.type === "string") events.push(e);
    } catch {
      // not an event
    }
  }
  return { events, rest: tail };
}

/** What the citation finder needs from the manual (askManual() has all three). */
export interface CiteIndex {
  /** Every /help anchor with its title. */
  anchors: ReadonlyMap<string, string>;
  pages?: ReadonlyArray<{ title: string; anchor: string }>;
  /** The /help search index: each heading and anchored row with its page's title. */
  search?: ReadonlyArray<{ id: string; title: string; page: string }>;
}

const plain = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[*_`“”"'’]/g, "").replace(/\s+/g, " ").trim();
/** "Dependency map" names "Dependency map: what must be true first"; "Start heat" names "Start a heat (head console Start heat)". */
const names = (said: string, title: string) => {
  const a = plain(said);
  const b = plain(title.split(" · ")[0]);
  if (!a || !b) return false;
  if (b.startsWith(a) || a.startsWith(b) || b.includes(a)) return true;
  const words = a.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  return words.length > 0 && words.every((w) => b.includes(w));
};

/**
 * The manual page the answer cites. The instructions ask for "(Manual: Dependency map › Start heat)"; a /help link ("/help#dep-hold", or a full address
 * ending in it) counts too. The page is matched by its title, the part after "›" by a heading or anchored row of that page; a name the manual does not
 * have cites nothing.
 */
export function findCitation(answer: string, manual: CiteIndex | ReadonlyMap<string, string>): Citation | null {
  const index: CiteIndex = manual instanceof Map ? { anchors: manual } : (manual as CiteIndex);
  for (const m of answer.matchAll(/\/help#([A-Za-z0-9_-]+)/g)) {
    const title = index.anchors.get(m[1]);
    if (title) return { href: `/help#${m[1]}`, title };
  }
  for (const m of answer.matchAll(/Manual:\s*([^)\n]+)/g)) {
    const [pageSaid, ...rest] = m[1].split(/\s*›\s*/);
    const page = index.pages?.find((p) => names(pageSaid, p.title));
    if (!page) continue;
    const sectionSaid = rest.join(" › ").replace(/[.;,]+$/, "");
    if (sectionSaid) {
      const section = index.search?.find((e) => e.page === page.title && e.id !== page.anchor && names(sectionSaid, e.title));
      if (section) return { href: `/help#${section.id}`, title: `${page.title.split(":")[0]} › ${section.title.split(" · ")[0]}` };
    }
    return { href: `/help#${page.anchor}`, title: page.title };
  }
  return null;
}
