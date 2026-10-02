import type { Metadata } from "next";
import { loadManual } from "@/lib/manual/load";
import { getProductName } from "@/lib/platform/public-settings";
import { PRODUCT_VERSION } from "@/lib/product-version";
import { copy } from "@/lib/ui-copy";
import { HelpDiagrams, HelpSearch, PdfButton } from "./help-client";
import "./help.css";

// The manual is read from docs/manual when the site is built: a static page, public, kept out of search engines.
export const dynamic = "force-static";

export async function generateMetadata(): Promise<Metadata> {
  let product = process.env.NEXT_PUBLIC_PRODUCT_NAME || "Big Air Scoring";
  try {
    product = await getProductName();
  } catch {
    // the database is not needed to show the manual
  }
  return { title: copy.manual.metaTitle(product), robots: { index: false, follow: false } };
}

const M = copy.manual;

export default function HelpPage() {
  const manual = loadManual();
  const groups = ["Start", "Screens", "Reference"] as const;
  return (
    <div className="help-root" data-testid="help">
      <header className="help-top">
        <div className="help-top-inner">
          <a href="#top" className="help-brand" id="top">
            {M.title}
          </a>
          <span className="help-version" data-testid="help-version">
            {M.version(PRODUCT_VERSION)}
          </span>
          <HelpSearch entries={manual.search} />
          <PdfButton />
        </div>
      </header>
      <div className="help-body">
        <nav className="help-toc" aria-label={M.contents}>
          <details open>
            <summary>{M.contents}</summary>
            {groups.map((g) => (
              <div key={g} className="help-toc-group">
                <p className="help-toc-heading">{M.groups[g]}</p>
                <ul>
                  {manual.pages
                    .filter((p) => p.group === g)
                    .map((p) => (
                      <li key={p.file}>
                        <a href={`#${p.anchor}`}>{p.title}</a>
                        {g !== "Screens" ? (
                          <ul>
                            {p.headings
                              .filter((h) => h.level === 2)
                              .map((h) => (
                                <li key={h.id}>
                                  <a href={`#${h.id}`}>{h.text}</a>
                                </li>
                              ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </details>
        </nav>
        <main className="help-main">
          <p className="help-intro">{M.intro}</p>
          {manual.pages.map((p) => (
            <article key={p.file} id={p.anchor} className="help-page" data-file={p.file}>
              <div className="help-md" dangerouslySetInnerHTML={{ __html: p.html }} />
              <p className="help-page-foot">
                <span>docs/manual/{p.file}</span> · <a href="#top">{M.backToTop}</a>
              </p>
            </article>
          ))}
        </main>
      </div>
      <HelpDiagrams />
    </div>
  );
}
