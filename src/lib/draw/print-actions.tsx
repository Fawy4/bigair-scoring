"use client";

import { PrintButton } from "@/components/print-button";
import { toast } from "@/hooks/use-toast";
import { drawDrawPngs } from "./print-png";
import type { PrintHeader, PrintSheet } from "./print-sheet";
import { copy } from "@/lib/ui-copy";

const T = copy.draw.sheet;

/** Print / PDF and Export PNG of the same page. Both are hidden on paper. */
export function PrintActions({ sheet, header }: { sheet: PrintSheet; header: PrintHeader }) {
  async function exportPng() {
    try {
      const blobs = await drawDrawPngs(sheet, header);
      blobs.forEach((blob, i) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = blobs.length > 1 ? copy.draw.sheet.fileName(header.divisionName).replace(".png", `-${i + 1}.png`) : T.fileName(header.divisionName);
        a.click();
        URL.revokeObjectURL(url);
      });
      toast({ title: T.pngDone });
    } catch {
      toast({ title: T.pngFailed });
    }
  }
  return (
    <div className="no-print flex flex-wrap items-center gap-3">
      <PrintButton label={copy.draw.printNow} />
      <button type="button" className="btn" onClick={exportPng} data-testid="export-png">
        {T.exportPng}
      </button>
      <span className="font-semibold">{copy.draw.printHelp}</span>
    </div>
  );
}
