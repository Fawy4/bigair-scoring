"use client";

import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const C = copy.live.console;

export const btn = "inline-flex min-h-tap items-center justify-center gap-1.5 rounded-xl border px-3 text-body font-semibold";
export const plain = `${btn} border-beach-border bg-beach-bg text-beach-ink`;
export const primary = `${btn} border-beach-accent bg-beach-accent text-beach-on-accent`;
export const off = `${btn} border-beach-line bg-beach-surface text-beach-muted`;

/** A dialog that sits over the console. Every change asks for a reason (audited). */
/** `screen`: cover the whole window (the real pages); otherwise cover the console box it sits in (the /design preview). */
export function Modal({ title, children, onClose, screen = false }: { title: string; children: React.ReactNode; onClose: () => void; screen?: boolean }) {
  return (
    <div className={cn(screen ? "fixed" : "absolute", "inset-0 z-20 flex items-start justify-center overflow-y-auto bg-black/40 p-3")} data-testid="console-dialog-layer">
      <section role="dialog" aria-label={title} data-testid="console-dialog" className="flex w-full max-w-[26rem] flex-col gap-2 rounded-card border border-beach-border bg-beach-bg p-3">
        <h3 className="text-name font-semibold">{title}</h3>
        {children}
        <span className="sr-only">
          <button type="button" onClick={onClose}>
            {C.cancel}
          </button>
        </span>
      </section>
    </div>
  );
}

export function Reason({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-0.5 text-small font-medium text-beach-muted">
      {C.reason}
      <input data-testid="reason-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={C.reasonPlaceholder} className="min-h-tap rounded-xl border border-beach-border bg-beach-bg px-2 text-body font-medium text-beach-ink placeholder:text-beach-muted" />
    </label>
  );
}

export function Footer({ canSave, onSave, onCancel, saveLabel = C.save }: { canSave: boolean; onSave: () => void; onCancel: () => void; saveLabel?: string }) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <button type="button" data-testid="dialog-save" disabled={!canSave} onClick={onSave} className={canSave ? primary : off}>
        {saveLabel}
      </button>
      <button type="button" data-testid="dialog-cancel" onClick={onCancel} className={plain}>
        {C.cancel}
      </button>
    </div>
  );
}

