import Anthropic from "@anthropic-ai/sdk";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { authorizeAsk, type AccessRefusal } from "@/lib/ask/access";
import { budgetTokens, costUsd, hourlyLimited } from "@/lib/ask/budget";
import { askConfig } from "@/lib/ask/config";
import { contextText, sanitizeAskContext } from "@/lib/ask/context";
import { askInstructions, askManual } from "@/lib/ask/manual";
import { CORE_PAGES, pickPages } from "@/lib/ask/pages";
import { buildAskPrompt, requestParams } from "@/lib/ask/prompt";
import { askedLastHour, ipHash, organisationBudget, serverFacts, writeLog, type AskLogRow } from "@/lib/ask/server";
import { ASK_CONTENT_TYPE, encodeEvent, findCitation } from "@/lib/ask/stream";
import { ORG_COOKIE } from "@/lib/org/context";
import { PRODUCT_VERSION } from "@/lib/product-version";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { copy } from "@/lib/ui-copy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const E = copy.ask.errors;
const REFUSED: Record<AccessRefusal, { status: number; error: string }> = {
  signed_out: { status: 401, error: E.signedOut },
  no_seat: { status: 403, error: E.noSeat },
  not_allowed: { status: 403, error: E.notAllowed },
};

const json = (status: number, body: object) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function who(eventId: string | null) {
  const config = askConfig(process.env);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const service = createServiceClient();
  const organisationId = (await cookies()).get(ORG_COOKIE)?.value ?? null;
  const access = await authorizeAsk(service, user, { eventId, organisationId, publicAllowed: config.publicAllowed });
  return { config, supabase, service, user, access };
}

/** Is the Ask button shown on this screen? Only when the key exists and this person may ask about this event. Says nothing else. */
export async function GET(request: Request) {
  const config = askConfig(process.env);
  if (!config.keyPresent) return json(200, { enabled: false });
  const event = new URL(request.url).searchParams.get("event");
  const eventId = event && z.string().uuid().safeParse(event).success ? event : null;
  const { access } = await who(eventId);
  return json(200, { enabled: access.ok });
}

const Body = z.object({
  question: z.string().trim().min(1, E.empty).max(2000, E.tooLong),
  context: z.unknown(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(20_000) }))
    .max(40)
    .catch([]),
});

export async function POST(request: Request) {
  const config = askConfig(process.env);
  // without the key the button is hidden; a request that still arrives gets one plain sentence
  if (!config.keyPresent) return json(503, { error: E.noKey });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json(400, { error: parsed.error.issues[0]?.message ?? E.empty });
  // the version is the server's own, not the page's
  const ctx = { ...sanitizeAskContext(parsed.data.context), productVersion: PRODUCT_VERSION };
  const question = parsed.data.question;

  const { supabase, service, user, access } = await who(ctx.eventId);
  if (!access.ok) return json(REFUSED[access.reason].status, { error: REFUSED[access.reason].error });
  const r = access.requester;

  const forwarded = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ip = r.kind === "visitor" ? ipHash(forwarded, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "") : null;
  const base: AskLogRow = {
    organisation_id: r.organisationId,
    event_id: r.eventId,
    user_id: user?.id ?? null,
    seat_id: r.seatId,
    role: r.role,
    route: ctx.route,
    question,
    context: ctx,
    ip_hash: ip,
  };

  // per-person limit (per address for a visitor)
  const limit = r.kind === "visitor" ? config.publicHourlyLimit : config.hourlyLimit;
  if (hourlyLimited(await askedLastHour(service, { userId: user?.id ?? null, ipHash: ip }), limit)) {
    await writeLog(service, { ...base, status: "limited" });
    return json(429, { error: E.tooMany(limit) });
  }
  // the organisation's monthly budget: a soft stop
  if (r.organisationId) {
    const budget = await organisationBudget(service, r.organisationId);
    if (budget.paused) {
      await writeLog(service, { ...base, status: "paused" });
      return json(429, { error: E.paused, paused: true });
    }
  }

  const manual = askManual();
  const pages = pickPages(manual, question, { route: ctx.route });
  const facts = await serverFacts(supabase, ctx, r);
  const prompt = buildAskPrompt({ instructions: askInstructions(), pages, corePages: CORE_PAGES.length, context: contextText(ctx, facts), history: parsed.data.history, question });
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 55_000 });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (e: Parameters<typeof encodeEvent>[0]) => controller.enqueue(enc.encode(encodeEvent(e)));
      let answer = "";
      let model = config.model;
      let final: Anthropic.Message | null = null;
      for (const m of [config.model, config.fallbackModel].filter((x, i, all) => all.indexOf(x) === i)) {
        model = m;
        try {
          const s = client.messages.stream({ model: m, ...requestParams(m), system: prompt.system, messages: prompt.messages });
          for await (const ev of s) {
            if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
              answer += ev.delta.text;
              send({ type: "text", text: ev.delta.text });
            }
          }
          final = await s.finalMessage();
          // a refusal before any word was written: let the other model try
          if (final.stop_reason === "refusal" && !answer) continue;
          break;
        } catch (err) {
          console.error(`Ask Sendbook: ${m} failed:`, err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : (err as Error).message);
          // the fallback model only takes over when nothing has been shown yet
          if (answer) break;
        }
      }
      const usage = final?.usage;
      const tokens = usage
        ? { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, cache_write_tokens: usage.cache_creation_input_tokens ?? 0, cache_read_tokens: usage.cache_read_input_tokens ?? 0 }
        : { input_tokens: 0, output_tokens: 0, cache_write_tokens: 0, cache_read_tokens: 0 };
      const u = { input_tokens: tokens.input_tokens, output_tokens: tokens.output_tokens, cache_creation_input_tokens: tokens.cache_write_tokens, cache_read_input_tokens: tokens.cache_read_tokens };
      const cite = findCitation(answer, manual.anchors);
      const ok = Boolean(answer.trim());
      const logId = await writeLog(service, {
        ...base,
        ...tokens,
        answer: answer.slice(0, 20_000),
        status: ok ? "answered" : "failed",
        model: final?.model ?? model,
        budget_tokens: budgetTokens(u),
        cost_usd: Number(costUsd(final?.model ?? model, u).toFixed(6)),
        pages: pages.map((p) => p.file),
        cited: cite?.href ?? null,
      });
      if (ok) send({ type: "done", logId, cite, model: final?.model ?? model });
      else send({ type: "error", message: E.failed });
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": ASK_CONTENT_TYPE, "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
