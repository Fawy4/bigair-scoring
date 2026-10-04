"use client";

import { useRef, useState } from "react";
import { Archive, Download, Printer } from "lucide-react";
import { Button, disabledWhen } from "@/components/org/button";
import { HelpTip } from "@/components/org/help-tip";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const X = copy.exportFiles;

/** "attachment; filename="x.csv"" → x.csv (the server names every file; this is only the fallback when the header is unreadable). */
function fileNameOf(header: string | null, fallback: string): string {
  const m = header ? /filename="([^"]+)"/.exec(header) : null;
  return m?.[1] ?? fallback;
}

/**
 * Fetches a file from an export route and hands it to the browser as a download, without leaving the page: a refusal or an error comes back as a sentence under the
 * button, so the head judge's console never navigates away in the middle of a heat.
 */
function useDownload() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  async function download(key: string, url: string, fallbackName: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? X.refused.failed);
        return;
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = fileNameOf(res.headers.get("Content-Disposition"), fallbackName);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch {
      setError(X.refused.failed);
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }
  return { busy, error, download };
}

const headButton = "inline-flex min-h-tap items-center justify-center gap-1.5 self-start rounded-xl border border-beach-border bg-beach-bg px-3 text-body font-semibold text-beach-ink disabled:cursor-not-allowed disabled:border-dashed disabled:text-beach-muted";

/**
 * The export buttons. `organiser`: Download results, Open printable results, the draft box (with its "?"), and - on the Go live step - Download event backup.
 * `head` (the head judge's laptop console): Download results and Open printable results only; no draft box, no backup. Judges, spotters, observers and the public are
 * never given this component, and the routes refuse them as well.
 */
export function ExportButtons({ eventId, role, withBackup = false }: { eventId: string; role: "organiser" | "head"; withBackup?: boolean }) {
  const [draft, setDraft] = useState(false);
  const { busy, error, download } = useDownload();
  const q = draft && role === "organiser" ? "?draft=1" : "";
  const resultsUrl = `/export/${eventId}/results.csv${q}`;
  const printUrl = `/export/${eventId}/print${q}`;
  const working = busy ? X.results.working : null;

  const draftBox =
    role === "organiser" ? (
      <span className="inline-flex flex-wrap items-center gap-1">
        <label className="inline-flex min-h-[var(--org-ctl)] items-center gap-2 text-body font-semibold">
          <input type="checkbox" data-testid="export-draft" checked={draft} onChange={(e) => setDraft(e.target.checked)} className="size-5" />
          {X.draft.label}
        </label>
        <HelpTip what={X.draft.label} text={X.draft.help} example={X.draft.example} />
      </span>
    ) : null;

  return (
    <div data-testid="export-buttons" className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-start gap-2">
        {role === "organiser" ? (
          <>
            <Button variant="secondary" icon={Download} data-testid="export-results" {...disabledWhen(working)} onClick={() => void download("results", resultsUrl, "results.csv")}>
              {X.results.button}
            </Button>
            <Button variant="secondary" icon={Printer} href={printUrl} target="_blank" data-testid="export-print">
              {X.results.printable}
            </Button>
            {withBackup ? (
              <Button variant="secondary" icon={Archive} data-testid="export-backup" {...disabledWhen(working)} onClick={() => void download("backup", `/export/${eventId}/backup.json`, "backup.json")}>
                {X.backup.button}
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <button type="button" data-testid="export-results" disabled={Boolean(busy)} onClick={() => void download("results", resultsUrl, "results.csv")} className={headButton}>
              <Download aria-hidden className="size-4" />
              {busy ? X.results.working : X.results.button}
            </button>
            <a data-testid="export-print" href={printUrl} target="_blank" rel="noopener noreferrer" className={cn(headButton)}>
              <Printer aria-hidden className="size-4" />
              {X.results.printable}
            </a>
          </>
        )}
      </div>
      {draftBox}
      {error ? (
        <p role="alert" data-testid="export-error" className="text-body font-semibold text-beach-crash">
          {error}
        </p>
      ) : null}
    </div>
  );
}
