/** Next.js uses thrown errors for redirects and 404s; those must always travel on. */
export function isNextControlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") || digest === "NEXT_NOT_FOUND");
}

/**
 * Runs one part of a page. If it fails, the page still renders: the failure is logged (so it shows in the server logs with its label)
 * and returned as a short plain message to show on screen. Redirects and 404s are never swallowed.
 */
export async function attempt<T>(label: string, run: () => Promise<T>, fallback: T): Promise<{ value: T; problem: string | null }> {
  try {
    return { value: await run(), problem: null };
  } catch (error) {
    if (isNextControlFlow(error)) throw error;
    console.error(`[admin] ${label} failed:`, error);
    const message = error instanceof Error ? error.message : String(error);
    return { value: fallback, problem: `${label}: ${message}`.slice(0, 240) };
  }
}
