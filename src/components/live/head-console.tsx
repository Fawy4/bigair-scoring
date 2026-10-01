"use client";

import { useMemo, useState } from "react";
import { MoreVertical } from "lucide-react";
import { Chip } from "./chip";
import { Footer, Modal, off, plain, primary, Reason, btn } from "./console-parts";
import { HeadMatrix } from "./head-matrix";
import { Pill } from "./pill";
import { ScorePad } from "./score-pad";
import { RiderLabel } from "@/components/rider-label";
import { outlierTolerance } from "@/lib/live/cell-tone";
import { blockersFor, canMerge, mergeKeepFirst, riderTotal, withCellScore, withRowState, type RiderStatus } from "@/lib/live/console-ops";
import { headConsole, KOTA, type ConsoleRow } from "@/lib/live/design-fixtures";
import { nextHeatState } from "@/lib/live/head-state";
import { formatCell } from "@/lib/live/matrix-model";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const C = copy.live.console;
const H = copy.live.head;
type Menu = { kind: "attempt"; rowId: string } | { kind: "rider"; riderKey: string } | null;
type Dialog =
  | { kind: "cell"; rowId: string; judgeId: string }
  | { kind: "delete"; rowId: string }
  | { kind: "merge"; rowId: string }
  | { kind: "edit"; rowId: string }
  | { kind: "add" }
  | { kind: "status"; riderKey: string; status: Exclude<RiderStatus, null> }
  | { kind: "bulkDelete" }
  | { kind: "bulkMerge" }
  | { kind: "impression" }
  | { kind: "override" }
  | { kind: "rerun" }
  | null;

/**
 * The head judge's laptop console as a working tool (owner, round 3): tap a score to edit it with a reason, tap an attempt for its menu (Delete, Merge
 * duplicate, Edit, Add attempt), tap a rider for theirs (DNS, DNF, DSQ, Interference), see who owes an Impression score, try Publish with its blocker list,
 * Re-open and Re-run heat. Everything is recorded in the audit log on the right. Nothing is saved: the real server functions are built in 5c.
 */
export function HeadConsole() {
  const k = useMemo(() => headConsole(), []);
  const [rows, setRows] = useState<ConsoleRow[]>(k.rows);
  const [impression, setImpression] = useState(k.impression);
  const [status, setStatus] = useState<Record<string, RiderStatus>>({ red: null, blue: null });
  const [heat, setHeat] = useState<"ended" | "published">("ended");
  const [cancelled, setCancelled] = useState(false);
  const [menu, setMenu] = useState<Menu>({ kind: "attempt", rowId: "red-6" });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [audit, setAudit] = useState<string[]>([]);
  const [selection, setSelection] = useState<string[]>([]);

  const picked = rows.filter((r) => selection.includes(r.id) && r.state !== "deleted");
  const blockers = blockersFor(rows, impression, status, k.labels);
  const owes = blockers.length === 0 ? [] : k.owes.filter((o) => impression.blue.some((v) => v === null) && o.rider === "BLUE");
  const rowById = (id: string) => rows.find((r) => r.id === id)!;
  const log = (what: string, why: string) => setAudit((a) => [C.auditLine(what, why), ...a]);
  const close = () => setDialog(null);
  const done = (what: string, why: string) => {
    log(what, why);
    close();
  };
  const patch = (id: string, f: (r: ConsoleRow) => ConsoleRow) => setRows((all) => all.map((r) => (r.id === id ? f(r) : r)));
  const riders = [
    { key: "red", label: k.totals[0].label, word: "RED" },
    { key: "blue", label: k.blueLabel, word: "BLUE" },
  ];
  const totals = riders.map((r) => ({ ...r, total: riderTotal(rows.filter((x) => x.riderKey === r.key), impression[r.key], status[r.key]) }));

  // ---- dialogs (each keeps its own small state)
  function CellDialog({ rowId, judgeId }: { rowId: string; judgeId: string }) {
    const [reason, setReason] = useState("");
    const row = rowById(rowId);
    const cell = row.cells[(k.judgeIds as string[]).indexOf(judgeId)];
    const [value, setValue] = useState<number | null>(null);
    const who = `${copy.live.matrix.judge((k.judgeIds as string[]).indexOf(judgeId) + 1)}`;
    const word = riders.find((r) => r.key === row.riderKey)!.word;
    return (
      <Modal title={C.editScore} onClose={close}>
        <p className="text-body font-medium text-beach-muted">{C.editScoreFor(who, `${word} ${row.seq}`)}</p>
        <ScorePad scale={KOTA.trick.scale} value={value} label={C.newScore} caption={<span>{C.nowScore(cell.label)}</span>} onChange={setValue} />
        <Reason value={reason} onChange={setReason} />
        <Footer
          canSave={value !== null && value !== cell.value && reason.trim().length > 0}
          onSave={() => {
            patch(rowId, (r) => withCellScore(r, judgeId, value as number));
            done(`${who} · ${word} ${row.seq}: ${cell.label} → ${formatCell(value as number)}`, reason.trim());
          }}
          onCancel={close}
        />
      </Modal>
    );
  }
  function ImpressionDialog() {
    const [reason, setReason] = useState("");
    const [value, setValue] = useState<number | null>(null);
    const scale = KOTA.heat.impression!.scale;
    const idx = impression.blue.findIndex((v) => v === null);
    const who = copy.live.matrix.judge(idx + 1);
    return (
      <Modal title={C.enterImpression} onClose={close}>
        <p className="text-body font-medium text-beach-muted">{`${who} · BLUE`}</p>
        <ScorePad scale={scale} value={value} label={copy.live.impression.heading} onChange={setValue} />
        <Reason value={reason} onChange={setReason} />
        <Footer
          canSave={value !== null && reason.trim().length > 0}
          onSave={() => {
            setImpression((m) => ({ ...m, blue: m.blue.map((v, i) => (i === idx ? value : v)) }));
            done(`${who} · BLUE · ${copy.live.impression.heading}: ${formatCell(value as number)}`, reason.trim());
          }}
          onCancel={close}
        />
      </Modal>
    );
  }
  function SimpleDialog({ title, apply, what, text, saveLabel }: { title: string; apply: () => void; what: string; text?: React.ReactNode; saveLabel?: string }) {
    const [reason, setReason] = useState("");
    return (
      <Modal title={title} onClose={close}>
        {text}
        <Reason value={reason} onChange={setReason} />
        <Footer canSave={reason.trim().length > 0} onSave={() => { apply(); done(what, reason.trim()); }} onCancel={close} saveLabel={saveLabel ?? title} />
      </Modal>
    );
  }
  function MergeDialog({ rowId }: { rowId: string }) {
    const [reason, setReason] = useState("");
    const dup = rowById(rowId);
    const first = rowById("red-2");
    const [keep, setKeep] = useState<"first" | "second">("first");
    const line = (r: ConsoleRow) => `${r.seq}. ${r.trick} — ${r.cells.map((c) => c.label).join(" / ")} → ${r.panelLabel}`;
    return (
      <Modal title={C.mergeTitle} onClose={close}>
        {(["first", "second"] as const).map((o) => (
          <label key={o} className="flex min-h-tap items-center gap-2 rounded-xl border border-beach-line bg-beach-surface px-2 text-body font-medium">
            <input type="radio" name="keep" checked={keep === o} onChange={() => setKeep(o)} className="size-5 accent-[var(--beach-accent)]" />
            <span>
              <span className="font-semibold">{C.mergeKeep}: </span>
              {line(o === "first" ? first : dup)}
            </span>
          </label>
        ))}
        <Reason value={reason} onChange={setReason} />
        <Footer
          canSave={reason.trim().length > 0}
          onSave={() => {
            patch(keep === "first" ? dup.id : first.id, (r) => withRowState(r, "deleted"));
            patch(keep === "first" ? first.id : dup.id, (r) => withRowState(r, "ok"));
            done(`${C.merge}: ${keep === "first" ? first.seq : dup.seq}`, reason.trim());
          }}
          onCancel={close}
          saveLabel={C.merge}
        />
      </Modal>
    );
  }
  function EditDialog({ rowId }: { rowId: string | null }) {
    const [reason, setReason] = useState("");
    const row = rowId ? rowById(rowId) : null;
    const [rider, setRider] = useState(row?.riderKey ?? "red");
    const [trick, setTrick] = useState(row?.trick ?? "");
    const [crashed, setCrashed] = useState(row?.status === "crashed");
    const title = row ? C.editTitle : C.addTitle;
    return (
      <Modal title={title} onClose={close}>
        <label className="flex flex-col gap-0.5 text-small font-medium text-beach-muted">
          {C.rider}
          <select data-testid="edit-rider" value={rider} onChange={(e) => setRider(e.target.value)} className="min-h-tap rounded-xl border border-beach-border bg-beach-bg px-2 text-body font-medium text-beach-ink">
            {riders.map((r) => (
              <option key={r.key} value={r.key}>
                {r.word}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-small font-medium text-beach-muted">
          {C.trick}
          <input data-testid="edit-trick" value={trick} onChange={(e) => setTrick(e.target.value)} className="min-h-tap rounded-xl border border-beach-border bg-beach-bg px-2 text-body font-medium text-beach-ink" />
        </label>
        <div role="group" className="grid grid-cols-2 gap-1.5">
          {([false, true] as const).map((c) => (
            <button key={String(c)} type="button" aria-pressed={crashed === c} onClick={() => setCrashed(c)} className={cn(btn, crashed === c ? "border-beach-accent bg-beach-accent text-beach-on-accent" : "border-beach-border bg-beach-bg text-beach-ink")}>
              {c ? C.crashed : C.landed}
            </button>
          ))}
        </div>
        <Reason value={reason} onChange={setReason} />
        <Footer
          canSave={reason.trim().length > 0 && trick.trim().length > 0}
          onSave={() => {
            const label = riders.find((r) => r.key === rider)!.label;
            const cells = (r: ConsoleRow) =>
              r.cells.map((c) => (crashed ? { ...c, state: "crash" as const, value: null, label: "—" } : { ...c, state: c.state === "crash" ? ("missing" as const) : c.state }));
            if (row) patch(row.id, (r) => ({ ...r, riderKey: rider, label, trick: trick.trim(), status: crashed ? "crashed" : "landed", cells: cells(r), panel: crashed ? null : r.panel, panelLabel: crashed ? "—" : r.panelLabel, panelState: crashed ? "none" : r.panelState }));
            else {
              const seq = rows.filter((r) => r.riderKey === rider).length + 1;
              const blank = k.judgeIds.map((judgeId) => ({ judgeId, state: crashed ? ("crash" as const) : ("missing" as const), value: null, label: "—" }));
              setRows((all) => [...all, { id: `new-${all.length}`, riderKey: rider, seq, label, trick: trick.trim(), status: crashed ? "crashed" : "landed", state: "ok", cells: blank, panel: null, panelLabel: "—", panelState: crashed ? "none" : "incomplete" }]);
            }
            done(`${title}: ${riders.find((r) => r.key === rider)!.word} — ${trick.trim()}`, reason.trim());
          }}
          onCancel={close}
        />
      </Modal>
    );
  }
  function RerunDialog() {
    const [reason, setReason] = useState("");
    const [out, setOut] = useState<Record<string, "" | "DSQ" | "DNS">>({ red: "", blue: "" });
    return (
      <Modal title={C.rerunTitle} onClose={close}>
        <p className="text-body font-medium text-beach-muted">{C.rerunNote}</p>
        <p className="text-small font-semibold text-beach-muted">{C.rerunLeftOut}</p>
        {riders.map((r) => (
          <label key={r.key} className="flex items-center justify-between gap-2 text-body font-medium">
            <span>{r.word}</span>
            <select value={out[r.key]} onChange={(e) => setOut((o) => ({ ...o, [r.key]: e.target.value as "" | "DSQ" | "DNS" }))} className="min-h-tap rounded-xl border border-beach-border bg-beach-bg px-2 text-body font-medium text-beach-ink">
              <option value="">{C.ridesAgain}</option>
              <option value="DSQ">{C.dsq}</option>
              <option value="DNS">{C.dns}</option>
            </select>
          </label>
        ))}
        <Reason value={reason} onChange={setReason} />
        <Footer
          canSave={reason.trim().length > 0}
          onSave={() => {
            setCancelled(true);
            done(`${C.rerun}: ${Object.entries(out).filter(([, v]) => v).map(([r, v]) => `${r.toUpperCase()} ${v}`).join(", ") || "all ride again"}`, reason.trim());
          }}
          onCancel={close}
          saveLabel={C.rerun}
        />
      </Modal>
    );
  }

  const menuRow = menu?.kind === "attempt" ? rowById(menu.rowId) : null;
  const items: Array<[string, () => void, boolean]> = menu?.kind === "attempt" && menuRow
    ? [
        [C.delete, () => setDialog({ kind: "delete", rowId: menuRow.id }), true],
        [C.merge, () => setDialog({ kind: "merge", rowId: menuRow.id }), menuRow.state === "duplicate"],
        [C.edit, () => setDialog({ kind: "edit", rowId: menuRow.id }), true],
        [C.add, () => setDialog({ kind: "add" }), true],
      ]
    : [
        [C.dns, () => setDialog({ kind: "status", riderKey: (menu as { riderKey: string })?.riderKey, status: "DNS" }), true],
        [C.dnf, () => setDialog({ kind: "status", riderKey: (menu as { riderKey: string })?.riderKey, status: "DNF" }), true],
        [C.dsq, () => setDialog({ kind: "status", riderKey: (menu as { riderKey: string })?.riderKey, status: "DSQ" }), true],
        [C.interference, () => setDialog({ kind: "status", riderKey: (menu as { riderKey: string })?.riderKey, status: "INT" }), true],
      ];

  return (
    <div data-testid="head-console" data-heat={heat} className="relative flex min-w-[52rem] flex-col gap-2 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-name font-semibold">{k.heatName}</p>
        <Pill tone={heat === "published" ? "live" : "outlier"}>{cancelled ? "Cancelled" : heat === "published" ? C.published : H.stateWord.ended}</Pill>
        <span className="ml-auto flex flex-wrap gap-1.5">
          <button type="button" data-testid="publish" disabled={heat === "published" || cancelled || blockers.length > 0} onClick={() => setHeat(nextHeatState("ended", "publish") === "published" ? "published" : "ended")} className={heat === "ended" && !cancelled && blockers.length === 0 ? primary : off}>
            {C.publish}
          </button>
          {heat === "ended" && blockers.length > 0 && !cancelled ? (
            <button type="button" data-testid="publish-anyway" onClick={() => setDialog({ kind: "override" })} className={plain}>
              {C.publishAnyway}
            </button>
          ) : null}
          <button type="button" data-testid="reopen" disabled={heat !== "published"} onClick={() => { setHeat("ended"); log(C.reopen, "—"); }} className={heat === "published" ? plain : off}>
            {C.reopen}
          </button>
          <button type="button" data-testid="rerun" disabled={heat === "published" || cancelled} onClick={() => setDialog({ kind: "rerun" })} className={heat === "published" || cancelled ? off : plain}>
            {C.rerun}
          </button>
        </span>
      </div>
      {cancelled ? <p className="rounded-xl border border-beach-crash bg-beach-tint-crash px-2 py-1 text-body font-semibold">{`Cancelled — re-run as ${k.heatName.replace("Heat 3", "Heat 3 re-run")}`}</p> : null}

      {menu ? (
        <div role="menu" data-testid={menu.kind === "attempt" ? "attempt-menu" : "rider-menu"} className="flex flex-wrap items-center gap-1.5 rounded-card border border-beach-border bg-beach-surface p-1.5">
          <span className="text-small font-semibold text-beach-muted">{menu.kind === "attempt" ? `${C.attemptMenu}: ${riders.find((r) => r.key === menuRow?.riderKey)?.word} ${menuRow?.seq}` : `${C.riderMenu}: ${riders.find((r) => r.key === (menu as { riderKey: string }).riderKey)?.word}`}</span>
          {items.map(([label, run, enabled]) => (
            <button key={label} type="button" role="menuitem" disabled={!enabled} onClick={run} className={enabled ? plain : off}>
              {label}
            </button>
          ))}
          <button type="button" onClick={() => setMenu(null)} className={plain}>
            {copy.common.close}
          </button>
        </div>
      ) : (
        <p className="text-small font-medium text-beach-muted">{C.tap}</p>
      )}

      {picked.length > 0 ? (
        <div data-testid="selection-bar" className="flex flex-wrap items-center gap-1.5 rounded-card border border-beach-accent bg-beach-surface p-1.5">
          <span className="text-body font-semibold">{C.selected(picked.length)}</span>
          <Chip data-testid="merge-selected" variant={canMerge(picked) ? "accent" : "muted"} disabled={!canMerge(picked)} onClick={() => setDialog({ kind: "bulkMerge" })}>
            {C.mergeSelected}
          </Chip>
          <Chip data-testid="delete-selected" onClick={() => setDialog({ kind: "bulkDelete" })}>
            {C.deleteSelected}
          </Chip>
          <Chip onClick={() => setSelection([])}>{C.clearSelection}</Chip>
        </div>
      ) : null}
      <p className="text-small font-medium text-beach-muted">{C.toleranceNote(String(outlierTolerance(KOTA)))}</p>
      <div className="grid grid-cols-[minmax(0,1fr)_13.5rem] items-start gap-2">
        <HeadMatrix
          model={{ judgeIds: k.judgeIds, rows }}
          actions={{
            onCell: (r, judgeId) => setDialog({ kind: "cell", rowId: r.id, judgeId }),
            onAttempt: (r) => setMenu({ kind: "attempt", rowId: r.id }),
            onRider: (r) => setMenu({ kind: "rider", riderKey: (r as ConsoleRow).riderKey }),
            selected: selection,
            onSelect: (r) => setSelection((all) => (all.includes(r.id) ? all.filter((x) => x !== r.id) : [...all, r.id])),
          }}
        />
        <aside className="flex flex-col gap-2">
          <section className="flex flex-col gap-1 rounded-card border border-beach-line bg-beach-surface p-2" aria-label={C.totals}>
            <h3 className="text-heading font-semibold text-beach-muted">{C.totals}</h3>
            {totals.map((t) => (
              <div key={t.key} data-testid="console-total" data-rider={t.key} className="flex items-center justify-between gap-2">
                <button type="button" aria-label={`${t.word}: ${C.riderMenu}`} onClick={() => setMenu({ kind: "rider", riderKey: t.key })} className="flex min-h-tap min-w-0 items-center gap-1 rounded-lg text-left">
                  <RiderLabel model={t.label} variant="live" bare />
                  <MoreVertical aria-hidden className="size-4 shrink-0 text-beach-muted" />
                </button>
                <span className="flex flex-col items-end">
                  <span className="text-name font-semibold tabular-nums">{t.total.label}</span>
                  {status[t.key] ? <Pill tone="outlier">{status[t.key]}</Pill> : null}
                </span>
              </div>
            ))}
          </section>
          <div data-testid="owes" className="flex flex-col gap-1 rounded-xl border border-beach-line bg-beach-bg px-2 py-1 text-body font-medium">
            <span>{owes.length ? owes.map((o) => C.owes(o.judge, o.rider)).join(" · ") : C.noneOwed}</span>
            {owes.length ? (
              <button type="button" data-testid="enter-impression" onClick={() => setDialog({ kind: "impression" })} className={plain}>
                {C.enterImpression}
              </button>
            ) : null}
          </div>
          <section data-testid="blockers" className="flex flex-col gap-1 rounded-card border border-beach-line bg-beach-surface p-2" aria-label={C.publishBlocked}>
            <h3 className="text-heading font-semibold text-beach-muted">{blockers.length ? C.publishBlocked : H.noBlockers}</h3>
            {blockers.map((b) => (
              <p key={b} className="rounded-lg border border-beach-outlier bg-beach-bg px-2 py-0.5 text-body font-medium">
                {b}
              </p>
            ))}
          </section>
          <section data-testid="audit" className="flex flex-col gap-1 rounded-card border border-beach-line bg-beach-surface p-2" aria-label={C.audit}>
            <h3 className="text-heading font-semibold text-beach-muted">{C.audit}</h3>
            {audit.length ? audit.map((a, i) => <p key={i} className="text-small font-medium">{a}</p>) : <p className="text-small font-medium text-beach-muted">{C.auditEmpty}</p>}
          </section>
        </aside>
      </div>

      {dialog?.kind === "cell" ? <CellDialog key={`${dialog.rowId}${dialog.judgeId}`} rowId={dialog.rowId} judgeId={dialog.judgeId} /> : null}
      {dialog?.kind === "delete" ? (
        <SimpleDialog title={C.delete} what={`${C.delete}: ${riders.find((r) => r.key === rowById(dialog.rowId).riderKey)?.word} ${rowById(dialog.rowId).seq}`} apply={() => patch(dialog.rowId, (r) => withRowState(r, "deleted"))} text={<p className="text-body font-semibold">{C.confirmDelete}</p>} />
      ) : null}
      {dialog?.kind === "merge" ? <MergeDialog rowId={dialog.rowId} /> : null}
      {dialog?.kind === "edit" ? <EditDialog key={dialog.rowId} rowId={dialog.rowId} /> : null}
      {dialog?.kind === "add" ? <EditDialog key="add" rowId={null} /> : null}
      {dialog?.kind === "status" ? (
        <SimpleDialog title={C.statusSet(dialog.status)} what={`${riders.find((r) => r.key === dialog.riderKey)?.word}: ${dialog.status}`} apply={() => setStatus((s) => ({ ...s, [dialog.riderKey]: dialog.status }))} />
      ) : null}
      {dialog?.kind === "override" ? (
        <SimpleDialog
          title={C.publishAnyway}
          what={`${C.publish}: ${blockers.join("; ")}`}
          apply={() => setHeat("published")}
          text={
            <ul className="flex flex-col gap-1">
              {blockers.map((b) => (
                <li key={b} className="rounded-lg border border-beach-outlier px-2 py-0.5 text-body font-medium">
                  {b}
                </li>
              ))}
            </ul>
          }
        />
      ) : null}
      {dialog?.kind === "bulkDelete" ? (
        <SimpleDialog
          title={C.deleteSelectedTitle(picked.length)}
          saveLabel={C.deleteSelected}
          what={`${C.delete}: ${picked.map((r) => `${r.label.primary.text} ${r.seq}`).join(", ")}`}
          apply={() => {
            const ids = picked.map((r) => r.id);
            setRows((all) => all.map((r) => (ids.includes(r.id) ? withRowState(r, "deleted") : r)));
            setSelection([]);
          }}
        />
      ) : null}
      {dialog?.kind === "bulkMerge" ? (
        <SimpleDialog
          title={C.merge}
          what={`${C.merge}: ${picked.map((r) => `${r.label.primary.text} ${r.seq}`).join(" + ")}`}
          text={<p className="text-body font-medium">{C.mergeSelectedNote}</p>}
          apply={() => {
            setRows((all) => mergeKeepFirst(all, picked.map((r) => r.id)));
            setSelection([]);
          }}
        />
      ) : null}
      {dialog?.kind === "impression" ? <ImpressionDialog /> : null}
      {dialog?.kind === "rerun" ? <RerunDialog /> : null}
    </div>
  );
}
