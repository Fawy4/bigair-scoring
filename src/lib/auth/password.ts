/** The shortest password the app accepts (the hosted auth setting is kept at the same number). */
export const MIN_PASSWORD_LENGTH = 8;

/** Plain-language check of a new password and its repeat; null = fine. */
export function passwordProblem(password: string, again: string): "short" | "mismatch" | null {
  if (password.length < MIN_PASSWORD_LENGTH) return "short";
  if (password !== again) return "mismatch";
  return null;
}
