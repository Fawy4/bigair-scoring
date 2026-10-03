"use client";

import { useEffect, useState } from "react";

/** A data-changing button with exactly one confirmation (beach rule 00.3): the first tap asks, the second tap does it. */
export function ConfirmButton({
  label,
  question,
  confirmLabel,
  cancelLabel,
  onConfirm,
  disabled,
  pending,
  danger,
  compact,
}: {
  label: string;
  question: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  pending?: boolean;
  danger?: boolean;
  /** A smaller button, for the tight cards of the draw. */
  compact?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  // Until the page is live a tap does nothing (the button arrives before its code on a slow connection), so it stays grey until then rather than
  // swallowing the tap without asking.
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);
  if (!asking) {
    return (
      <button type="button" className={`btn ${danger ? "btn-danger" : ""} ${compact ? "!min-h-7 !px-2 !text-sm" : ""}`} disabled={!live || disabled || pending} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <div role="group" aria-label={label} className={compact ? "panel flex flex-col gap-2 !p-2" : "panel flex flex-col gap-3"}>
      <p className="text-body font-semibold">{question}</p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={`btn ${danger ? "btn-danger-solid" : "btn-primary"}`}
          disabled={pending}
          onClick={() => {
            onConfirm();
            setAsking(false);
          }}
        >
          {confirmLabel}
        </button>
        <button type="button" className="btn" onClick={() => setAsking(false)}>
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
