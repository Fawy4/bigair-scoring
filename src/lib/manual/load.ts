import { readFileSync } from "node:fs";
import path from "node:path";
import { buildManual, type Manual } from "./build";
import { MANUAL_PAGES } from "./pages";

/** The manual's folder in the repository. The Help page is built from it when the site is built (it is a static page). */
export const MANUAL_DIR = path.join(process.cwd(), "docs", "manual");

export function loadManual(): Manual {
  return buildManual(MANUAL_PAGES.map((p) => ({ ...p, source: readFileSync(path.join(MANUAL_DIR, p.file), "utf8") })));
}
