"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Footer, Modal, plain, Reason } from "./console-parts";
import { decideTie, previewResetHeat, publishHeat, reopenHeat, rerunHeat, resetHeat, setPublishHold, type HeatResetPreview, type PublishResult } from "@/lib/live/head-actions";
import type { ChecklistItem, FixTarget } from "@/lib/live/publish-checklist";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const H = copy.headLive;

/**
 * Publish: the blocker list in plain words first, then one confirmation. Everything but a tie can be published past with a reason; a tie is settled by choosing
 * the order. The answer of the server (not the screen's own working) decides: a heat that has already been published answers "Already published" and nothing
 * is written twice.
 */
export function PublishDialog({ heatId, title, items, canOverride, onChooseOrder, onFix, onClose, onDone }: { heatId: string; title: string; items: ChecklistItem[]; canOverride: boolean; onChooseOrder: (riders: string[]) => void; /** "Fix" on a line: closes the dialog and opens the place on the console. */ onFix?: (target: FixTarget) => void; onClose: () => void; onDone: (text: string) => void }) {
  const [reason, setReason] = useState("");
  const [answer, setAnswer] = useState<PublishResult | null>(null);
  const [pending, start] = useTransition();
  const blocked = answer && !answer.ok && answer.blockers ? answer.blockers : items;
  const override = answer && !answer.ok && answer.canOverride !== undefined ? answer.canOverride : canOverride;
  const go = () =>
    start(async () => {
      const r = await publishHeat(heatId, reason.trim() || undefined, withBlockers && override);
      setAnswer(r);
      if (r.ok) onDone(r.already ? H.alreadyPublished : H.published(r.version));
    });
  const withBlockers = blocked.length > 0;
  return (
    <Modal screen title={H.publishTitle(title)} onClose={onClose}>
      {withBlockers ? (
        <>
          <p className="text-body font-semibold">{copy.live.console.publishBlocked}</p>
          <ul data-testid="publish-blockers" className="flex flex-col gap-1">
            {blocked.map((b) => (
              <li key={b.text} className="flex items-center justify-between gap-2 rounded-lg border border-beach-outlier bg-beach-bg px-2 py-0.5 text-body font-medium">
                <span>{b.text}</span>
                {b.kind === "tie" && b.riders ? (
                  <button type="button" data-testid="choose-order" className={plain} onClick={() => onChooseOrder(b.riders!)}>
                    {H.chooseOrder}
                  </button>
                ) : onFix && b.target ? (
                  <button type="button" data-testid="publish-fix" aria-label={copy.checklist.fixAria(b.text)} className={plain} onClick={() => onFix(b.target!)}>
                    {copy.checklist.fix}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {override ? (
            <>
              <p className="text-small font-medium text-beach-muted">{H.publishReasonHint}</p>
              <Reason value={reason} onChange={setReason} />
            </>
          ) : (
            <p className="text-small font-semibold">{H.publishNoOverride}</p>
          )}
        </>
      ) : (
        <p className="text-body font-medium">{H.publishAsk}</p>
      )}
      {answer && !answer.ok && !answer.blockers ? (
        <p role="alert" data-testid="publish-error" className="rounded-lg border border-beach-failed bg-beach-surface px-2 py-1 text-body font-semibold">
          {answer.message}
        </p>
      ) : null}
      <Footer
        canSave={!pending && (!withBlockers || (override))}
        onSave={go}
        onCancel={onClose}
        saveLabel={pending ? H.working : withBlockers ? H.publishWithReason : H.publishYes}
      />
    </Modal>
  );
}

/** Re-open a published heat: one confirmation and a reason. Publishing again writes the next version. */
export function ReopenDialog({ heatId, title, onClose, onDone }: { heatId: string; title: string; onClose: () => void; onDone: (text: string) => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Modal screen title={H.reopenTitle(title)} onClose={onClose}>
      <p className="text-body font-medium">{H.reopenAsk}</p>
      <Reason value={reason} onChange={setReason} />
      {error ? (
        <p role="alert" className="rounded-lg border border-beach-failed bg-beach-surface px-2 py-1 text-body font-semibold">
          {error}
        </p>
      ) : null}
      <Footer
        canSave={!pending}
        saveLabel={pending ? H.working : H.reopenYes}
        onCancel={onClose}
        onSave={() =>
          start(async () => {
            const r = await reopenHeat(heatId, reason);
            if (r.ok) onDone(H.reopened);
            else setError(r.message);
          })
        }
      />
    </Modal>
  );
}

/** "Red and Blue are tied": the head judge puts the riders in order (best first) with a reason; the engine reads it as the head judge's decision. */
export function TieDialog({ heatId, riders, onClose, onDone }: { heatId: string; riders: Array<{ id: string; word: string }>; onClose: () => void; onDone: (text: string) => void }) {
  const [order, setOrder] = useState(riders.map((r) => r.id));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const move = (i: number, d: -1 | 1) =>
    setOrder((o) => {
      const next = [...o];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });
  const word = (id: string) => riders.find((r) => r.id === id)?.word ?? id;
  return (
    <Modal screen title={H.tieTitle} onClose={onClose}>
      <p className="text-body font-medium text-beach-muted">{H.tieNote}</p>
      <ol data-testid="tie-order" className="flex flex-col gap-1">
        {order.map((id, i) => (
          <li key={id} className="flex items-center justify-between gap-2 rounded-xl border border-beach-line bg-beach-surface px-2 py-1 text-body font-semibold">
            <span>
              {i + 1}. {word(id)}
            </span>
            <span className="flex gap-1">
              <button type="button" aria-label={`${H.up}: ${word(id)}`} disabled={i === 0} onClick={() => move(i, -1)} className={cn(plain, "!px-2")}>
                <ArrowUp aria-hidden className="size-4" />
              </button>
              <button type="button" aria-label={`${H.down}: ${word(id)}`} disabled={i === order.length - 1} onClick={() => move(i, 1)} className={cn(plain, "!px-2")}>
                <ArrowDown aria-hidden className="size-4" />
              </button>
            </span>
          </li>
        ))}
      </ol>
      <Reason value={reason} onChange={setReason} />
      {error ? (
        <p role="alert" className="rounded-lg border border-beach-failed bg-beach-surface px-2 py-1 text-body font-semibold">
          {error}
        </p>
      ) : null}
      <Footer
        canSave={!pending}
        saveLabel={pending ? H.working : H.tieSave}
        onCancel={onClose}
        onSave={() =>
          start(async () => {
            const r = await decideTie(heatId, order, reason);
            if (r.ok) onDone(H.tieSaved);
            else setError(r.message);
          })
        }
      />
    </Modal>
  );
}

/** Re-run heat: one confirmation and a reason; riders who do not ride again are marked Disqualified or Did not start and ranked last (no third option). */
export function RerunDialog({ heatId, title, riders, onClose, onDone }: { heatId: string; title: string; riders: Array<{ entryId: string; word: string; name: string }>; onClose: () => void; onDone: (newHeatId: string) => void }) {
  const [reason, setReason] = useState("");
  const [out, setOut] = useState<Record<string, "" | "DSQ" | "DNS">>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Modal screen title={H.rerunTitle(title)} onClose={onClose}>
      <p className="text-body font-medium">{H.rerunAsk}</p>
      <p className="text-small font-semibold text-beach-muted">{H.rerunRiders}</p>
      {riders.map((r) => (
        <label key={r.entryId} className="flex items-center justify-between gap-2 text-body font-medium">
          <span>
            {r.word} · {r.name}
          </span>
          <select data-testid="rerun-rider" data-rider={r.entryId} value={out[r.entryId] ?? ""} onChange={(e) => setOut((o) => ({ ...o, [r.entryId]: e.target.value as "" | "DSQ" | "DNS" }))} className="min-h-tap rounded-xl border border-beach-border bg-beach-bg px-2 text-body font-medium text-beach-ink">
            <option value="">{H.rerunRidesAgain}</option>
            <option value="DSQ">{H.rerunDsq}</option>
            <option value="DNS">{H.rerunDns}</option>
          </select>
        </label>
      ))}
      <Reason value={reason} onChange={setReason} />
      {error ? (
        <p role="alert" data-testid="dialog-error" className="rounded-lg border border-beach-failed bg-beach-surface px-2 py-1 text-body font-semibold">
          {error}
        </p>
      ) : null}
      <Footer
        canSave={!pending}
        saveLabel={pending ? H.working : H.rerunYes}
        onCancel={onClose}
        onSave={() =>
          start(async () => {
            const leaveOut = Object.fromEntries(Object.entries(out).filter(([, v]) => v)) as Record<string, "DSQ" | "DNS">;
            const r = await rerunHeat({ heatId, reason, leaveOut });
            if (r.ok) onDone(r.newHeatId);
            else setError(r.message);
          })
        }
      />
    </Modal>
  );
}

/** Hold a published result back from the public (a reason is needed); releasing needs none. */
export function HoldDialog({ heatId, title, onClose, onDone }: { heatId: string; title: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Modal screen title={`${H.holdTitle}: ${title}`} onClose={onClose}>
      <Reason value={reason} onChange={setReason} />
      {error ? (
        <p role="alert" className="rounded-lg border border-beach-failed bg-beach-surface px-2 py-1 text-body font-semibold">
          {error}
        </p>
      ) : null}
      <Footer
        canSave={!pending}
        saveLabel={pending ? H.working : H.holdYes}
        onCancel={onClose}
        onSave={() =>
          start(async () => {
            const r = await setPublishHold(heatId, true, reason);
            if (r.ok) onDone();
            else setError(r.message);
          })
        }
      />
    </Modal>
  );
}

/** Reset this heat: what is kept and what changes, a reason when the heat was ever shown publicly, one confirmation. A refusal stays on screen with the fix. */
export function ResetHeatDialog({ heatId, title, onClose, onDone }: { heatId: string; title: string; onClose: () => void; onDone: (text: string) => void }) {
  const R = copy.resetParts;
  const [preview, setPreview] = useState<HeatResetPreview | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    let alive = true;
    void previewResetHeat(heatId).then((r) => {
      if (!alive) return;
      if (r.ok) setPreview(r.preview);
      else setError(r.message);
    });
    return () => {
      alive = false;
    };
  }, [heatId]);
  const blocker = preview?.running ? copy.reset.errors.HEAT_RUNNING(preview.running) : null;
  return (
    <Modal screen title={R.heat.title(title)} onClose={onClose}>
      <p className="text-body font-medium">{R.heat.intro}</p>
      {!preview && !error ? <p className="text-body font-medium text-beach-muted">{R.loading}</p> : null}
      {preview ? (
        <p data-testid="reset-heat-line" className="text-body font-semibold">
          {R.heat.wipes(preview.counts.attempts, preview.counts.scores, preview.counts.published_results)}
        </p>
      ) : null}
      {blocker ? (
        <p role="alert" data-testid="reset-heat-blocked" className="rounded-lg border border-beach-failed bg-beach-surface px-2 py-1 text-body font-semibold">
          {blocker}
        </p>
      ) : null}
      {preview?.everPublic ? (
        <>
          <p className="text-small font-medium text-beach-muted">{R.reasonWhy}</p>
          <Reason value={reason} onChange={setReason} />
        </>
      ) : null}
      {error ? (
        <p role="alert" data-testid="dialog-error" className="rounded-lg border border-beach-failed bg-beach-surface px-2 py-1 text-body font-semibold">
          {error}
        </p>
      ) : null}
      <Footer
        canSave={Boolean(preview) && !blocker && !pending}
        saveLabel={pending ? R.working : R.heat.confirm}
        onCancel={onClose}
        onSave={() =>
          start(async () => {
            setError(null);
            const r = await resetHeat({ heatId, reason });
            if (r.ok) onDone(R.heat.done(title));
            else setError(r.message);
          })
        }
      />
    </Modal>
  );
}
