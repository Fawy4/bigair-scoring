import { createServer, type Server } from "node:http";

/**
 * A stand-in for Anthropic's Messages API, for the Ask Sendbook browser test. Start the app with
 *   ANTHROPIC_API_KEY=mock ANTHROPIC_BASE_URL=http://127.0.0.1:4599 npm run dev
 * and the real /api/ask route (sign-in check, context, page choice, log, budget) talks to this server instead of the model. It answers in the same
 * stream format as the real API and keeps every request so the test can read the prompt that was sent.
 */
export const ASK_MOCK_PORT = Number(process.env.ASK_MOCK_PORT ?? 4599);

export interface MockRequest {
  model: string;
  system: Array<{ type: string; text: string; cache_control?: unknown }>;
  messages: Array<{ role: string; content: string }>;
}

export const HOLD_ANSWER =
  "Hold is grey because no run order is active for today. Go to the **Run order** step, choose today's day and press **Activate this plan**; Hold works as soon as a plan is active.\nManual: [Hold (wind hold)](/help#dep-hold)";

const sse = (event: string, data: object) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

export function startAskMock(): Promise<{ requests: MockRequest[]; close: () => Promise<void> }> {
  const requests: MockRequest[] = [];
  const server: Server = createServer((req, res) => {
    if (req.method !== "POST" || !req.url?.startsWith("/v1/messages")) {
      res.writeHead(404).end();
      return;
    }
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      const body = JSON.parse(raw) as MockRequest;
      requests.push(body);
      const context = body.system.map((b) => b.text).join("\n");
      const answer = /No active run order|run order is active/i.test(context) ? HOLD_ANSWER : "I do not know.\nManual: [Help](/help#page-readme)";
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      res.write(sse("message_start", { type: "message_start", message: { id: "msg_mock", type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1200, output_tokens: 1, cache_creation_input_tokens: 45000, cache_read_input_tokens: 0 } } }));
      res.write(sse("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }));
      for (const piece of answer.match(/.{1,24}/gs) ?? []) {
        res.write(sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: piece } }));
        await new Promise((r) => setTimeout(r, 15));
      }
      res.write(sse("content_block_stop", { type: "content_block_stop", index: 0 }));
      res.write(sse("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 80 } }));
      res.write(sse("message_stop", { type: "message_stop" }));
      res.end();
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(ASK_MOCK_PORT, "127.0.0.1", () => resolve({ requests, close: () => new Promise((r) => server.close(() => r())) }));
  });
}
