/**
 * Tidy trick names for what a spotter types (both spotter views). Pure: no I/O.
 *  - the first letter is a capital ("backroll" → "Backroll");
 *  - a one- or two-digit number at the start is a COUNT, written in front of the trick as "6x": "6 front rolls" → "6x Frontroll", "3x kiteloop" → "3x Kiteloop".
 *    Three digits or more is not a count ("720" stays "720"), and a number with nothing after it is not one either.
 */
const COUNT = /^\s*(\d{1,2})(?:\s+|\s*[x×]\s*)([A-Za-z].*)$/;

/** The count at the start of the text and what is left after it; the text itself, with no count, when it does not start with one. */
export function splitCount(text: string): { count: number | null; rest: string } {
  const m = COUNT.exec(text);
  if (!m) return { count: null, rest: text };
  // "3 x kiteloop": the lone x belongs to the count
  const rest = m[2].replace(/^[x×]\s+/i, "");
  const count = Number(m[1]);
  return count > 0 && rest.trim() ? { count, rest: rest.trim() } : { count: null, rest: text };
}

/** A name starts with a capital letter; a count in front ("6x ") stays and the trick after it gets the capital. */
export function capitaliseName(name: string): string {
  const m = /^(\d{1,2}x\s+)?(\p{L})/u.exec(name);
  if (!m) return name;
  const head = m[1] ?? "";
  return head + m[2].toUpperCase() + name.slice(head.length + m[2].length);
}
