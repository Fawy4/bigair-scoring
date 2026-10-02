import { errorSentence, parseError } from "@/lib/live/errors";
import { copy } from "@/lib/ui-copy";

/** A plain sentence for a database or server error of the simulator: its own words first, then the live screens' words, then a generic one. */
export function simErrorSentence(message: string | null | undefined): string {
  const { code, detail } = parseError(message);
  const own = code ? copy.simulator.errors[code] : undefined;
  if (own) return own(detail);
  const live = errorSentence(message);
  if (live !== copy.liveErrors.unknown) return live;
  // an error nobody planned a sentence for: the person sees the plain line, the server log keeps the real one
  if (message) console.error("[simulator] unexpected error:", message);
  return copy.simulator.generic;
}

export const simErrorCode = (message: string | null | undefined): string | null => parseError(message).code;
