"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { Button, disabledWhen } from "@/components/org/button";
import { toast } from "@/hooks/use-toast";
import { copy } from "@/lib/ui-copy";
import { previewReset, resetEvent, type ResetPreview } from "./reset-actions";

const T = copy.reset;

/**
 * "Reset event…" on the dashboard, a quiet danger button at the end of the quick actions. It opens a short panel: what will be wiped (counts from the database),
 * what blocks it, the event's web address to type and, only when results were ever shown publicly, a written reason. One confirmation.
 */
export function ResetEvent({ eventId, runningHeat }: { eventId: string; runningHeat: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ResetPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  if (runningHeat) {
    return (
      <Button variant="danger" icon={RotateCcw} disabled disabledReason={copy.reset.errors.HEAT_RUNNING(runningHeat)}>
        {T.open}
      </Button>
    );
  }

  const load = () => {
    setOpen(true);
    setError(null);
    setPreview(null);
    start(async () => {
      const r = await previewReset(eventId);
      if (r.ok) setPreview(r.preview);
      else setError(r.error);
    });
  };
  const close = () => {
    setOpen(false);
    setTyped("");
    setReason("");
    setError(null);
  };
  const c = preview?.counts;
  const addressOk = preview ? typed.trim().toLowerCase() === preview.slug : false;
  const blocked = Boolean(preview && preview.running);

  const confirm = () =>
    start(async () => {
      setError(null);
      const r = await resetEvent({ eventId, slug: typed, reason: preview?.everPublic ? reason : undefined });
      if (r.ok) {
        toast({ title: T.done(r.counts.heats, r.counts.attempts, r.counts.published_results) });
        close();
        router.refresh();
      } else setError(r.error);
    });

  if (!open) {
    return (
      <Button variant="danger" icon={RotateCcw} onClick={load} data-testid="reset-open">
        {T.open}
      </Button>
    );
  }
  return (
    <div data-testid="reset-panel" role="group" aria-label={T.title} className="col-span-full flex flex-col gap-3 rounded-[8px] border border-beach-crash p-3">
      <h4 className="text-body font-semibold">{T.title}</h4>
      <p className="text-body font-medium text-beach-muted">{T.intro}</p>
      {!preview && !error ? <p className="text-body font-medium">{T.loading}</p> : null}
      {preview && c ? (
        <>
          <p data-testid="reset-counts" className="text-body font-semibold">
            {T.willWipe(c.heats, c.attempts, c.scores, c.published_results, c.reruns)}
          </p>
          {preview.rebuilt.length > 0 ? (
            <p data-testid="reset-rebuild-note" className="text-body font-semibold">
              {T.rebuiltNote(preview.rebuilt)}
            </p>
          ) : null}
          {blocked ? (
            <div role="alert" className="flex flex-col gap-1 text-body font-semibold">
              <p>{T.blocked}</p>
              <ul className="list-disc pl-6">
                {preview.running ? <li>{T.errors.HEAT_RUNNING(preview.running)}</li> : null}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <label htmlFor="reset-address" className="text-small font-semibold">
              {T.typeAddress(preview.slug)}
            </label>
            <input id="reset-address" aria-label={T.addressLabel} value={typed} onChange={(e) => setTyped(e.target.value)} spellCheck={false} autoCapitalize="none" className="h-[var(--org-ctl)] w-72 max-w-full rounded-[8px] border border-beach-border bg-transparent px-3 text-body font-semibold" />
          </div>
          {preview.everPublic ? (
            <div className="flex flex-col gap-1">
              <label htmlFor="reset-reason" className="text-small font-semibold">
                {T.reasonLabel}
              </label>
              <p className="text-small font-medium text-beach-muted">{T.reasonWhy}</p>
              <input id="reset-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="h-[var(--org-ctl)] w-full max-w-xl rounded-[8px] border border-beach-border bg-transparent px-3 text-body font-semibold" />
            </div>
          ) : null}
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-body font-semibold text-beach-crash">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-start gap-2">
        <Button variant="danger" onClick={confirm} data-testid="reset-confirm" {...disabledWhen(!preview ? T.loading : pending ? T.working : blocked ? T.blocked : !addressOk ? T.needAddress : null)}>
          {T.confirmButton}
        </Button>
        <Button variant="quiet" onClick={close}>
          {T.cancel}
        </Button>
      </div>
    </div>
  );
}
