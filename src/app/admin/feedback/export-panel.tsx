"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { copy } from "@/lib/ui-copy";
import { exportFeedbackNotes } from "../actions";

const T = copy.feedback;

/** "Export for Claude": every open note as one file, grouped by kind and screen. Download it, or copy it to paste into Claude Code. */
export function ExportPanel() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ markdown: string; count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);

  function download(text: string) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "FEEDBACK.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("yes");
    } catch {
      setCopied("no");
    }
    setTimeout(() => setCopied(null), 3000);
  }

  return (
    <section className="panel flex flex-col gap-3" aria-labelledby="export-h" data-testid="export-panel">
      <h2 id="export-h" className="text-xl font-extrabold">
        {T.exportHeading}
      </h2>
      <p className="font-semibold">{T.exportHelp}</p>
      <div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          data-testid="export-button"
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await exportFeedbackNotes();
              if (!r.ok) return setError(r.error);
              setResult({ markdown: r.markdown, count: r.count });
              router.refresh();
            })
          }
        >
          {T.exportButton}
        </button>
      </div>
      {error ? <p role="alert" className="field-error">{copy.common.problem(error)}</p> : null}
      {result ? (
        <div className="flex flex-col gap-3" data-testid="export-result">
          <p className="font-bold">{result.count === 0 ? T.exportNone : T.exportDone(result.count)}</p>
          <textarea readOnly rows={10} value={result.markdown} aria-label="FEEDBACK.md" className="w-full font-mono" data-testid="export-text" />
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" onClick={() => download(result.markdown)} data-testid="export-download">
              {T.exportDownload}
            </button>
            <button type="button" className="btn" onClick={() => copyText(result.markdown)} data-testid="export-copy">
              {copied === "yes" ? T.exportCopied : T.exportCopy}
            </button>
            {copied === "no" ? <span role="alert" className="font-bold">{T.exportCopyFailed}</span> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
