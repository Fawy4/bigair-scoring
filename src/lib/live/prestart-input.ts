/** The pre-start length a head judge may type: 0:10 to 15:00. Pure, so the console and the tests share one rule (the database refuses the same range). */
export const PRESTART_MIN_SEC = 10;
export const PRESTART_MAX_SEC = 900;

export type PrestartParse = { ok: true; sec: number } | { ok: false };

/** "1:30" (minutes and seconds, seconds always two digits under 60) or "2" (whole minutes). */
export function parsePrestart(text: string): PrestartParse {
  const t = text.trim();
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(t);
  const w = /^(\d{1,2})$/.exec(t);
  const sec = m ? Number(m[1]) * 60 + Number(m[2]) : w ? Number(w[1]) * 60 : null;
  if (sec === null || sec < PRESTART_MIN_SEC || sec > PRESTART_MAX_SEC) return { ok: false };
  return { ok: true, sec };
}
