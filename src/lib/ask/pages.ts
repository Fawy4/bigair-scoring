import type { SearchEntry } from "@/lib/manual/build";
import { norm } from "@/lib/manual/search";

/**
 * The pages that go with every question: what must be true before each action, every refusal sentence with its meaning and fix, and the troubleshooting
 * page's symptom → cause → fix rows (without its alphabetical index, which repeats the errors page: see forAsk).
 */
export const CORE_PAGES = ["dependencies.md", "errors.md", "troubleshooting.md"] as const;
/** How many pages the search adds to the core ones (the page of the screen the person is on counts as one of them). */
export const PICKED_PAGES = 6;
/** Pages never picked by the search: they answer no "how" or "why" question. */
const NEVER = new Set(["changelog.md"]);
/** The picked pages together stay under this many characters (the core pages are never cut). Roughly 30 000 tokens. */
const MAX_PICKED_CHARS = 120_000;

export interface AskPage {
  file: string;
  title: string;
  /** "page-dependencies": /help#page-dependencies opens it. */
  anchor: string;
  /** The page's Markdown, as written in docs/manual. */
  source: string;
}

export interface AskManual {
  pages: AskPage[];
  /** The /help search index. */
  search: SearchEntry[];
  /** Every anchor of /help with its title (pages, headings, anchored rows). */
  anchors: Map<string, string>;
}

const STOP = new Set(
  "a an and are as at be but by can do does did for from has have how i if in into is it its me my no not of on or our so than that the their them then there these they this to was we were what when where which who why will with you your should would could please".split(" "),
);

/** The words of a question that mean something: lower case, no punctuation, no small words. */
export function questionWords(question: string): string[] {
  return norm(question)
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** A whole word, and its singular too: "PINs" finds "PIN", "hold" does not find "holder". */
const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const matcher = (w: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${escape(w)}${w.length > 3 && w.endsWith("s") ? `|${escape(w.slice(0, -1))}` : ""})(?![\\p{L}\\p{N}])`, "u");

/** The first paragraph under a page's title: its one-line summary. */
const summaryOf = (source: string) => source.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !l.startsWith("Last checked:"))[0] ?? "";

/** The manual page of the screen an address belongs to: it goes first among the picked pages. */
export function pageForRoute(route: string): string | null {
  const r = route.split(/[?#]/)[0];
  const step = /^\/org\/events\/[^/]+\/([a-z-]+)/.exec(r)?.[1];
  if (step) return ROUTE_STEPS[step] ?? null;
  if (/^\/org\/events\/[^/]+\/?$/.test(r)) return "screens/organiser-go-live.md";
  for (const [re, file] of ROUTES) if (re.test(r)) return file;
  return null;
}
const ROUTE_STEPS: Record<string, string> = {
  event: "screens/organiser-event.md",
  divisions: "screens/organiser-divisions.md",
  riders: "screens/organiser-riders.md",
  officials: "screens/organiser-officials.md",
  draw: "screens/organiser-draw.md",
  schedule: "screens/organiser-run-order.md",
  simulate: "screens/simulator.md",
};
const ROUTES: Array<[RegExp, string]> = [
  [/^\/head\//, "screens/console-laptop.md"],
  [/^\/judge\//, "screens/judge.md"],
  [/^\/spot\//, "screens/spotter.md"],
  [/^\/screen\//, "screens/big-screen.md"],
  [/^\/admin\/presets/, "screens/admin-presets.md"],
  [/^\/admin\/tricks/, "screens/admin-trick-base.md"],
  [/^\/admin\/settings/, "screens/admin-settings.md"],
  [/^\/admin\/feedback/, "screens/admin-feedback.md"],
  [/^\/admin\/health/, "screens/admin-health.md"],
  [/^\/admin\/ask/, "ask-sendbook.md"],
  [/^\/admin/, "screens/admin-organisations.md"],
  [/^\/org\/(settings|members)/, "screens/organiser-access.md"],
];

/**
 * The manual pages for a question: the two core pages first, then the page of the screen the person is on, then the pages that match the question best
 * in the /help search index, 6 in all. Each section scores like /help's own search (a whole word in its heading 10, in its text 1); a page's value is
 * its best section (plus 10 for each word in the page's title or summary, and up to 10 for each word the page uses at least once per 1 000 characters) plus twice the sum of its sections divided by the square root of how many sections it has.
 */
export function pickPages(manual: AskManual, question: string, opts: { limit?: number; maxChars?: number; route?: string } = {}): AskPage[] {
  const limit = opts.limit ?? PICKED_PAGES;
  const maxChars = opts.maxChars ?? MAX_PICKED_CHARS;
  const words = questionWords(question).map(matcher);
  const byTitle = new Map(manual.pages.map((p) => [p.title, p]));
  const core = CORE_PAGES.map((f) => manual.pages.find((p) => p.file === f)).filter((p): p is AskPage => Boolean(p));

  const score = new Map<string, { best: number; total: number }>();
  const sections = new Map<string, number>();
  for (const e of manual.search) sections.set(e.page, (sections.get(e.page) ?? 0) + 1);
  if (words.length) {
    for (const e of manual.search) {
      const page = byTitle.get(e.page);
      if (!page || NEVER.has(page.file) || (CORE_PAGES as readonly string[]).includes(page.file)) continue;
      const title = norm(e.title);
      const text = norm(e.text);
      const s = words.reduce((sum, re) => sum + (re.test(title) ? 10 : 0) + (re.test(text) ? 1 : 0), 0);
      if (s === 0) continue;
      const prev = score.get(page.file) ?? { best: 0, total: 0 };
      score.set(page.file, { best: Math.max(prev.best, s), total: prev.total + s / Math.sqrt(sections.get(e.page) ?? 1) });
    }
  }
  // the page's own title and one-line summary say what it is for: a word there counts like a heading
  if (words.length) {
    for (const p of manual.pages) {
      if (NEVER.has(p.file) || (CORE_PAGES as readonly string[]).includes(p.file)) continue;
      const about = norm(`${p.title} ${summaryOf(p.source)}`);
      const body = norm(p.source);
      // how much of the page is about each word: up to 10 for a word used at least once in every 1 000 characters
      const density = (re: RegExp) => Math.min(1, ((body.match(new RegExp(re.source, "gu")) ?? []).length * 1000) / Math.max(1000, body.length));
      const s = words.reduce((sum, re) => sum + (re.test(about) ? 10 : 0) + 10 * density(re), 0);
      if (s === 0) continue;
      const prev = score.get(p.file) ?? { best: 0, total: 0 };
      score.set(p.file, { best: prev.best + s, total: prev.total });
    }
  }
  const order = new Map(manual.pages.map((p, i) => [p.file, i]));
  // a page that talks about the question in many of its sections beats one that has a single matching heading; a long reference page does not win by size
  const value = (v: { best: number; total: number }) => v.best + 2 * v.total;
  const ranked = [...score.entries()].sort((a, b) => value(b[1]) - value(a[1]) || order.get(a[0])! - order.get(b[0])!).map(([f]) => f);
  const here = opts.route ? pageForRoute(opts.route) : null;
  const files = here ? [here, ...ranked.filter((f) => f !== here)] : ranked;

  const picked: AskPage[] = [];
  let chars = 0;
  for (const file of files) {
    if (picked.length >= limit) break;
    const page = manual.pages.find((p) => p.file === file);
    if (!page) continue;
    if (chars + page.source.length > maxChars) continue;
    picked.push(page);
    chars += page.source.length;
  }
  return [...core, ...picked];
}
