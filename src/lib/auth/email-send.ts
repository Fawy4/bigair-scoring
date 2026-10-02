/**
 * What happened when the auth service was asked to send a sign-in e-mail. The free plan sends only a couple of e-mails an hour, so "the limit was reached" is its own
 * answer: the owner is told in words and gets a link to copy, never a silent failure.
 */
export type EmailFailure = "rate_limit" | "not_authorised" | "other";

export function classifyEmailError(error: { code?: string; status?: number; message?: string } | null | undefined): EmailFailure | null {
  if (!error) return null;
  const text = `${error.code ?? ""} ${error.message ?? ""}`;
  if (error.code === "over_email_send_rate_limit" || error.status === 429 || /rate limit|too many|only request this after/i.test(text)) return "rate_limit";
  // the built-in sender of the free plan only writes to addresses of the project's own team
  if (error.code === "email_address_not_authorized" || /not authorized|not authorised/i.test(text)) return "not_authorised";
  return "other";
}

/** How many sign-in e-mails the plan allows per hour: 2 on the free plan; set NEXT_PUBLIC_AUTH_EMAIL_LIMIT_PER_HOUR (on Vercel, then redeploy) when the plan or the sender changes. 0 means "no limit worth mentioning". */
export function emailLimitPerHour(value: string | undefined = process.env.NEXT_PUBLIC_AUTH_EMAIL_LIMIT_PER_HOUR): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : 2;
}
