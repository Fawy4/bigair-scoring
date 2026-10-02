import { readFileSync } from "node:fs";
import path from "node:path";
import { buildManual } from "@/lib/manual/build";
import { MANUAL_DIR } from "@/lib/manual/load";
import { MANUAL_PAGES, pageAnchor } from "@/lib/manual/pages";
import type { AskManual } from "./pages";

let cached: AskManual | null = null;

/**
 * The manual as Ask Sendbook uses it: the /help search index (headings, text, anchored rows) to choose pages, the Markdown of each page to send, and
 * every anchor with its title to check what an answer cites. Read once per server process.
 */
export function askManual(): AskManual {
  if (cached) return cached;
  const sources = MANUAL_PAGES.map((p) => ({ ...p, source: readFileSync(path.join(MANUAL_DIR, p.file), "utf8") }));
  const built = buildManual(sources);
  const anchors = new Map<string, string>();
  for (const p of built.pages) {
    anchors.set(p.anchor, p.title);
    for (const h of p.headings) anchors.set(h.id, h.text);
  }
  for (const e of built.search) if (!anchors.has(e.id)) anchors.set(e.id, e.title);
  cached = {
    pages: built.pages.map((p, i) => ({ file: p.file, title: p.title, anchor: pageAnchor(p.file), source: sources[i].source })),
    search: built.search,
    anchors,
  };
  return cached;
}

/** The system instructions, shared word for word with the Claude Project (docs/manual/ASK-INSTRUCTIONS.md, the part after the first "---" line). */
export function askInstructions(): string {
  const raw = readFileSync(path.join(MANUAL_DIR, "ASK-INSTRUCTIONS.md"), "utf8");
  return instructionsFrom(raw);
}

/** The text after the file's header (everything up to and including the first line that is exactly "---"). */
export function instructionsFrom(raw: string): string {
  const lines = raw.split("\n");
  const cut = lines.findIndex((l) => l.trim() === "---");
  return (cut >= 0 ? lines.slice(cut + 1) : lines).join("\n").trim();
}
