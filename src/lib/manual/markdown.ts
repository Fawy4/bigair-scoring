/**
 * A small Markdown renderer for the product manual (docs/manual). Pure: text in, HTML and an outline out. It covers what the manual uses and nothing more:
 * headings (with `{#id}` for a fixed anchor), paragraphs, **bold**, _italic_, `code`, links, images, lists (one level of nesting), tables (a first cell
 * that starts with `{#id}` gives the row its anchor), block quotes, rules and fenced code (```mermaid becomes a diagram). Everything else is escaped text.
 */

export interface Heading {
  id: string;
  level: number;
  text: string;
}

/** A searchable piece of the page: a heading with the text under it, or one table row with an anchor. */
export interface Section {
  id: string;
  title: string;
  text: string;
}

export interface Rendered {
  html: string;
  headings: Heading[];
  sections: Section[];
  /** Every link target and image source after rewriting, so a test can prove each one resolves. */
  links: string[];
  images: string[];
}

export interface RenderOptions {
  /** Prefix for heading ids that have no fixed `{#id}`, so two pages can both have "## Fix" without clashing. */
  idPrefix: string;
  /** Turns a Markdown link target into the address used on the help page (another page of the manual becomes an anchor). */
  link: (href: string) => string;
  /** Turns an image path into its address. */
  image: (src: string) => string;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** "Hold / Resume at" → "hold-resume-at". */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[`*_]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Plain words of a line of inline Markdown (for search and for heading text). */
export function plainText(md: string): string {
  return md
    .replace(/\{#[^}]+\}/g, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^\w])_([^_]+)_(?=$|[^\w])/g, "$1$2")
    .replace(/<br\s*\/?>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inline(md: string, opts: RenderOptions, links: string[], images: string[]): string {
  // code spans first, so nothing inside them is touched
  const codes: string[] = [];
  let s = md.replace(/`([^`]+)`/g, (_, c: string) => {
    codes.push(`<code>${escapeHtml(c)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = escapeHtml(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt: string, src: string) => {
    const url = opts.image(src);
    images.push(url);
    return `<img src="${url}" alt="${alt}" loading="lazy" />`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text: string, href: string) => {
    const url = opts.link(href.replace(/&amp;/g, "&"));
    links.push(url);
    const external = /^https?:/.test(url);
    return `<a href="${escapeHtml(url)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${text}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^\w])_([^_]+)_(?=$|[^\w])/g, "$1<em>$2</em>");
  s = s.replace(/&lt;br\s*\/?&gt;/g, "<br />");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => codes[Number(i)]);
}

const fixedId = (text: string): { id: string | null; rest: string } => {
  const m = /\s*\{#([A-Za-z0-9_-]+)\}\s*/.exec(text);
  return m ? { id: m[1], rest: (text.slice(0, m.index) + " " + text.slice(m.index + m[0].length)).trim() } : { id: null, rest: text };
};

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, "|"));

export function renderMarkdown(src: string, opts: RenderOptions): Rendered {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  const headings: Heading[] = [];
  const sections: Section[] = [];
  const links: string[] = [];
  const images: string[] = [];
  const used = new Set<string>();
  const inl = (t: string) => inline(t, opts, links, images);
  let current: Section | null = null;
  const note = (text: string) => {
    if (current) current.text += (current.text ? " " : "") + plainText(text);
  };
  const uniqueId = (base: string) => {
    let id = base || "section";
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++;
      const code = escapeHtml(body.join("\n"));
      out.push(lang === "mermaid" ? `<pre class="mermaid" data-diagram>${code}</pre>` : `<pre><code>${code}</code></pre>`);
      continue;
    }

    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const { id: fixed, rest } = fixedId(h[2]);
      const text = plainText(rest);
      const id = fixed ? uniqueId(fixed) : uniqueId(`${opts.idPrefix}${slugify(text)}`);
      headings.push({ id, level, text });
      current = { id, title: text, text: "" };
      sections.push(current);
      out.push(`<h${level + 1} id="${id}">${inl(rest)}</h${level + 1}>`);
      i++;
      continue;
    }

    if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      out.push("<hr />");
      i++;
      continue;
    }

    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows: string[] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        const cells = splitRow(lines[i]);
        const { id: rowFixed, rest } = fixedId(cells[0] ?? "");
        cells[0] = rest;
        const rowText = cells.map(plainText).join(" · ");
        let rowAttr = "";
        if (rowFixed) {
          const id = uniqueId(rowFixed);
          rowAttr = ` id="${id}"`;
          sections.push({ id, title: plainText(cells[0]), text: rowText });
        } else {
          note(rowText);
        }
        rows.push(`<tr${rowAttr}>${head.map((_, c) => `<td>${inl(cells[c] ?? "")}</td>`).join("")}</tr>`);
        i++;
      }
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${inl(c)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ""));
      note(body.join(" "));
      out.push(`<blockquote><p>${inl(body.join(" "))}</p></blockquote>`);
      continue;
    }

    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      // one list, with one level of nesting (items indented by two or more spaces)
      const ordered = /^\s*\d+\./.test(line);
      const items: Array<{ text: string; children: string[] }> = [];
      while (i < lines.length && (/^\s*([-*]|\d+\.)\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        const l = lines[i];
        const nested = /^\s{2,}([-*]|\d+\.)\s+/.test(l);
        const text = l.replace(/^\s*([-*]|\d+\.)\s+/, "");
        if (nested && items.length) items[items.length - 1].children.push(text);
        else if (/^\s{2,}\S/.test(l) && !/^\s*([-*]|\d+\.)\s+/.test(l) && items.length) items[items.length - 1].text += ` ${l.trim()}`;
        else items.push({ text, children: [] });
        i++;
      }
      for (const it of items) note([it.text, ...it.children].join(" "));
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((it) => `<li>${inl(it.text)}${it.children.length ? `<ul>${it.children.map((c) => `<li>${inl(c)}</li>`).join("")}</ul>` : ""}</li>`).join("")}</${tag}>`);
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>|\s*([-*]|\d+\.)\s+|\s*\|)/.test(lines[i]) && !/^\s*(---|\*\*\*)\s*$/.test(lines[i])) para.push(lines[i++]);
    if (para.length === 0) {
      // a line that looked like a block start but was not one (for example a lone "|"): keep it as text
      para.push(lines[i++]);
    }
    note(para.join(" "));
    out.push(`<p>${inl(para.join(" "))}</p>`);
  }

  return { html: out.join("\n"), headings, sections, links, images };
}
