"use client";

import { useState } from "react";

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
}: {
  label: string;
  question: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  pending?: boolean;
  danger?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className={`btn ${danger ? "btn-danger" : ""}`} disabled={disabled || pending} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <div role="group" aria-label={label} className="panel flex flex-col gap-3">
      <p className="text-lg font-bold">{question}</p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={`btn btn-primary ${danger ? "!border-[#9b1c1c] !bg-[#9b1c1c]" : ""}`}
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
