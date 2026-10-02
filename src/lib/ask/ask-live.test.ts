import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { askConfig } from "./config";
import { contextText, sanitizeAskContext } from "./context";
import { askInstructions, askManual } from "./manual";
import { CORE_PAGES, pickPages } from "./pages";
import { buildAskPrompt, requestParams } from "./prompt";
import { findCitation } from "./stream";

// The one test that talks to the real model (it costs a few cents): RUN_LIVE_ASK=1 with ANTHROPIC_API_KEY set — `npm run test:ask-live`.
// The same prompt the route builds, one question, the answer streamed: it must not be empty, and it should cite the manual.
describe.skipIf(!process.env.RUN_LIVE_ASK)("Ask Sendbook against the real API", () => {
  it("answers “why is Hold grey” on a console with no active run order, streaming", async () => {
    const config = askConfig(process.env);
    expect(config.keyPresent, "ANTHROPIC_API_KEY is missing").toBe(true);
    const manual = askManual();
    const route = "/head/11111111-1111-4111-8111-111111111111";
    const ctx = sanitizeAskContext({ route, refusals: ["Hold (grey): No active run order — create one in Run order & timetable."], lastRefusal: "No active run order — create one in Run order & timetable." });
    const question = "why is Hold grey";
    const pages = pickPages(manual, question, { route });
    const prompt = buildAskPrompt({ instructions: askInstructions(), pages, corePages: CORE_PAGES.length, context: contextText(ctx, { role: "organiser", eventName: "Smoke test", divisionName: null, heatLabel: null, heatStatus: null }), history: [], question });
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000 });
    const stream = client.messages.stream({ model: config.model, ...requestParams(config.model), system: prompt.system, messages: prompt.messages });
    let streamed = "";
    let pieces = 0;
    for await (const ev of stream) {
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
        streamed += ev.delta.text;
        pieces++;
      }
    }
    const final = await stream.finalMessage();
    console.log(`model ${final.model} · ${pieces} pieces · in ${final.usage.input_tokens} + cache write ${final.usage.cache_creation_input_tokens ?? 0} + cache read ${final.usage.cache_read_input_tokens ?? 0} · out ${final.usage.output_tokens}\n${streamed}`);
    expect(streamed.trim().length).toBeGreaterThan(0);
    expect(pieces).toBeGreaterThan(1);
    expect(final.stop_reason).toBe("end_turn");
    expect(findCitation(streamed, manual.anchors), "the answer cites no /help link").not.toBeNull();
  }, 90_000);
});
