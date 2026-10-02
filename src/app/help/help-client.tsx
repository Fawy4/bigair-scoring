"use client";

import { useEffect, useMemo, useState } from "react";
import type { SearchEntry } from "@/lib/manual/build";
import { searchManual } from "@/lib/manual/search";
import { copy } from "@/lib/ui-copy";

const M = copy.manual;

/** Search over every heading, the text under it and every table row with an anchor. Runs in the browser; nothing is sent anywhere. */
export function HelpSearch({ entries }: { entries: SearchEntry[] }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => searchManual(entries, q, 30), [entries, q]);
  const go = (id: string) => {
    setQ("");
    window.location.hash = id;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ block: "start" });
      el.classList.add("help-hit");
      window.setTimeout(() => el.classList.remove("help-hit"), 2500);
    }
  };
  return (
    <div className="help-search" role="search">
      <label htmlFor="help-q" className="sr-only">
        {M.search}
      </label>
      <input id="help-q" type="search" data-testid="help-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={M.searchPlaceholder} autoComplete="off" />
      {q.trim().length >= 2 ? (
        <div className="help-results" data-testid="help-results">
          <p className="help-results-count">{results.length ? M.searchCount(results.length) : M.searchNone(q.trim())}</p>
          <ul>
            {results.map((r) => (
              <li key={r.id}>
                <a
                  href={`#${r.id}`}
                  data-testid="help-result"
                  onClick={(e) => {
                    e.preventDefault();
                    go(r.id);
                  }}
                >
                  <strong>{r.title}</strong>
                  <span className="help-result-page">{r.page}</span>
                  {r.snippet ? <span className="help-result-snippet">{r.snippet}</span> : null}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** The whole manual as one PDF: every picture is loaded first, then the browser's print window opens ("Save as PDF"). */
export function PdfButton() {
  const [busy, setBusy] = useState(false);
  const print = async () => {
    setBusy(true);
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>(".help-md img"));
    for (const img of imgs) img.loading = "eager";
    await Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : new Promise<void>((done) => { img.onload = () => done(); img.onerror = () => done(); }))));
    document.querySelectorAll("details").forEach((d) => (d.open = true));
    setBusy(false);
    window.print();
  };
  return (
    <button type="button" className="help-pdf" data-testid="help-pdf" onClick={() => void print()} title={M.pdfHint} disabled={busy}>
      {M.pdf}
    </button>
  );
}

/** Draws the Mermaid diagrams (```mermaid blocks) once the page is in the browser. Without it the diagram's text stays readable. */
export function HelpDiagrams() {
  useEffect(() => {
    let gone = false;
    void (async () => {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>("pre.mermaid[data-diagram]"));
      if (!nodes.length) return;
      const { default: mermaid } = await import("mermaid");
      if (gone) return;
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral", flowchart: { useMaxWidth: true, htmlLabels: false } });
      await mermaid.run({ nodes });
      for (const n of nodes) n.setAttribute("data-rendered", "true");
    })();
    return () => {
      gone = true;
    };
  }, []);
  return null;
}
