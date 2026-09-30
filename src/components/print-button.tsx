"use client";

/** Opens the browser's print dialog (which can also save as PDF). Hidden on paper. */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className="btn btn-primary no-print" onClick={() => window.print()} data-testid="print-button">
      {label}
    </button>
  );
}
