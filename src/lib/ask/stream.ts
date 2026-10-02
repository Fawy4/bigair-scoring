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

/** The first link to /help the answer gives that the manual really has ("/help#dep-hold" or a full address ending in it). */
export function findCitation(answer: string, anchors: ReadonlyMap<string, string>): Citation | null {
  for (const m of answer.matchAll(/\/help#([A-Za-z0-9_-]+)/g)) {
    const title = anchors.get(m[1]);
    if (title) return { href: `/help#${m[1]}`, title };
  }
  return null;
}
