/** The pages of the product manual (docs/manual), in reading order. The Help section, its search and the PDF all follow this list. */
export interface ManualPage {
  /** Path inside docs/manual. */
  file: string;
  /** The group in the left table of contents. */
  group: "Start" | "Reference" | "Screens";
}

export const MANUAL_PAGES: ManualPage[] = [
  { file: "README.md", group: "Start" },
  { file: "quick-start.md", group: "Start" },
  { file: "dependencies.md", group: "Start" },
  { file: "event-day.md", group: "Start" },
  { file: "troubleshooting.md", group: "Start" },
  { file: "screens/organiser-event.md", group: "Screens" },
  { file: "screens/organiser-divisions.md", group: "Screens" },
  { file: "screens/organiser-riders.md", group: "Screens" },
  { file: "screens/organiser-officials.md", group: "Screens" },
  { file: "screens/organiser-draw.md", group: "Screens" },
  { file: "screens/organiser-run-order.md", group: "Screens" },
  { file: "screens/organiser-go-live.md", group: "Screens" },
  { file: "screens/organiser-access.md", group: "Screens" },
  { file: "screens/console-laptop.md", group: "Screens" },
  { file: "screens/console-phone.md", group: "Screens" },
  { file: "screens/flags.md", group: "Screens" },
  { file: "screens/judge.md", group: "Screens" },
  { file: "screens/spotter.md", group: "Screens" },
  { file: "screens/announcer.md", group: "Screens" },
  { file: "screens/observer.md", group: "Screens" },
  { file: "screens/public-home.md", group: "Screens" },
  { file: "screens/public-event.md", group: "Screens" },
  { file: "screens/public-live.md", group: "Screens" },
  { file: "screens/public-results.md", group: "Screens" },
  { file: "screens/public-ladder.md", group: "Screens" },
  { file: "screens/public-rider.md", group: "Screens" },
  { file: "screens/public-rules.md", group: "Screens" },
  { file: "screens/public-join.md", group: "Screens" },
  { file: "screens/big-screen.md", group: "Screens" },
  { file: "screens/simulator.md", group: "Screens" },
  { file: "screens/admin-organisations.md", group: "Screens" },
  { file: "screens/admin-presets.md", group: "Screens" },
  { file: "screens/admin-trick-base.md", group: "Screens" },
  { file: "screens/admin-settings.md", group: "Screens" },
  { file: "screens/admin-feedback.md", group: "Screens" },
  { file: "screens/admin-health.md", group: "Screens" },
  { file: "screens/admin-releases.md", group: "Screens" },
  { file: "settings.md", group: "Reference" },
  { file: "resets-and-undo.md", group: "Reference" },
  { file: "roles.md", group: "Reference" },
  { file: "glossary.md", group: "Reference" },
  { file: "errors.md", group: "Reference" },
  { file: "changelog.md", group: "Reference" },
];

/** "screens/judge.md" → "screens-judge": the page's own anchor is `page-<key>`, its headings `<key>--<heading>`. */
export const pageKey = (file: string) => file.replace(/\.md$/, "").replace(/\//g, "-").toLowerCase();
export const pageAnchor = (file: string) => `page-${pageKey(file)}`;
export const headingPrefix = (file: string) => `${pageKey(file)}--`;

/** Resolves "../img/x.png" written in "screens/judge.md" to "img/x.png". */
export function resolvePath(fromFile: string, target: string): string {
  const parts = fromFile.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}
