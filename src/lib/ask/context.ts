import { z } from "zod";

/**
 * Ask Sendbook: what the browser tells the assistant about the screen. Only these fields ever leave the page, every sentence is scrubbed of e-mail
 * addresses and six-digit numbers (PINs), and nothing about scores exists here at all. The server then replaces the names with the ones the person's own
 * login can read (see contextText), so a page cannot make the assistant believe something the person may not see.
 */

const MAX_SENTENCE = 300;
const MAX_REFUSALS = 10;
const MAX_CHECKS = 30;

export const CHECK_STATES = ["done", "attention", "not_started"] as const;

/** E-mail addresses and six-digit numbers (a PIN has six digits). Times, dates, heat numbers and versions stay. */
export function scrubText(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[e-mail removed]")
    .replace(/(?<![\d.:])\d{6}(?![\d.:])/g, "[number removed]")
    .replace(/@/g, " ");
}

const sentence = z
  .string()
  .transform((s) => scrubText(s.replace(/\s+/g, " ").trim()).slice(0, MAX_SENTENCE))
  .catch("");
const id = z.string().uuid().nullable().catch(null);
const name = z.string().max(200).transform(scrubText).nullable().catch(null);

const Check = z.object({ label: sentence, state: z.enum(CHECK_STATES) });

const Shape = z.object({
  route: z
    .string()
    .transform((r) => (r.split(/[?#]/)[0] || "/").slice(0, 200))
    .transform(scrubText)
    .catch("/"),
  role: z.string().max(20).regex(/^[a-z_]+$/).nullable().catch(null),
  eventId: id,
  eventName: name,
  divisionId: id,
  heatId: id,
  heatStatus: z.string().max(20).regex(/^[a-z_]+$/).nullable().catch(null),
  checklist: z
    .array(z.unknown())
    .catch([])
    .transform((rows) =>
      rows
        .map((r) => Check.safeParse(r))
        .filter((r) => r.success)
        .map((r) => r.data!)
        .filter((r) => r.label)
        .slice(0, MAX_CHECKS),
    ),
  lastRefusal: z
    .string()
    .nullable()
    .catch(null)
    .transform((s) => (s ? sentence.parse(s) || null : null)),
  refusals: z
    .array(z.unknown())
    .catch([])
    .transform((list) => [...new Set(list.filter((s): s is string => typeof s === "string").map((s) => sentence.parse(s)).filter(Boolean))].slice(0, MAX_REFUSALS)),
  productVersion: z.string().max(20).regex(/^[0-9a-z.+-]+$/i).nullable().catch(null),
});

export type AskContext = z.infer<typeof Shape>;

const DEFAULTS = { route: "/", role: null, eventId: null, eventName: null, divisionId: null, heatId: null, heatStatus: null, checklist: [], lastRefusal: null, refusals: [], productVersion: null };

/** Keeps only the whitelisted fields of whatever the page sent, scrubbed. Never throws. */
export function sanitizeAskContext(raw: unknown): AskContext {
  const input = raw && typeof raw === "object" ? { ...DEFAULTS, ...(raw as Record<string, unknown>) } : DEFAULTS;
  // z.object strips every key it does not know (pin, email, scores, judges …)
  return Shape.parse(input);
}

/** What the server itself read with the person's login: the names in the prompt come from here, not from the page. */
export interface ServerFacts {
  role: string;
  eventName: string | null;
  divisionName: string | null;
  heatLabel: string | null;
  heatStatus: string | null;
}

/** The live context as plain lines for part (c) of the prompt. */
export function contextText(ctx: AskContext, facts: ServerFacts): string {
  const lines = [`Route: ${ctx.route}`, `Role: ${facts.role}`];
  if (facts.eventName) lines.push(`Event: ${facts.eventName}${ctx.eventId ? ` (id ${ctx.eventId})` : ""}`);
  if (facts.divisionName) lines.push(`Division: ${facts.divisionName}`);
  if (facts.heatLabel) lines.push(`Heat: ${facts.heatLabel}${facts.heatStatus ? ` (${facts.heatStatus})` : ""}`);
  if (ctx.productVersion) lines.push(`Product version: ${ctx.productVersion}`);
  if (ctx.lastRefusal) lines.push(`Last refusal sentence on this page: ${ctx.lastRefusal}`);
  if (ctx.refusals.length) lines.push("Refusal sentences visible on this page now:", ...ctx.refusals.map((r) => `- ${r}`));
  if (ctx.checklist.length) lines.push("Readiness checklist on this page:", ...ctx.checklist.map((c) => `- [${c.state}] ${c.label}`));
  return lines.join("\n");
}
