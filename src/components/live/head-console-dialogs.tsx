"use client";

import { useMemo, useState, useTransition } from "react";
import { CriteriaRows } from "./criteria-rows";
import { Footer, Modal, plain, Reason, btn } from "./console-parts";
import { ScorePad } from "./score-pad";
import { judgeTrickScore } from "@/lib/engine/scoring";
import { addAttemptByHead, addInterference, deleteAttempts, editAttempt, flagOutRiders, headSetImpression, headSetScore, mergeAttempts, removePenalty, setRiderStatus, type HeadResult } from "@/lib/live/head-actions";
import { canAddPastCap, defaultKeep, mergePlan, type PastCapRole } from "@/lib/live/merge-plan";
import { formatCell } from "@/lib/live/matrix-model";
import { markOf } from "@/lib/live/heat-input";
import type { LiveMatrixRow } from "@/lib/live/matrix";
import type { HeatRider } from "@/lib/live/screen-model";
import type { AttemptRow, ScoreRow } from "@/lib/live/types";
import type { ScoringModel } from "@/lib/schemas/scoring-model";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const C = copy.live.console;
const H = copy.headLive;
const field = "min-h-tap rounded-xl border border-beach-border bg-beach-bg px-2 text-body font-medium text-beach-ink";

/** Runs a server action; on success the dialog closes and the console refreshes, otherwise the answer is shown in words inside the dialog. */
function useRun(onDone: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<HeadResult>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.ok) onDone();
      else setError(r.message);
    });
  return { error, pending, run };
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" data-testid="dialog-error" className="rounded-lg border border-beach-failed bg-beach-surface px-2 py-1 text-body font-semibold">
      {error}
    </p>
  ) : null;
}

function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)} className={cn(btn, value === v ? "border-beach-accent bg-beach-accent text-beach-on-accent" : "border-beach-border bg-beach-bg text-beach-ink")}>
          {text}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- one judge's score of one attempt
export function CellDialog({ model, attemptId, seatId, judgeNo, judge, who, current, onClose, onDone }: { model: ScoringModel; attemptId: string; seatId: string; judgeNo?: number; /** The judge as a word (the seat's name); without it the dialog says "Judge n" (the design preview). */ judge?: string; who: string; current: ScoreRow | undefined; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const criteria = model.trick.entry === "criteria";
  const [single, setSingle] = useState<number | null>(null);
  const [values, setValues] = useState<Record<string, number | undefined>>(() => (criteria && current?.criteria && typeof current.criteria === "object" ? { ...(current.criteria as Record<string, number>) } : {}));
  const { error, pending, run } = useRun(onDone);
  const complete = criteria ? model.trick.criteria.every((c) => values[c.key] !== undefined) : single !== null;
  const computed = useMemo(() => {
    if (criteria) {
      if (!complete) return null;
      try {
        return judgeTrickScore(model, values as Record<string, number>).score;
      } catch {
        return null;
      }
    }
    return single;
  }, [criteria, complete, model, values, single]);
  const nowMark = markOf(model, current);
  const nowLabel = nowMark === undefined ? copy.live.pad.none : nowMark === "missed" ? copy.live.matrix.missed : criteria ? formatCell(judgeTrickScore(model, nowMark as Record<string, number>).score) : formatCell(Number(nowMark));
  return (
    <Modal screen title={C.editScore} onClose={onClose}>
      <p className="text-body font-medium text-beach-muted">{C.editScoreFor(judge ?? copy.live.matrix.judge(judgeNo ?? 0), who)}</p>
      {criteria ? (
        <CriteriaRows
          criteria={model.trick.criteria.map((c) => ({ key: c.key, label: c.label, ...(c.help ? { help: c.help } : {}), scale: c.scale }))}
          values={values}
          onChange={(key, v) => setValues((o) => ({ ...o, [key]: v }))}
          computedLabel={computed === null ? null : formatCell(computed)}
          caption={<span>{C.nowScore(nowLabel)}</span>}
        />
      ) : (
        <ScorePad scale={model.trick.scale} value={single} label={C.newScore} caption={<span>{C.nowScore(nowLabel)}</span>} onChange={setSingle} />
      )}
      <Reason value={reason} onChange={setReason} />
      <ErrorLine error={error} />
      <Footer
        canSave={!pending && complete && reason.trim().length >= 3}
        saveLabel={pending ? H.working : C.save}
        onCancel={onClose}
        onSave={() => run(() => headSetScore({ attemptId, seatId, ...(criteria ? { criteria: values as Record<string, number> } : { score: single }), reason }))}
      />
      <button type="button" data-testid="mark-absent" disabled={pending} onClick={() => run(() => headSetScore({ attemptId, seatId, missed: true, reason: "Absent" }))} className={plain}>
        {H.absent}
      </button>
    </Modal>
  );
}

// ---------------------------------------------------------------- a judge's Impression / Variety score typed in from paper
export function ImpressionDialog({ model, heatId, seatId, judgeNo, judge, riders, first, onClose, onDone }: { model: ScoringModel; heatId: string; seatId: string; judgeNo?: number; judge?: string; riders: Array<{ id: string; word: string }>; first: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [entry, setEntry] = useState(first);
  const [value, setValue] = useState<number | null>(null);
  const { error, pending, run } = useRun(onDone);
  const scale = model.heat.impression?.scale;
  if (!scale) return null;
  return (
    <Modal screen title={C.enterImpression} onClose={onClose}>
      <p className="text-body font-medium text-beach-muted">{judge ?? copy.live.matrix.judge(judgeNo ?? 0)}</p>
      {riders.length > 1 ? (
        <Choice label={C.rider} value={entry} onChange={setEntry} options={riders.map((r) => [r.id, r.word] as [string, string])} />
      ) : (
        <p className="text-body font-semibold">{riders[0]?.word}</p>
      )}
      <ScorePad scale={scale} value={value} label={copy.live.impression.heading} onChange={setValue} />
      <Reason value={reason} onChange={setReason} />
      <ErrorLine error={error} />
      <Footer canSave={!pending && value !== null && reason.trim().length >= 3} saveLabel={pending ? H.working : C.save} onCancel={onClose} onSave={() => run(() => headSetImpression({ heatId, entryId: entry, seatId, value: value as number, reason }))} />
    </Modal>
  );
}

// ---------------------------------------------------------------- delete one or several attempts
export function DeleteDialog({ rows, wordFor, onClose, onDone }: { rows: LiveMatrixRow[]; wordFor: (entryId: string) => string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const { error, pending, run } = useRun(onDone);
  return (
    <Modal screen title={rows.length === 1 ? C.delete : C.deleteSelectedTitle(rows.length)} onClose={onClose}>
      <p className="text-body font-semibold">{rows.length === 1 ? C.confirmDelete : rows.map((r) => H.attemptWord(wordFor(r.riderKey), r.seq)).join(", ")}</p>
      <Reason value={reason} onChange={setReason} />
      <ErrorLine error={error} />
      <Footer canSave={!pending && reason.trim().length >= 3} saveLabel={pending ? H.working : rows.length === 1 ? C.delete : C.deleteSelected} onCancel={onClose} onSave={() => run(() => deleteAttempts(rows.map((r) => r.attemptId), reason))} />
    </Modal>
  );
}

// ---------------------------------------------------------------- merge attempts that are one
export function MergeDialog({ model, rows, attempts, scores, panelSeatIds, judgeWord, wordFor, onClose, onDone }: { model: ScoringModel; rows: LiveMatrixRow[]; attempts: AttemptRow[]; scores: ScoreRow[]; panelSeatIds: string[]; /** The judge as a word (the seat's name); without it "Judge n". */ judgeWord?: (seatId: string) => string; wordFor: (entryId: string) => string; onClose: () => void; onDone: () => void }) {
  const picked = attempts.filter((a) => rows.some((r) => r.attemptId === a.id));
  const first = useMemo(() => defaultKeep(picked), [picked]);
  const [keep, setKeep] = useState(first.keep);
  const [choices, setChoices] = useState<Record<string, "keep" | "drop">>({});
  const [reason, setReason] = useState("");
  const { error, pending, run } = useRun(onDone);
  const drops = picked.filter((a) => a.id !== keep).map((a) => a.id);
  const valueOf = (attemptId: string, seat: string): number | null | undefined => {
    const s = scores.find((x) => x.attempt_id === attemptId && x.judge_seat_id === seat);
    const mark = markOf(model, s);
    if (mark === undefined) return undefined;
    if (mark === "missed") return null;
    try {
      return judgeTrickScore(model, mark).score;
    } catch {
      return undefined;
    }
  };
  const flat = panelSeatIds.flatMap((seat) => picked.flatMap((a) => (valueOf(a.id, seat) === undefined ? [] : [{ attemptId: a.id, judgeId: seat, value: valueOf(a.id, seat) as number | null }])));
  const plan = mergePlan(keep, drops, flat, choices);
  const show = (v: number | null | undefined) => (v === undefined ? copy.live.pad.none : v === null ? copy.live.matrix.missed : formatCell(v));
  const label = (a: AttemptRow) => `${a.seq}. ${a.trick_name ?? ""} — ${panelSeatIds.map((seat) => show(valueOf(a.id, seat))).join(" / ")}`;
  const ordered = [...picked].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.seq - b.seq);
  return (
    <Modal screen title={C.mergeTitle} onClose={onClose}>
      <p className="text-small font-semibold text-beach-muted">{wordFor(picked[0]?.entry_id ?? "")}</p>
      {ordered.map((a, i) => (
        <label key={a.id} className="flex min-h-tap items-center gap-2 rounded-xl border border-beach-line bg-beach-surface px-2 text-body font-medium">
          <input type="radio" name="keep" data-testid="merge-keep" checked={keep === a.id} onChange={() => { setKeep(a.id); setChoices({}); }} className="size-5 accent-[var(--beach-accent)]" />
          <span>
            <span className="font-semibold">{C.mergeKeep}: </span>
            {label(a)} <span className="text-beach-muted">({i === 0 ? H.mergeFirst : H.mergeSecond})</span>
          </span>
        </label>
      ))}
      {plan.conflicts.length > 0 ? (
        <section aria-label={H.mergeWhich} className="flex flex-col gap-1">
          <p className="text-small font-semibold text-beach-muted">{H.mergeWhich}</p>
          {plan.conflicts.map((c) => (
            <div key={c.judgeId} className="flex flex-wrap items-center justify-between gap-2 text-body font-medium">
              <span>{H.mergeBoth(judgeWord ? judgeWord(c.judgeId) : copy.live.matrix.judge(panelSeatIds.indexOf(c.judgeId) + 1))}</span>
              <Choice
                label={judgeWord ? judgeWord(c.judgeId) : copy.live.matrix.judge(panelSeatIds.indexOf(c.judgeId) + 1)}
                value={c.takes}
                onChange={(v) => setChoices((o) => ({ ...o, [c.judgeId]: v }))}
                options={[
                  ["keep", show(c.keepValue)],
                  ["drop", show(c.dropValue)],
                ]}
              />
            </div>
          ))}
        </section>
      ) : null}
      <Reason value={reason} onChange={setReason} />
      <ErrorLine error={error} />
      <Footer canSave={!pending && drops.length > 0 && reason.trim().length >= 3} saveLabel={pending ? H.working : C.merge} onCancel={onClose} onSave={() => run(() => mergeAttempts({ keep, drops, choices, reason }))} />
    </Modal>
  );
}

// ---------------------------------------------------------------- edit an attempt
export function EditAttemptDialog({ attempt, riders, counts, cap, wordFor, onClose, onDone }: { attempt: AttemptRow; riders: HeatRider[]; counts: Map<string, number>; cap: number | null; wordFor: (entryId: string) => string; onClose: () => void; onDone: () => void }) {
  const [entry, setEntry] = useState(attempt.entry_id);
  const [trick, setTrick] = useState(attempt.trick_name ?? "");
  const [direction, setDirection] = useState<"left" | "right" | "">(attempt.direction ?? "");
  const [status, setStatus] = useState<"landed" | "crashed">(attempt.status);
  const [reason, setReason] = useState("");
  const { error, pending, run } = useRun(onDone);
  const full = entry !== attempt.entry_id && cap !== null && (counts.get(entry) ?? 0) >= cap;
  const changed = entry !== attempt.entry_id || trick.trim() !== (attempt.trick_name ?? "") || direction !== (attempt.direction ?? "") || status !== attempt.status;
  return (
    <Modal screen title={C.editTitle} onClose={onClose}>
      <label className="flex flex-col gap-0.5 text-small font-medium text-beach-muted">
        {C.rider}
        <select data-testid="edit-rider" value={entry} onChange={(e) => setEntry(e.target.value)} className={field}>
          {riders.map((r) => (
            <option key={r.entryId} value={r.entryId} disabled={!r.riding}>
              {wordFor(r.entryId)} · {r.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-0.5 text-small font-medium text-beach-muted">
        {C.trick}
        <input data-testid="edit-trick" value={trick} onChange={(e) => setTrick(e.target.value)} className={field} />
      </label>
      <Choice label={H.direction} value={direction} onChange={setDirection} options={[["left", H.left], ["right", H.right], ["", H.anyDirection]]} />
      <Choice label={C.landed} value={status} onChange={setStatus} options={[["landed", C.landed], ["crashed", C.crashed]]} />
      {full ? <p className="text-small font-semibold">{H.pastCapNeedsReason}</p> : null}
      <Reason value={reason} onChange={setReason} />
      <ErrorLine error={error} />
      <Footer
        canSave={!pending && changed && trick.trim().length > 0 && reason.trim().length >= 3}
        saveLabel={pending ? H.working : C.save}
        onCancel={onClose}
        onSave={() =>
          run(() =>
            editAttempt({
              attemptId: attempt.id,
              reason,
              ...(entry !== attempt.entry_id ? { entryId: entry } : {}),
              ...(trick.trim() !== (attempt.trick_name ?? "") ? { trickName: trick } : {}),
              ...(status !== attempt.status ? { status } : {}),
              ...(direction && direction !== attempt.direction ? { direction } : {}),
            }),
          )
        }
      />
    </Modal>
  );
}

// ---------------------------------------------------------------- add an attempt (past the cap only with a reason)
export function AddAttemptDialog({ heatId, riders, counts, cap, role, hasActiveHead, wordFor, onClose, onDone }: { heatId: string; riders: HeatRider[]; counts: Map<string, number>; cap: number | null; role: PastCapRole; hasActiveHead: boolean; wordFor: (entryId: string) => string; onClose: () => void; onDone: () => void }) {
  const riding = riders.filter((r) => r.riding);
  const [entry, setEntry] = useState(riding[0]?.entryId ?? "");
  const [trick, setTrick] = useState("");
  const [direction, setDirection] = useState<"left" | "right" | "">("");
  const [status, setStatus] = useState<"landed" | "crashed">("landed");
  const [reason, setReason] = useState("");
  const { error, pending, run } = useRun(onDone);
  const full = cap !== null && (counts.get(entry) ?? 0) >= cap;
  const allowed = canAddPastCap({ role, hasActiveHead, reason: "x" }).ok;
  return (
    <Modal screen title={C.addTitle} onClose={onClose}>
      <label className="flex flex-col gap-0.5 text-small font-medium text-beach-muted">
        {C.rider}
        <select data-testid="add-rider" value={entry} onChange={(e) => setEntry(e.target.value)} className={field}>
          {riding.map((r) => (
            <option key={r.entryId} value={r.entryId}>
              {wordFor(r.entryId)} · {r.name} ({counts.get(r.entryId) ?? 0}{cap !== null ? ` / ${cap}` : ""})
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-0.5 text-small font-medium text-beach-muted">
        {C.trick}
        <input data-testid="add-trick" value={trick} onChange={(e) => setTrick(e.target.value)} className={field} />
      </label>
      <Choice label={H.direction} value={direction} onChange={setDirection} options={[["left", H.left], ["right", H.right], ["", H.anyDirection]]} />
      <Choice label={C.landed} value={status} onChange={setStatus} options={[["landed", C.landed], ["crashed", C.crashed]]} />
      {full ? (
        <>
          <p className="text-small font-semibold">{allowed ? H.pastCapNeedsReason : H.pastCapNotAllowed}</p>
          {allowed ? <Reason value={reason} onChange={setReason} /> : null}
        </>
      ) : null}
      <ErrorLine error={error} />
      <Footer
        canSave={!pending && Boolean(entry) && trick.trim().length > 0 && (!full || (allowed && reason.trim().length >= 3))}
        saveLabel={pending ? H.working : C.add}
        onCancel={onClose}
        onSave={() => run(() => addAttemptByHead({ heatId, entryId: entry, trickName: trick, status, ...(direction ? { direction } : {}), ...(full ? { reason } : {}) }))}
      />
    </Modal>
  );
}

// ---------------------------------------------------------------- DNS / DNF / DSQ / Interference
export function StatusDialog({ heatId, entryId, who, status, penaltyId, onClose, onDone }: { heatId: string; entryId: string; who: string; status: "DNS" | "DNF" | "DSQ" | "INT" | "CLEAR" | "UNDO_INT"; penaltyId?: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const { error, pending, run } = useRun(onDone);
  const title = status === "CLEAR" ? H.clearStatus : status === "UNDO_INT" ? H.removeInterference : C.statusSet(status === "INT" ? C.interference : status);
  return (
    <Modal screen title={title} onClose={onClose}>
      <p className="text-body font-medium text-beach-muted">{who}</p>
      <Reason value={reason} onChange={setReason} />
      <ErrorLine error={error} />
      <Footer
        canSave={!pending && reason.trim().length >= 3}
        saveLabel={pending ? H.working : title}
        onCancel={onClose}
        onSave={() =>
          run(() => (status === "INT" ? addInterference({ heatId, entryId, reason }) : status === "UNDO_INT" ? removePenalty(penaltyId ?? "", reason) : setRiderStatus({ heatId, entryId, modifier: status === "CLEAR" ? null : status, reason })))
        }
      />
    </Modal>
  );
}

// ---------------------------------------------------------------- flag-out
export function FlagOutDialog({ heatId, riders, preselected, undecided, count, wordFor, onClose, onDone }: { heatId: string; riders: HeatRider[]; preselected: string[]; undecided: boolean; count: number; wordFor: (entryId: string) => string; onClose: () => void; onDone: () => void }) {
  const [picked, setPicked] = useState<string[]>(undecided ? [] : preselected);
  const [reason, setReason] = useState("");
  const { error, pending, run } = useRun(onDone);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <Modal screen title={H.flagOutHeading} onClose={onClose}>
      <p className="text-body font-medium text-beach-muted">{H.flagOutPick}</p>
      {undecided ? <p className="text-small font-semibold">{H.flagOutUndecided}</p> : null}
      {riders
        .filter((r) => r.riding)
        .map((r) => (
          <label key={r.entryId} className="flex min-h-tap items-center gap-2 rounded-xl border border-beach-line bg-beach-surface px-2 text-body font-medium">
            <input type="checkbox" data-testid="flag-out-rider" checked={picked.includes(r.entryId)} onChange={() => toggle(r.entryId)} className="size-5 accent-[var(--beach-accent)]" />
            {wordFor(r.entryId)} · {r.name}
          </label>
        ))}
      <Reason value={reason} onChange={setReason} />
      <ErrorLine error={error} />
      <Footer canSave={!pending && picked.length > 0 && picked.length <= count && reason.trim().length >= 3} saveLabel={pending ? H.working : H.flagOutSave} onCancel={onClose} onSave={() => run(() => flagOutRiders(heatId, picked, reason))} />
    </Modal>
  );
}

