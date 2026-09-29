/** Only allow in-app paths after sign-in ("/org/events/1?tab=riders"), never another site. */
export function safeNext(next: string | null | undefined, fallback = "/org"): string {
  if (!next) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return fallback;
  }
  for (const candidate of [next, decoded]) {
    if (!candidate.startsWith("/")) return fallback;
    if (candidate.startsWith("//") || candidate.startsWith("/\\")) return fallback;
    if (/[\u0000-\u001f\u007f]/.test(candidate)) return fallback;
  }
  return next;
}
