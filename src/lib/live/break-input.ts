/** The length typed under "Break: Other…": "2:30" (minutes and seconds) or "3" (whole minutes), up to two hours. */
export const BREAK_MAX_SEC = 7200;
export type BreakParse = { ok: true; sec: number } | { ok: false };

export function parseBreak(text: string): BreakParse {
  const t = text.trim();
  const m = /^(\d{1,3}):([0-5]\d)$/.exec(t);
  const w = /^(\d{1,3})$/.exec(t);
  const sec = m ? Number(m[1]) * 60 + Number(m[2]) : w ? Number(w[1]) * 60 : null;
  if (sec === null || sec > BREAK_MAX_SEC) return { ok: false };
  return { ok: true, sec };
}
