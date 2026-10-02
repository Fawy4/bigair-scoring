import { sanitizeAskContext, type AskContext } from "./context";

/**
 * Ask Sendbook: what the browser gathers from the screen at the moment a question is asked. Runs in the browser only. Everything goes through
 * sanitizeAskContext, so whatever this finds, only the whitelisted fields leave the page, without PINs, e-mail addresses or scores.
 */

let lastRefusal: string | null = null;

/** The Learn-more watcher calls this for every refusal sentence it recognises; the latest one is "the last refusal sentence shown on this page". */
export function noteRefusal(sentence: string): void {
  if (sentence.trim()) lastRefusal = sentence.trim();
}
/** A new page: forget the old page's sentence. */
export function forgetRefusals(): void {
  lastRefusal = null;
}

const ID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const EVENT_IN_PATH = new RegExp(`^/(?:org/events|head|judge|spot|screen)/(${ID})`);
const HEAT_IN_PATH = new RegExp(`/heat/(${ID})`);
/** The Ask panel itself, and anything a page marks as not for the assistant, is never read. */
const SKIP = "[data-no-ask]";

const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

/** A rough role from the address; the server decides the real one from the session. */
function roleHint(path: string): string | null {
  if (path.startsWith("/admin")) return "owner";
  if (path.startsWith("/org")) return "organiser";
  if (path.startsWith("/head")) return "head";
  if (path.startsWith("/judge")) return "judge";
  if (path.startsWith("/spot")) return "spotter";
  return null;
}

/** Refusal sentences on the screen: alerts, field problems and the reasons under grey buttons (with the button's name). */
function visibleRefusals(doc: Document): string[] {
  const out: string[] = [];
  doc.querySelectorAll('[data-testid^="why-"], [data-testid="disabled-reason"], [role="alert"], .field-error').forEach((el) => {
    if (el.closest(SKIP)) return;
    const own = Array.from(el.childNodes)
      .filter((n) => !(n instanceof Element && n.hasAttribute("data-learn-more")))
      .map((n) => n.textContent ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!own) return;
    const testId = el.getAttribute("data-testid") ?? "";
    const button = testId.startsWith("why-") ? doc.querySelector(`button[data-testid="${CSS.escape(testId.slice(4))}"]`) : el.parentElement?.querySelector("button");
    const name = button && (button as HTMLButtonElement).disabled ? text(button) : "";
    out.push(name ? `${name} (grey): ${own}` : own);
  });
  return out;
}

export function collectAskContext(doc: Document = document, loc: Location = window.location): AskContext {
  const path = loc.pathname;
  const params = new URLSearchParams(loc.search);
  const marked = (attr: string) => doc.querySelector(`[${attr}]`)?.getAttribute(attr) ?? null;
  const checklist = Array.from(doc.querySelectorAll('[data-testid^="check-"][data-state]'))
    .filter((el) => !el.closest(SKIP))
    .map((el) => ({ label: text(el.querySelector("p")) || text(el), state: el.getAttribute("data-state") }));
  const refusals = visibleRefusals(doc);
  return sanitizeAskContext({
    route: path,
    role: roleHint(path),
    eventId: EVENT_IN_PATH.exec(path)?.[1] ?? null,
    divisionId: params.get("division") ?? marked("data-ask-division"),
    heatId: params.get("heat") ?? HEAT_IN_PATH.exec(path)?.[1] ?? marked("data-ask-heat"),
    checklist,
    refusals,
    lastRefusal: lastRefusal ?? refusals.at(-1) ?? null,
  });
}
