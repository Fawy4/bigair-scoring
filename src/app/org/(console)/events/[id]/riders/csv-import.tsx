"use client";

import { useState } from "react";
import { RiderLabel } from "@/components/rider-label";
import { tableLabel } from "@/lib/identification/effective";
import { readRiderCsv, type CsvReadResult } from "@/lib/riders/csv";
import type { IdentificationScheme } from "@/lib/schemas/identification";
import { copy } from "@/lib/ui-copy";
import { importRiderRows } from "./actions";
import type { OrgRider } from "./types";
import { useAction } from "./use-action";

const T = copy.riders;

/** Paste or upload a CSV: a preview with one line per problem comes first, and nothing is saved until the organiser presses Import. */
export function CsvImport({ divisionId, scheme, orgRiders }: { divisionId: string; scheme: IdentificationScheme; orgRiders: OrgRider[] }) {
  const { pending, error, run } = useAction();
  const [text, setText] = useState("");
  const [result, setResult] = useState<CsvReadResult | null>(null);

  const existingEmails = orgRiders.map((r) => r.email).filter((e): e is string => Boolean(e));
  const preview = (value: string) => setResult(value.trim() ? readRiderCsv(value, { palette: scheme.palette, existingEmails }) : null);
  const good = result?.rows.filter((r) => r.rider) ?? [];
  const bad = result?.rows.filter((r) => !r.rider) ?? [];

  async function onFile(file: File | undefined) {
    if (!file) return;
    const value = await file.text();
    setText(value);
    preview(value);
  }

  return (
    <section className="panel flex flex-col gap-3" aria-labelledby="csv-h">
      <h2 id="csv-h" className="text-xl font-semibold">
        {T.importHeading}
      </h2>
      <p className="font-semibold">{T.importHelp}</p>
      <label htmlFor="csv-text" className="font-semibold">
        {T.importPaste}
      </label>
      <textarea id="csv-text" rows={6} className="w-full font-mono" value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} spellCheck={false} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="btn cursor-pointer">
          {T.importFile}
          <input type="file" accept=".csv,text/csv,text/plain" className="sr-only" data-testid="csv-file" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        <button type="button" className="btn btn-primary" disabled={!text.trim()} onClick={() => preview(text)} data-testid="csv-preview">
          {T.importPreview}
        </button>
        <button type="button" className="btn" disabled={!text && !result} onClick={() => { setText(""); setResult(null); }}>
          {T.importClear}
        </button>
      </div>

      {error ? (
        <p role="alert" className="field-error">
          {copy.common.problem(error)}
        </p>
      ) : null}

      {result ? (
        <div className="flex flex-col gap-3" data-testid="csv-preview-area">
          <h3 className="text-lg font-semibold">{T.importPreviewHeading}</h3>
          {result.fatal ? (
            <p role="alert" className="field-error" data-testid="csv-fatal">
              {copy.common.problem(result.fatal)}
            </p>
          ) : (
            <>
              <p className="text-lg font-semibold" data-testid="csv-summary">
                {T.importSummary(good.length, bad.length)}
              </p>
              {result.unknownColumns.length ? <p className="font-semibold">{T.importUnknown(result.unknownColumns.join(", "))}</p> : null}
              {bad.length ? (
                <ul className="list-disc pl-6 font-semibold" aria-label={T.importProblemsLabel} data-testid="csv-problems">
                  {bad.flatMap((r) => r.problems.map((p, i) => <li key={`${r.line}-${i}`} data-testid="csv-problem">{T.importProblemLine(r.line, p)}</li>))}
                </ul>
              ) : null}
              {result.warnings.length ? (
                <ul className="list-disc pl-6 font-semibold" data-testid="csv-warnings">
                  {result.warnings.map((w, i) => <li key={i}>{T.importWarning(w)}</li>)}
                </ul>
              ) : null}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {Object.values(T.previewColumns).map((c) => (
                        <th key={c} className="border border-beach-line bg-beach-surface p-2 text-left">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r) => (
                      <tr key={r.line}>
                        <td className="border border-beach-line p-2">{r.line}</td>
                        <td className="border border-beach-line p-2 font-semibold">{r.rider ? `${r.rider.first} ${r.rider.last}` : "—"}</td>
                        <td className="border border-beach-line p-2">{r.rider?.seed ?? "—"}</td>
                        <td className="border border-beach-line p-2">
                          {r.rider ? (
                            <RiderLabel scheme={scheme} rider={{ name: "" }} size="sm" model={tableLabel(scheme, { name: `${r.rider.first} ${r.rider.last}`, nationality: r.rider.nationality, sponsor: r.rider.sponsor, photoUrl: r.rider.photoUrl, identifiers: r.rider.identifiers })} />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="border border-beach-line p-2 font-semibold">{r.rider ? (r.notes.length ? T.previewNote : T.previewOk) : T.previewBad}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={pending || good.length === 0}
                  data-testid="csv-import"
                  onClick={() =>
                    run(
                      () => importRiderRows(divisionId, good.map((r) => r.rider)),
                      (r) => T.importDone(r.created, r.matched, r.already),
                      () => { setText(""); setResult(null); },
                    )
                  }
                >
                  {good.length ? T.importButton(good.length) : T.importNothing}
                </button>
                {bad.length ? <span className="font-semibold">{T.importSkipNote(bad.length)}</span> : null}
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
