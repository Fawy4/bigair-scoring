import type Anthropic from "@anthropic-ai/sdk";
import type { AskPage } from "./pages";

export interface Turn {
  role: "user" | "assistant";
  content: string;
}

/** Turns of the conversation sent again with a question. One turn is one message (a question or an answer). */
export const HISTORY_TURNS = 6;
const MAX_TURN_CHARS = 4000;

/** The last complete questions and answers: an empty answer (a stream that failed) and a question without an answer are dropped. */
export function lastTurns(history: readonly Turn[], max = HISTORY_TURNS): Turn[] {
  const pairs: Turn[][] = [];
  for (let i = 0; i < history.length - 1; i++) {
    const q = history[i];
    const a = history[i + 1];
    if (q.role === "user" && a.role === "assistant" && q.content.trim() && a.content.trim()) {
      pairs.push([q, a]);
      i++;
    }
  }
  const flat = pairs.flat().map((t) => ({ role: t.role, content: t.content.slice(0, MAX_TURN_CHARS) }));
  const kept = flat.slice(-max);
  return kept[0]?.role === "assistant" ? kept.slice(1) : kept;
}

const pageBlock = (p: AskPage) => `<manual_page file="${p.file}" title="${p.title}" link="/help#${p.anchor}">\n${p.source.trim()}\n</manual_page>`;

export interface AskPromptInput {
  instructions: string;
  /** Core pages first, then the picked ones. */
  pages: readonly AskPage[];
  /** How many of `pages` are the core pages (the same for every question). */
  corePages: number;
  context: string;
  history: readonly Turn[];
  question: string;
}

/**
 * The request, in the order the brief sets: (a) the instructions, (b) the manual pages, (c) the live context, (d) the last turns, (e) the question.
 * The instructions and the core pages are the same for every question, so the first cache mark covers both; the picked pages get the second mark (a
 * follow-up about the same screen usually picks the same pages). The live context changes with every question and is never cached.
 */
export function buildAskPrompt(input: AskPromptInput): { system: Anthropic.TextBlockParam[]; messages: Anthropic.MessageParam[] } {
  const core = input.pages.slice(0, input.corePages);
  const picked = input.pages.slice(input.corePages);
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: input.instructions },
    { type: "text", text: `The manual pages that always apply:\n\n${core.map(pageBlock).join("\n\n")}`, cache_control: { type: "ephemeral" } },
    { type: "text", text: picked.length ? `The manual pages that match this question:\n\n${picked.map(pageBlock).join("\n\n")}` : "No other manual page matches this question.", cache_control: { type: "ephemeral" } },
    { type: "text", text: `<live_context>\n${input.context}\n</live_context>` },
  ];
  const messages: Anthropic.MessageParam[] = [...lastTurns(input.history).map((t) => ({ role: t.role, content: t.content })), { role: "user", content: input.question }];
  return { system, messages };
}

/** Model-specific parts of the request: Sonnet answers at low effort (a quick, short answer); Haiku 4.5 refuses the effort field. */
export function requestParams(model: string): { max_tokens: number; output_config?: { effort: "low" } } {
  return model.startsWith("claude-haiku") ? { max_tokens: 2048 } : { max_tokens: 4096, output_config: { effort: "low" } };
}
