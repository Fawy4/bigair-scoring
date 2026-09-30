import { copy } from "@/lib/ui-copy";

export const FEEDBACK_TAGS = ["bug", "wording", "layout", "new_rule", "idea"] as const;
export type FeedbackTag = (typeof FEEDBACK_TAGS)[number];
export type FeedbackRole = "owner" | "staff" | "organiser";

/** One note as the export needs it (names already looked up, screenshot already a link). */
export interface FeedbackNote {
  id: string;
  tag: FeedbackTag;
  status: "open" | "done";
  pageLabel: string;
  eventName: string | null;
  organisationName: string | null;
  divisionName: string | null;
  heatLabel: string | null;
  role: FeedbackRole;
  body: string;
  screenshotUrl: string | null;
  createdAt: string;
}

/** A readable name for a screen, from its address. Unknown addresses are shown as they are. */
export function pageLabelFor(path: string): string {
  const p = path.split("?")[0].replace(/\/+$/, "") || "/";
  const step = p.match(/^\/org\/events\/[^/]+\/([a-z-]+)/);
  if (step) return copy.feedback.pages.steps[step[1]] ?? p;
  const fixed = copy.feedback.pages.fixed[p];
  if (fixed) return fixed;
  if (/^\/admin\/organisations\/[^/]+/.test(p)) return copy.feedback.pages.fixed["/admin/organisations"] ?? p;
  if (/^\/e\/[^/]+\/register$/.test(p)) return copy.feedback.pages.registration;
  if (/^\/e\/[^/]+\/join$/.test(p)) return copy.feedback.pages.join;
  if (/^\/e\/[^/]+$/.test(p)) return copy.feedback.pages.eventPage;
  return p;
}

/** Quotes inside a note become curly quotes and line breaks become spaces, so every note stays one line. */
function oneLine(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/"([^"]*)"/g, "“$1”")
    .replace(/"/g, "’");
}

/** `- [Riders step · Arrow · Pro Men · owner] "Seed column too narrow on the phone" (screenshot: url)` */
export function noteLine(n: FeedbackNote): string {
  const where = [n.pageLabel, n.eventName ?? n.organisationName, n.divisionName, n.heatLabel, n.role].filter((x): x is string => Boolean(x));
  const shot = n.screenshotUrl ? ` (screenshot: ${n.screenshotUrl})` : "";
  return `- [${where.join(" · ")}] "${oneLine(n.body)}"${shot}`;
}

/** The file docs/FEEDBACK.md: open notes only, grouped by tag and then by page, oldest first. */
export function formatFeedbackMarkdown(notes: FeedbackNote[], now: Date): string {
  const open = notes.filter((n) => n.status === "open");
  const date = now.toISOString().slice(0, 10);
  const lines: string[] = [`# ${copy.feedback.fileTitle}`, ""];
  if (open.length === 0) {
    lines.push(copy.feedback.fileEmpty(date), "");
    return lines.join("\n");
  }
  lines.push(copy.feedback.fileIntro(date, open.length), "");
  for (const tag of FEEDBACK_TAGS) {
    const ofTag = open.filter((n) => n.tag === tag);
    if (ofTag.length === 0) continue;
    lines.push(`## ${copy.feedback.tags[tag]}`, "");
    const pages = [...new Set(ofTag.map((n) => n.pageLabel))].sort((a, b) => a.localeCompare(b, "en"));
    for (const page of pages) {
      lines.push(`### ${page}`, "");
      for (const n of ofTag.filter((x) => x.pageLabel === page).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) lines.push(noteLine(n));
      lines.push("");
    }
  }
  return lines.join("\n");
}
