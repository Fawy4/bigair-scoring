import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "./route";

// Without ANTHROPIC_API_KEY Ask Sendbook is off: the button asks GET and is told to hide; a request that still arrives gets one plain sentence.
describe("/api/ask without a key", () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = saved;
  });

  it("tells the Ask button to stay hidden", async () => {
    const res = await GET(new Request("http://localhost/api/ask?event=11111111-1111-4111-8111-111111111111"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false });
  });

  it("answers a question with a plain sentence, before reading anything else", async () => {
    const res = await POST(new Request("http://localhost/api/ask", { method: "POST", body: JSON.stringify({ question: "why is Hold grey", context: {} }) }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Ask is not switched on: the server has no ANTHROPIC_API_KEY. The manual is at /help." });
  });
});
