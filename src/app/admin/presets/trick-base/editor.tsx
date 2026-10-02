"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical, Lock, X } from "lucide-react";
import { Button, disabledWhen } from "@/components/org/button";
import { HelpTip } from "@/components/org/help-tip";
import { OrgCard } from "@/components/org/org-card";
import { StatusPill } from "@/components/org/status-pill";
import { toast } from "@/hooks/use-toast";
import type { VocabularyJson } from "@/lib/trick-base";
import {
  addAlias,
  addBlock,
  addFamily,
  diffModels,
  familyOfBlock,
  liveExample,
  moveBlock,
  nudgeBlock,
  nudgeCategory,
  nudgeFamily,
  removeAlias,
  removeBlock,
  removeFamily,
  renameBlock,
  checkModel,
  renameFamily,
  setBlockField,
  setKey,
  toModel,
  toVocabulary,
  validateModel,
  type MasterBlock,
  type MasterFamily,
  type MasterModel,
  type Rotation,
} from "@/lib/trick-base/master";
import { copy } from "@/lib/ui-copy";
import { acceptTrickProposal, dismissTrickProposal, publishMasterTrickBase, saveMasterTrickBase } from "./actions";

const C = copy.trickEditor;
const catLabel = (c: string) => copy.trickBase.categoryLabels[c] ?? c;
const isFixed = (f: string) => f === "direction" || f === "multiplier";

export interface HistoryRow {
  id: string;
  version: number;
  published: boolean;
  isLive: boolean;
  saved: string;
  publishedText: string;
  summary: string;
}
export interface ProposalRow {
  eventId: string;
  eventName: string;
  organisationName: string;
  family: string;
  key: string;
  label: string;
  category: string | null;
}

/** Aliases as chips: type one, Enter adds it; × takes it away. */
function AliasChips({ block, readOnly, onAdd, onRemove }: { block: { id: string; label: string; aliases: string[] }; readOnly: boolean; onAdd: (a: string) => void; onRemove: (a: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-1" data-testid={`aliases-${block.id}`}>
      {block.aliases.map((a) => (
        <span key={a} className="inline-flex items-center gap-1 rounded-full border border-beach-line bg-beach-surface px-2 py-0.5 text-small font-semibold" data-testid={`alias-${block.id}-${a}`}>
          {a}
          {readOnly ? null : (
            <button type="button" aria-label={C.removeAlias(a, block.label)} className="inline-flex size-6 items-center justify-center" onClick={() => onRemove(a)}>
              <X aria-hidden className="size-3" />
            </button>
          )}
        </span>
      ))}
      {readOnly ? null : (
        <input
          aria-label={C.aliasInput(block.label)}
          data-testid={`alias-input-${block.id}`}
          placeholder={C.aliasPlaceholder}
          value={text}
          maxLength={60}
          className="w-40"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              if (text.trim()) onAdd(text);
              setText("");
            }
          }}
          onBlur={() => {
            if (text.trim()) onAdd(text);
            setText("");
          }}
        />
      )}
    </div>
  );
}

function BlockRow({
  block,
  family,
  model,
  locked,
  readOnly,
  onChange,
}: {
  block: MasterBlock;
  family: MasterFamily;
  model: MasterModel;
  /** True once the block was in a published version: its key is fixed and it can only be retired. */
  locked: boolean;
  readOnly: boolean;
  onChange: (next: MasterModel) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id, disabled: readOnly });
  const id = block.id;
  const fixed = isFixed(block.home);
  const off = readOnly || block.retired;
  const [keyText, setKeyText] = useState(block.key);
  const keyClash = keyText !== block.key && Boolean(model.blocks[`${block.home}:${keyText}`]);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      data-testid={`row-${id}`}
      data-retired={block.retired ? "true" : undefined}
      className={`flex flex-col gap-2 rounded-[8px] border border-beach-line p-2 ${block.retired ? "border-dashed bg-beach-surface" : "bg-beach-bg"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {readOnly ? null : <Button variant="quiet" iconOnly icon={GripVertical} className="cursor-grab" aria-label={C.drag(block.label)} data-testid={`drag-${id}`} {...attributes} {...listeners} />}
        <input aria-label={C.labelOf(block.label || block.key)} data-testid={`label-${id}`} value={block.label} maxLength={40} disabled={off} className="w-48 font-semibold" onChange={(e) => onChange(renameBlock(model, id, e.target.value))} />
        {locked ? (
          <span className="inline-flex items-center gap-1 text-small font-semibold text-beach-muted" data-testid={`key-${id}`} title={C.keyLocked}>
            <Lock aria-hidden className="size-3" />
            {block.key}
          </span>
        ) : (
          <span className="inline-flex flex-col">
            <input
              aria-label={C.keyOf(block.label || block.key)}
              data-testid={`key-${id}`}
              value={keyText}
              maxLength={80}
              disabled={off}
              className="w-40 font-mono text-small"
              onChange={(e) => setKeyText(e.target.value.toLowerCase())}
              onBlur={() => {
                if (!keyClash && keyText && keyText !== block.key) onChange(setKey(model, id, keyText));
              }}
            />
            {keyClash ? <span className="field-error text-small">{C.errors.duplicateKey(keyText, model.blocks[`${block.home}:${keyText}`]!.label, block.label)}</span> : null}
          </span>
        )}
        {block.retired ? <span className="rounded-full border border-dashed border-beach-border px-2 text-small font-semibold">{C.retiredTag}</span> : null}
        <span className="ml-auto flex flex-wrap items-center gap-1">
          {readOnly ? null : (
            <>
              <Button variant="quiet" iconOnly icon={ArrowUp} aria-label={C.up(block.label)} data-testid={`up-${id}`} onClick={() => onChange(nudgeBlock(model, id, -1))} />
              <Button variant="quiet" iconOnly icon={ArrowDown} aria-label={C.down(block.label)} data-testid={`down-${id}`} onClick={() => onChange(nudgeBlock(model, id, 1))} />
              {fixed ? null : (
                <select aria-label={C.moveTo(block.label)} data-testid={`moveto-${id}`} value="" onChange={(e) => e.target.value && onChange(moveBlock(model, id, e.target.value, 9999))}>
                  <option value="">{C.moveToChoose}</option>
                  {model.families
                    .filter((f) => !isFixed(f.key) && f.key !== family.key)
                    .map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                </select>
              )}
              {locked ? (
                block.retired ? (
                  <Button data-testid={`restore-${id}`} onClick={() => onChange(setBlockField(model, id, { retired: false }))}>
                    {C.restore}
                  </Button>
                ) : (
                  <Button data-testid={`retire-${id}`} onClick={() => onChange(setBlockField(model, id, { retired: true }))}>
                    {C.retire}
                  </Button>
                )
              ) : (
                <Button variant="quiet" data-testid={`remove-${id}`} onClick={() => onChange(removeBlock(model, id))}>
                  {C.remove}
                </Button>
              )}
            </>
          )}
        </span>
      </div>
      <AliasChips block={block} readOnly={off} onAdd={(a) => onChange(addAlias(model, id, a))} onRemove={(a) => onChange(removeAlias(model, id, a))} />
      <div className="flex flex-wrap items-center gap-3 text-small">
        {fixed ? null : (
          <label className="inline-flex items-center gap-1 font-semibold">
            {C.category}
            <select data-testid={`category-${id}`} value={block.category ?? ""} disabled={off} onChange={(e) => onChange(setBlockField(model, id, { category: e.target.value || null }))}>
              {block.home === "base" ? null : <option value="">{C.noCategory}</option>}
              {block.category && !model.categoryPrecedence.includes(block.category) ? <option value={block.category}>{block.category}</option> : null}
              {model.categoryPrecedence.map((c) => (
                <option key={c} value={c}>
                  {catLabel(c)}
                </option>
              ))}
            </select>
          </label>
        )}
        {fixed ? null : (
          <label className="inline-flex items-center gap-1 font-semibold" title={block.home === "base" ? C.baseTakesMultiplier : undefined}>
            <input type="checkbox" data-testid={`takes-${id}`} checked={block.takesMultiplier} disabled={off || block.home === "base"} onChange={(e) => onChange(setBlockField(model, id, { takesMultiplier: e.target.checked }))} />
            {C.takesMultiplier}
          </label>
        )}
        {fixed ? null : (
          <label className="inline-flex items-center gap-1 font-semibold">
            {C.rotation}
            <select data-testid={`rotation-${id}`} value={block.rotation} disabled={off} onChange={(e) => onChange(setBlockField(model, id, { rotation: e.target.value as Rotation }))}>
              {(["none", "backward", "forward"] as const).map((r) => (
                <option key={r} value={r}>
                  {C.rotations[r]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="inline-flex items-center gap-1 font-semibold">
          <input type="checkbox" data-testid={`default-on-${id}`} checked={block.defaultOn} disabled={off} onChange={(e) => onChange(setBlockField(model, id, { defaultOn: e.target.checked }))} />
          {C.defaultOn}
        </label>
        {block.home !== family.key && !isFixed(family.key) ? <span className="text-beach-muted">{C.storedAs(copy.trickBase.families[block.home as keyof typeof copy.trickBase.families])}</span> : null}
      </div>
    </li>
  );
}

function FamilyDrop({ family, children }: { family: MasterFamily; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: `family:${family.key}` });
  return (
    <SortableContext items={family.blocks} strategy={verticalListSortingStrategy}>
      <ul ref={setNodeRef} className="flex min-h-[48px] flex-col gap-2" data-testid={`list-${family.key}`}>
        {children}
      </ul>
    </SortableContext>
  );
}

function FamilyCard({ family, index, model, locked, readOnly, onChange }: { family: MasterFamily; index: number; model: MasterModel; locked: Set<string>; readOnly: boolean; onChange: (m: MasterModel) => void }) {
  const [label, setLabel] = useState("");
  const shown = family.blocks.map((id) => model.blocks[id]).filter(Boolean);
  const live = shown.filter((b) => !b.retired).length;
  return (
    <OrgCard
      title={family.label || C.unnamedFamily}
      testId={`family-card-${family.key}`}
      actions={
        readOnly ? undefined : (
          <span className="flex flex-wrap items-center gap-1">
            <input aria-label={C.familyName(family.label)} data-testid={`family-name-${family.key}`} value={family.label} maxLength={40} className="w-44" onChange={(e) => onChange(renameFamily(model, family.key, e.target.value))} />
            <Button variant="quiet" iconOnly icon={ArrowUp} aria-label={C.familyUp(family.label)} data-testid={`family-up-${family.key}`} {...disabledWhen(index === 0 && C.alreadyFirst)} onClick={() => onChange(nudgeFamily(model, family.key, -1))} />
            <Button variant="quiet" iconOnly icon={ArrowDown} aria-label={C.familyDown(family.label)} data-testid={`family-down-${family.key}`} {...disabledWhen(index === model.families.length - 1 && C.alreadyLast)} onClick={() => onChange(nudgeFamily(model, family.key, 1))} />
            {!family.builtIn && shown.length === 0 ? (
              <Button variant="quiet" data-testid={`family-remove-${family.key}`} onClick={() => onChange(removeFamily(model, family.key))}>
                {C.removeFamily}
              </Button>
            ) : null}
          </span>
        )
      }
    >
      <p className="mb-2 text-small font-semibold text-beach-muted">{C.familyCount(live, shown.length - live)}</p>
      <FamilyDrop family={family}>
        {shown.map((b) => (
          <BlockRow key={b.id} block={b} family={family} model={model} locked={locked.has(b.id)} readOnly={readOnly} onChange={onChange} />
        ))}
      </FamilyDrop>
      {readOnly || isFixed(family.key) ? null : (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!label.trim()) return;
            onChange(addBlock(model, family.key, label).model);
            setLabel("");
          }}
        >
          <input aria-label={C.newBlockName(family.label)} data-testid={`add-block-name-${family.key}`} value={label} maxLength={40} placeholder={C.newBlockPlaceholder} onChange={(e) => setLabel(e.target.value)} className="w-56" />
          <Button type="submit" data-testid={`add-block-${family.key}`} {...disabledWhen(!label.trim() && C.typeAName)}>
            {C.addBlock}
          </Button>
        </form>
      )}
    </OrgCard>
  );
}

function ProposalItem({ p, model, isOwner, dirty, baseVersion }: { p: ProposalRow; model: MasterModel; isOwner: boolean; dirty: boolean; baseVersion: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "accept" | "dismiss">("idle");
  const [label, setLabel] = useState(p.label);
  const [aliases, setAliases] = useState<string[]>([]);
  const [shownIn, setShownIn] = useState(p.family);
  const [category, setCategory] = useState(p.category ?? (p.family === "base" ? (model.categoryPrecedence.at(-1) ?? "") : ""));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fixed = isFixed(p.family);
  const choices = model.families.filter((f) => (fixed ? f.key === p.family : !isFixed(f.key)));
  const P = C.proposals;
  const familyName = model.families.find((f) => f.key === p.family)?.label ?? p.family;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.ok) {
        toast({ title: done });
        router.refresh();
      } else setError(r.error ?? null);
    });

  return (
    <li className="flex flex-col gap-2 rounded-[8px] border border-beach-line p-3" data-testid="proposal">
      <p className="font-semibold">
        {p.label} · {familyName} · {p.eventName} · {p.organisationName}
      </p>
      {error ? (
        <p role="alert" className="field-error">
          {error}
        </p>
      ) : null}
      {!isOwner ? (
        <p className="text-small font-semibold">{P.ownerOnly}</p>
      ) : mode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          <Button data-testid="proposal-accept" {...disabledWhen(dirty && P.saveFirst)} onClick={() => setMode("accept")}>
            {P.accept}
          </Button>
          <Button variant="quiet" data-testid="proposal-dismiss" onClick={() => setMode("dismiss")}>
            {P.dismiss}
          </Button>
        </div>
      ) : mode === "accept" ? (
        <div className="flex flex-col gap-2" role="group" aria-label={P.accept}>
          <label className="flex flex-col gap-1 font-semibold">
            {P.name}
            <input value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} className="w-64" data-testid="proposal-label" />
          </label>
          <div className="flex flex-col gap-1">
            <span className="font-semibold">{P.aliases}</span>
            <AliasChips block={{ id: `proposal-${p.key}`, label, aliases }} readOnly={false} onAdd={(a) => setAliases((xs) => (xs.some((x) => x.toLowerCase() === a.trim().toLowerCase()) ? xs : [...xs, a.trim()]))} onRemove={(a) => setAliases((xs) => xs.filter((x) => x !== a))} />
          </div>
          <label className="flex flex-col gap-1 font-semibold">
            {P.family}
            <select value={shownIn} onChange={(e) => setShownIn(e.target.value)} data-testid="proposal-family" className="w-64">
              {choices.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          {fixed ? null : (
            <label className="flex flex-col gap-1 font-semibold">
              {C.category}
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-64">
                {p.family === "base" ? null : <option value="">{C.noCategory}</option>}
                {model.categoryPrecedence.map((c) => (
                  <option key={c} value={c}>
                    {catLabel(c)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              data-testid="proposal-accept-confirm"
              {...disabledWhen((pending && C.working) || (!label.trim() && C.typeAName))}
              onClick={() => run(() => acceptTrickProposal({ eventId: p.eventId, family: p.family, key: p.key, label, aliases, shownIn, category: category || null, baseVersion }), P.accepted(label))}
            >
              {P.acceptInto(model.families.find((f) => f.key === shownIn)?.label ?? "")}
            </Button>
            <Button variant="quiet" onClick={() => setMode("idle")}>
              {copy.common.cancel}
            </Button>
          </div>
          <p className="text-small font-semibold">{P.acceptNote}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2" role="group" aria-label={P.dismiss}>
          <label className="flex flex-col gap-1 font-semibold">
            {P.reason}
            <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} className="w-full max-w-xl" data-testid="proposal-reason" placeholder={P.reasonPlaceholder} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" data-testid="proposal-dismiss-confirm" {...disabledWhen((pending && C.working) || (!reason.trim() && P.reasonNeeded))} onClick={() => run(() => dismissTrickProposal({ eventId: p.eventId, family: p.family, key: p.key, reason }), P.dismissed)}>
              {P.dismissConfirm}
            </Button>
            <Button variant="quiet" onClick={() => setMode("idle")}>
              {copy.common.cancel}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * The master trick base without JSON (docs/08 §1I): one card per family with its blocks as rows; category precedence; naming; every save is a new draft
 * version; "Publish to all customers" shows the diff in words first; proposals from events on top; the JSON under an Advanced fold.
 */
export function TrickBaseEditor({
  isOwner,
  working,
  live,
  viewing,
  publishedIdList,
  history,
  proposals,
}: {
  isOwner: boolean;
  working: { id: string; version: number; json: VocabularyJson; published: boolean };
  live: { version: number; json: VocabularyJson } | null;
  viewing: { version: number; json: VocabularyJson } | null;
  publishedIdList: string[];
  history: HistoryRow[];
  proposals: ProposalRow[];
}) {
  const router = useRouter();
  const start0 = useMemo(() => toModel(viewing?.json ?? working.json), [viewing, working.json]);
  const base = useMemo(() => toModel(working.json), [working.json]);
  const [model, setModel] = useState<MasterModel>(start0);
  const [errors, setErrors] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [familyLabel, setFamilyLabel] = useState("");
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const readOnly = !isOwner || Boolean(viewing);
  const locked = useMemo(() => new Set(publishedIdList), [publishedIdList]);
  const dirty = useMemo(() => !viewing && JSON.stringify(toVocabulary(model)) !== JSON.stringify(toVocabulary(base)), [model, base, viewing]);
  const example = useMemo(() => liveExample(model), [model]);
  const warnings = useMemo(() => (readOnly ? [] : checkModel(model, locked, base).warnings), [model, locked, base, readOnly]);
  const liveModel = useMemo(() => (live ? toModel(live.json) : null), [live]);
  const publishDiff = useMemo(() => (liveModel ? diffModels(liveModel, base) : null), [liveModel, base]);
  const canPublish = isOwner && !viewing && !working.published && !dirty && (!live || working.version > live.version);
  const multipliers = model.families.find((f) => f.key === "multiplier")?.blocks.map((id) => model.blocks[id]).filter(Boolean) ?? [];

  const change = (next: MasterModel) => {
    setModel(next);
    if (errors.length) setErrors(validateModel(next, locked, base));
  };

  function save() {
    const found = validateModel(model, locked, base);
    setErrors(found);
    if (found.length) return;
    start(async () => {
      const r = await saveMasterTrickBase({ json: toVocabulary(model), baseVersion: working.version });
      if (!r.ok) {
        setErrors(r.errors ?? [r.error]);
        return;
      }
      toast({ title: r.created ? C.savedDraft(r.version) : C.nothingToSave });
      router.refresh();
    });
  }

  function publish() {
    start(async () => {
      const r = await publishMasterTrickBase({ id: working.id });
      if (!r.ok) {
        setErrors([r.error]);
        return;
      }
      setPublishing(false);
      toast({ title: C.publishedDone(r.version) });
      router.refresh();
    });
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || readOnly) return;
    const activeId = String(e.active.id);
    const overId = String(e.over.id);
    if (activeId === overId) return;
    let target: string;
    let index: number;
    if (overId.startsWith("family:")) {
      target = overId.slice(7);
      index = model.families.find((f) => f.key === target)?.blocks.length ?? 0;
    } else {
      const fam = familyOfBlock(model, overId);
      if (!fam) return;
      target = fam.key;
      index = fam.blocks.indexOf(overId);
    }
    change(moveBlock(model, activeId, target, index));
  }

  const status = viewing ? C.viewingLine(viewing.version) : working.published ? C.workingPublished(working.version) : C.workingDraft(working.version);

  return (
    <div className="flex flex-col gap-5" data-testid="trick-editor">
      <div className="flex flex-col gap-2">
        <h1>{C.heading}</h1>
        <p className="max-w-[80ch] text-body font-medium text-beach-muted">{C.intro}</p>
        <p className="flex flex-wrap items-center gap-2 font-semibold" data-testid="editor-status">
          <StatusPill state={viewing || working.published ? "published" : "draft"} />
          {status}
          {live ? ` · ${C.liveLine(live.version)}` : ` · ${C.noLive}`}
        </p>
        {viewing ? (
          <p>
            <Link href="/admin/presets/trick-base" className="font-semibold underline" data-testid="back-to-draft">
              {C.backToWorking}
            </Link>
          </p>
        ) : null}
        {!isOwner ? <p className="panel font-semibold">{C.staffNote}</p> : null}
      </div>

      {viewing ? null : (
        <OrgCard title={C.proposals.heading(proposals.length)} testId="proposals">
          {proposals.length === 0 ? (
            <p className="font-semibold" data-testid="no-proposals">
              {copy.trickBase.admin.none}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {proposals.map((p) => (
                <ProposalItem key={`${p.eventId}-${p.family}-${p.key}`} p={p} model={base} isOwner={isOwner} dirty={dirty} baseVersion={working.version} />
              ))}
            </ul>
          )}
        </OrgCard>
      )}

      {readOnly ? null : (
        <div className="sticky top-0 z-10 flex flex-wrap items-start gap-2 border-b border-beach-line bg-beach-bg py-2" data-testid="editor-actions">
          <Button variant="primary" data-testid="save-draft" {...disabledWhen((pending && C.working) || (!dirty && C.noChanges))} onClick={save}>
            {C.save}
          </Button>
          <Button data-testid="publish" {...disabledWhen((dirty && C.saveBeforePublish) || (!canPublish && C.nothingToPublish))} onClick={() => setPublishing(true)}>
            {C.publish}
          </Button>
          {dirty ? <span className="self-center font-semibold" data-testid="unsaved">{C.unsaved}</span> : null}
        </div>
      )}

      {publishing && canPublish ? (
        <div className="panel flex flex-col gap-2" role="group" aria-label={C.publish} data-testid="publish-diff">
          <p className="text-lg font-semibold">{C.publishQuestion(working.version, live?.version ?? null)}</p>
          <p className="font-semibold" data-testid="publish-summary">
            {publishDiff?.summary ?? C.firstVersion}
          </p>
          {publishDiff?.lines.length ? (
            <ul className="list-disc pl-6">
              {publishDiff.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          ) : null}
          <p className="text-small font-semibold">{C.publishNote}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" data-testid="confirm-publish" {...disabledWhen(pending && C.working)} onClick={publish}>
              {C.publishYes(working.version)}
            </Button>
            <Button variant="quiet" onClick={() => setPublishing(false)}>
              {copy.common.cancel}
            </Button>
          </div>
        </div>
      ) : null}

      {errors.length ? (
        <div role="alert" className="panel field-error flex flex-col gap-1" data-testid="validation">
          <p className="font-semibold">{C.fixFirst}</p>
          <ul className="list-disc pl-6">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {warnings.length ? (
        <div className="panel flex flex-col gap-1" data-testid="tidy">
          <p className="font-semibold">{C.tidyHeading}</p>
          <ul className="list-disc pl-6">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        {model.families.map((f, i) => (
          <FamilyCard key={f.key} family={f} index={i} model={model} locked={locked} readOnly={readOnly} onChange={change} />
        ))}
      </DndContext>

      {readOnly ? null : (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!familyLabel.trim()) return;
            change(addFamily(model, familyLabel).model);
            setFamilyLabel("");
          }}
        >
          <input aria-label={C.newFamilyName} data-testid="add-family-name" value={familyLabel} maxLength={40} placeholder={C.newFamilyPlaceholder} onChange={(e) => setFamilyLabel(e.target.value)} className="w-56" />
          <Button type="submit" data-testid="add-family" {...disabledWhen(!familyLabel.trim() && C.typeAName)}>
            {C.addFamily}
          </Button>
        </form>
      )}

      <OrgCard title={C.precedenceHeading} testId="precedence">
        <p className="mb-2 flex items-center gap-1 font-medium">
          {C.precedenceExplain}
          <HelpTip what={C.precedenceHeading} text={C.precedenceExplain} example={C.precedenceExample} />
        </p>
        <ol className="flex flex-col gap-1">
          {model.categoryPrecedence.map((c, i) => (
            <li key={c} className="flex items-center gap-2 font-semibold" data-testid={`precedence-${c}`}>
              <span className="w-6 text-right">{i + 1}.</span>
              <span className="min-w-40">{catLabel(c)}</span>
              {readOnly ? null : (
                <>
                  <Button variant="quiet" iconOnly icon={ArrowUp} aria-label={C.up(catLabel(c))} {...disabledWhen(i === 0 && C.alreadyFirst)} onClick={() => change(nudgeCategory(model, c, -1))} />
                  <Button variant="quiet" iconOnly icon={ArrowDown} aria-label={C.down(catLabel(c))} {...disabledWhen(i === model.categoryPrecedence.length - 1 && C.alreadyLast)} onClick={() => change(nudgeCategory(model, c, 1))} />
                </>
              )}
            </li>
          ))}
        </ol>
      </OrgCard>

      <OrgCard title={C.namingHeading} testId="naming">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 font-semibold">
            <span className="flex items-center gap-1">
              {C.namingTemplate}
              <HelpTip what={C.namingTemplate} text={C.namingHelp} example={C.namingExample} />
            </span>
            <input data-testid="naming-template" value={model.namingTemplate} maxLength={80} disabled={readOnly} className="w-72 font-mono" onChange={(e) => change({ ...model, namingTemplate: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 font-semibold">
            <span className="flex items-center gap-1">
              {C.hideMultiplier}
              <HelpTip what={C.hideMultiplier} text={C.hideHelp} example={C.hideExample} />
            </span>
            <select data-testid="hide-multiplier" value={model.hideMultiplierWhen} disabled={readOnly} className="w-72" onChange={(e) => change({ ...model, hideMultiplierWhen: e.target.value })}>
              <option value="">{C.neverHide}</option>
              {multipliers.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <p className="font-semibold">
            {C.exampleLabel} <span data-testid="live-example" className="rounded-[8px] border border-beach-line bg-beach-surface px-2 py-1">{example || C.exampleEmpty}</span>
          </p>
        </div>
      </OrgCard>

      <OrgCard title={C.historyHeading} testId="history">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-small">
            <thead>
              <tr>
                {[C.historyColumns.version, C.historyColumns.status, C.historyColumns.saved, C.historyColumns.published, C.historyColumns.changes, ""].map((h, i) => (
                  <th key={i} className="border-b border-beach-line p-2 text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} data-testid={`history-${h.version}`}>
                  <td className="border-b border-beach-line p-2 font-semibold">v{h.version}</td>
                  <td className="border-b border-beach-line p-2">{h.isLive ? C.historyLive : h.published ? C.historyPublished : C.historyDraft}</td>
                  <td className="border-b border-beach-line p-2">{h.saved}</td>
                  <td className="border-b border-beach-line p-2">{h.publishedText}</td>
                  <td className="border-b border-beach-line p-2">{h.summary}</td>
                  <td className="border-b border-beach-line p-2">
                    <Link href={`/admin/presets/trick-base?version=${h.version}`} className="font-semibold underline" data-testid={`view-${h.version}`}>
                      {C.view}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </OrgCard>

      <details className="rounded-card border border-beach-line p-4" data-testid="json-fold" onToggle={(e) => (e.currentTarget.open && !jsonText ? setJsonText(JSON.stringify(toVocabulary(model), null, 2)) : undefined)}>
        <summary className="cursor-pointer font-semibold">{C.jsonFold}</summary>
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-small font-semibold">{C.jsonIntro}</p>
          <textarea aria-label={C.jsonFold} data-testid="json-text" rows={16} className="font-mono text-small" value={jsonText} readOnly={readOnly} onChange={(e) => setJsonText(e.target.value)} />
          {jsonError ? (
            <p role="alert" className="field-error">
              {jsonError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {readOnly ? null : (
              <Button
                data-testid="json-apply"
                onClick={() => {
                  setJsonError(null);
                  try {
                    const parsed = JSON.parse(jsonText) as VocabularyJson;
                    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.baseTricks) || !Array.isArray(parsed.modifiers)) throw new Error(C.jsonShape);
                    change(toModel(parsed));
                    toast({ title: C.jsonApplied });
                  } catch (err) {
                    setJsonError(C.jsonBad((err as Error).message));
                  }
                }}
              >
                {C.jsonApply}
              </Button>
            )}
            <Button
              data-testid="json-export"
              onClick={() => {
                const blob = new Blob([JSON.stringify(toVocabulary(model), null, 2)], { type: "application/json" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `trick-base-v${viewing?.version ?? working.version}.json`;
                a.click();
                URL.revokeObjectURL(a.href);
              }}
            >
              {C.jsonExport}
            </Button>
            {readOnly ? null : (
              <>
                <Button data-testid="json-import" onClick={() => fileRef.current?.click()}>
                  {C.jsonImport}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  data-testid="json-file"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 512 * 1024) return setJsonError(C.jsonTooLarge);
                    setJsonText(await file.text());
                    e.target.value = "";
                  }}
                />
              </>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
