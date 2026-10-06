"use client";

import { useMemo, useState, useTransition } from "react";
import { CriteriaRows } from "./criteria-rows";
import { Footer, Modal, off, plain, primary, Reason, btn } from "./console-parts";
import { ScorePad } from "./score-pad";
import { judgeTrickScore } from "@/lib/engine/scoring";
import { ABSENT_REASON } from "@/lib/live/sheet-rule";
import { nextOpenRider, type SheetDraft as Draft, type SheetRider } from "@/lib/live/impression-sheet";
import { clearPendingByHead, addAttemptByHead, addInterference, deleteAttempts, editAttempt, flagOutRiders, headSaveImpressionSheet, headSetScore, mergeAttempts, removePenalty, setRiderStatus, type HeadResult } from "@/lib/live/head-actions";
import { canAddPastCap, defaultKeep, mergePlan, type PastCapRole } from "@/lib/live/merge-plan";
import { formatCell } from "@/lib/live/matrix-model";
import { markOf } from "@/lib/live/heat-input";
import type { LiveMatrixRow } from "@/lib/live/matrix";
import type { HeatRider } from "@/lib/live/screen-model";
import type { AttemptRow, ScoreRow } from "@/lib/live/types";
import type { ScoringModel } from "@/lib/schemas/scoring-model";
import { impressionNameOf } from "@/lib/schemas/impression-name";
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
        canSave={!pending && complete}
        saveLabel={pending ? H.working : C.save}
        onCancel={onClose}
        onSave={() => run(() => headSetScore({ attemptId, seatId, ...(criteria ? { criteria: values as Record<string, number> } : { score: single }), reason }))}
      />
      <button type="button" data-testid="mark-absent" disabled={pending} onClick={() => run(() => headSetScore({ attemptId, seatId, missed: true, reason: ABSENT_REASON }))} className={plain}>
        {H.absent}
      </button>
    </Modal>
  );
}

// ---------------------------------------------------------------- a judge's Impression / Variety sheet typed in from paper
/**
 * One judge's Impression / Variety sheet, typed in by the head judge (Polish 2, item 6): every rider of the heat in a list, the pad for the one selected; a value
 * (or Absent) moves on to the next rider who has nothing yet; **Save** saves every changed rider at once with one reason; the big button saves and submits
 * that judge's sheet for them.
 */
export function ImpressionDialog({ model, heatId, seatId, judgeNo, judge, riders, first, onClose, onDone }: { model: ScoringModel; heatId: string; seatId: string; judgeNo?: number; judge?: string; riders: SheetRider[]; first: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [entry, setEntry] = useState(first);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const { error, pending, run } = useRun(onDone);
  const scale = model.heat.impression?.scale;
  if (!scale) return null;
  const who = judge ?? copy.live.matrix.judge(judgeNo ?? 0);
  const name = impressionNameOf(model);
  const set = (d: Draft) => {
    const next = { ...drafts, [entry]: d };
    setDrafts(next);
    const open = nextOpenRider(riders, next, entry);
    if (open) setEntry(open);
  };
  const shown = (r: SheetRider): string => {
    const d = drafts[r.id];
    if (d) return d.missed ? H.sheetAbsent : formatCell(d.value as number);
    return r.now.state === "done" ? formatCell(r.now.value as number) : r.now.state === "absent" ? H.sheetAbsent : H.sheetMissing;
  };
  const changed = Object.entries(drafts).map(([entryId, d]) => ({ entryId, value: d.missed ? null : d.value, missed: d.missed }));
  const complete = riders.every((r) => drafts[r.id] || r.now.state !== "missing");
  const save = (submit: boolean) => run(() => headSaveImpressionSheet({ heatId, seatId, rows: changed, reason, submit }));
  const current = drafts[entry];
  return (
    <Modal screen title={H.sheetTitle(who, name)} onClose={onClose}>
      <ul data-testid="impression-sheet" aria-label={H.sheetTitle(who, name)} className="flex flex-col gap-1">
        {riders.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              data-testid="sheet-rider"
              data-rider={r.id}
              data-state={drafts[r.id] ? (drafts[r.id].missed ? "absent" : "typed") : r.now.state}
              aria-pressed={entry === r.id}
              onClick={() => setEntry(r.id)}
              className={cn(btn, "flex w-full items-center justify-between gap-2", entry === r.id ? "border-beach-accent bg-beach-surface" : "border-beach-border bg-beach-bg")}
            >
              <span className="min-w-0 text-left">{r.word}</span>
              <span className="tabular-nums">{shown(r)}</span>
            </button>
          </li>
        ))}
      </ul>
      <ScorePad key={entry} scale={scale} value={current && !current.missed ? current.value : null} label={H.sheetPadLabel(riders.find((r) => r.id === entry)?.word ?? "", name)} onChange={(v) => set({ value: v, missed: false })} />
      <button type="button" data-testid="mark-impression-absent" disabled={pending} onClick={() => set({ value: null, missed: true })} className={plain}>
        {H.absentImpression}
      </button>
      <Reason value={reason} onChange={setReason} />
      <ErrorLine error={error} />
      {!complete ? <p className="text-small font-medium text-beach-muted">{H.sheetIncomplete}</p> : null}
      <button type="button" data-testid="impression-submit" disabled={pending || !complete} onClick={() => save(true)} className={!pending && complete ? primary : off}>
        {pending ? H.working : H.sheetSaveSubmit(who)}
      </button>
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" data-testid="impression-save" disabled={pending || changed.length === 0} onClick={() => save(false)} className={!pending && changed.length > 0 ? plain : off}>
          {H.sheetSave(changed.length)}
        </button>
        <button type="button" data-testid="dialog-cancel" onClick={onClose} className={plain}>
          {C.cancel}
        </button>
      </div>
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
      <Footer canSave={!pending} saveLabel={pending ? H.working : rows.length === 1 ? C.delete : C.deleteSelected} onCancel={onClose} onSave={() => run(() => deleteAttempts(rows.map((r) => r.attemptId), reason))} />
    </Modal>
  );
}

// ---------------------------------------------------------------- clear a judge's pending note (the way out when the judge's phone is gone)
export function ClearNoteDialog({ noteId, judge, rider, line, onClose, onDone }: { noteId: string; judge: string; rider: string; line: number; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const { error, pending, run } = useRun(onDone);
  return (
    <Modal screen title={copy.live.matrix.clearNoteTitle} onClose={onClose}>
      <p data-testid="clear-note-ask" className="text-body font-semibold">
        {copy.live.matrix.clearNoteAsk(judge, rider, line)}
      </p>
      <Reason value={reason} onChange={setReason} />
      <ErrorLine error={error} />
      <Footer canSave={!pending} saveLabel={pending ? H.working : copy.live.matrix.clearNoteConfirm} onCancel={onClose} onSave={() => run(() => clearPendingByHead(noteId, reason))} />
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
      <Footer canSave={!pending && drops.length > 0} saveLabel={pending ? H.working : C.merge} onCancel={onClose} onSave={() => run(() => mergeAttempts({ keep, drops, choices, reason }))} />
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
        canSave={!pending && changed && trick.trim().length > 0}
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
        canSave={!pending && Boolean(entry) && trick.trim().length > 0 && (!full || (allowed))}
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
        canSave={!pending}
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
      <Footer canSave={!pending && picked.length > 0 && picked.length <= count} saveLabel={pending ? H.working : H.flagOutSave} onCancel={onClose} onSave={() => run(() => flagOutRiders(heatId, picked, reason))} />
    </Modal>
  );
}

