import { renderMarkdown, type Heading, type Section } from "./markdown";
import { headingPrefix, pageAnchor, resolvePath, type ManualPage } from "./pages";

export interface BuiltPage {
  file: string;
  group: ManualPage["group"];
  anchor: string;
  title: string;
  /** The one-line summary under the title. */
  summary: string;
  /** "Last checked: 2 Oct 2026 · Product version 0.9.0". */
  checked: string;
  html: string;
  headings: Heading[];
}

export interface SearchEntry extends Section {
  page: string;
}

export interface Manual {
  pages: BuiltPage[];
  search: SearchEntry[];
  /** Every in-page link target (without "#"), every outside link, every image address: a test checks each one. */
  links: string[];
  images: string[];
  ids: Set<string>;
}

/** The image of a page lives in docs/manual/img and is served at /help/img/<name>. */
export const imageUrl = (fromFile: string, src: string) => (/^https?:/.test(src) ? src : `/help/${resolvePath(fromFile, src)}`);

/**
 * Renders every page of the manual into one long page. A link to another page becomes an anchor on the same page: "dependencies.md#dep-hold" →
 * "#dep-hold" (a fixed anchor) or "#dependencies--hold" (a heading of that page); "roles.md" → "#page-roles". Two passes: the first learns every anchor.
 */
export function buildManual(sources: Array<ManualPage & { source: string }>): Manual {
  const ids = new Set<string>();
  // first pass: which ids exist on which page
  const idsByPage = new Map<string, Set<string>>();
  for (const s of sources) {
    const r = renderMarkdown(s.source, { idPrefix: headingPrefix(s.file), link: (h) => h, image: (i) => i });
    idsByPage.set(s.file, new Set([...r.headings.map((h) => h.id), ...r.sections.map((x) => x.id)]));
  }

  const linkFor = (fromFile: string) => (href: string) => {
    if (/^(https?:|mailto:)/.test(href)) return href;
    if (href.startsWith("/")) return href;
    const [target, frag] = href.split("#");
    const file = target ? resolvePath(fromFile, target) : fromFile;
    if (!frag) return `#${pageAnchor(file)}`;
    const known = idsByPage.get(file);
    if (known?.has(frag)) return `#${frag}`;
    return `#${headingPrefix(file)}${frag}`;
  };

  const pages: BuiltPage[] = [];
  const search: SearchEntry[] = [];
  const links: string[] = [];
  const images: string[] = [];
  for (const s of sources) {
    const r = renderMarkdown(s.source, { idPrefix: headingPrefix(s.file), link: linkFor(s.file), image: (src) => imageUrl(s.file, src) });
    const title = r.headings[0]?.text ?? s.file;
    const plain = s.source.split("\n").map((l) => l.trim());
    const after = plain.slice(plain.findIndex((l) => l.startsWith("# ")) + 1).filter(Boolean);
    const checked = after.find((l) => l.startsWith("Last checked:")) ?? "";
    const summary = after.find((l) => !l.startsWith("Last checked:") && !l.startsWith("#")) ?? "";
    for (const id of [...r.headings.map((h) => h.id), ...r.sections.map((x) => x.id)]) ids.add(id);
    ids.add(pageAnchor(s.file));
    pages.push({ file: s.file, group: s.group, anchor: pageAnchor(s.file), title, summary, checked, html: r.html, headings: r.headings });
    for (const sec of r.sections) search.push({ ...sec, text: sec.text.slice(0, 600), page: title });
    links.push(...r.links);
    images.push(...r.images);
  }
  return { pages, search, links, images, ids };
}
