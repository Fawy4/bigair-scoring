"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical, Star } from "lucide-react";
import { Button } from "@/components/org/button";
import { toast } from "@/hooks/use-toast";
import { ConfirmButton } from "@/components/confirm-button";
import { addLocalBlock, blockId, blocksFromVocabulary, deriveCategories, effectiveDisabled, FAMILIES, familiesOf, parseTrickBase, toggleBlock, type Block, type BuiltInFamily, type FamilyKey, type LocalBlock, type VocabularyJson } from "@/lib/trick-base";
import { isMovable, nudgeBlock, nudgeFamily, parseLayout, placeBlock, resolveLayout, toggleFavourite, defaultLayout, type TrickLayout } from "@/lib/trick-base/layout";
import { copy } from "@/lib/ui-copy";
import { addTrickBlock, saveTrickBase } from "./actions";
import { loadEventTrickBase, updateEventTrickBase, type EventTrickBase } from "./trick-base-actions";

const T = copy.trickBase;
const V = copy.trickEditor.event;

/** One block of a family: tick box, the way it is moved (drag handle, arrows, "Move to…"), and the favourite star. */
function BlockRow({
  block,
  ticked,
  cannotUntick,
  favourite,
  pending,
  movable,
  families,
  onTick,
  onUp,
  onDown,
  onMove,
  onFavourite,
}: {
  block: Block;
  ticked: boolean;
  cannotUntick: boolean;
  favourite: boolean;
  pending: boolean;
  movable: boolean;
  families: Array<{ key: FamilyKey; label: string }>;
  onTick: (on: boolean) => void;
  onUp: () => void;
  onDown: () => void;
  onMove: (family: FamilyKey) => void;
  onFavourite: () => void;
}) {
  const id = blockId(block);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }} data-testid={`block-row-${id}`} className="flex flex-wrap items-center gap-2 rounded-[8px] border border-beach-line bg-beach-bg px-2 py-0.5">
      <Button variant="quiet" iconOnly icon={GripVertical} className="cursor-grab" aria-label={T.dragBlock(block.label)} data-testid={`drag-${id}`} {...attributes} {...listeners} />
      <label className="flex min-w-0 flex-1 items-center gap-2 font-semibold" title={cannotUntick ? T.cannotUntick : undefined}>
        <input type="checkbox" className="h-6 w-6" checked={ticked} disabled={pending || cannotUntick} onChange={(e) => onTick(e.target.checked)} data-testid={`block-${id}`} />
        <span>{block.label}</span>
        {block.local || block.proposed ? <span className="rounded border border-beach-line px-1 text-xs font-semibold">{block.proposed ? T.proposedTag : block.declined && block.reason ? V.declinedTag(block.reason) : T.localTag}</span> : null}
        {favourite ? <span className="text-xs font-semibold">{T.favouriteTag}</span> : null}
      </label>
      <Button variant="quiet" iconOnly icon={ArrowUp} aria-label={T.moveUp(block.label)} data-testid={`up-${id}`} onClick={onUp} />
      <Button variant="quiet" iconOnly icon={ArrowDown} aria-label={T.moveDown(block.label)} data-testid={`down-${id}`} onClick={onDown} />
      <Button variant={favourite ? "secondary" : "quiet"} iconOnly icon={Star} aria-label={T.favourite(block.label)} aria-pressed={favourite} data-testid={`fav-${id}`} onClick={onFavourite} />
      {movable ? (
        <select aria-label={T.moveTo(block.label)} data-testid={`moveto-${id}`} disabled={pending} value="" onChange={(e) => e.target.value && onMove(e.target.value as FamilyKey)}>
          <option value="">{T.moveToChoose}</option>
          {families.filter((f) => isMovable(f.key)).map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
      ) : null}
    </li>
  );
}

function FamilyList({ family, children, ids }: { family: FamilyKey; children: React.ReactNode; ids: string[] }) {
  const { setNodeRef } = useDroppable({ id: `family:${family}` });
  return (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      <ul ref={setNodeRef} className="flex min-h-[48px] flex-col gap-2" data-testid={`list-${family}`}>
        {children}
      </ul>
    </SortableContext>
  );
}

/**
 * The trick base of one division (docs/08 §1G-5): every block is a tick box, all on to begin with, and the same list says how the spotter's phone is laid out:
 * the order of the families, the order of the blocks in each, blocks moved between Base trick, Add-ons and Grabs & landings, favourites on top. The spotter
 * renders exactly this and never reorders anything. Drag a block (⠿), or use the arrows and "Move to…" (taps only on the official screens; drag is for the organiser).
 */
type PanelProps = {
  eventId: string;
  divisionId: string;
  /** The newest published master version (from the page); the panel shows the version this event uses, which it loads itself. */
  vocabulary: VocabularyJson;
  localBlocks: LocalBlock[];
  onBlockAdded: (b: LocalBlock) => void;
  trickBase: unknown;
  started: boolean;
  modelCategories: Array<{ key: string; label: string }>;
};

/** The version line, the diff in words and "Update to latest" (docs/08 §1I-4): the whole event moves at once. */
function VersionBar({ base, eventId, onUpdated }: { base: EventTrickBase; eventId: string; onUpdated: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2 rounded-card border border-beach-line p-3" data-testid="trick-base-version">
      <p className="font-semibold">{V.versionLine(base.version)}</p>
      {base.diff ? (
        <>
          <p className="font-semibold" data-testid="update-summary">
            {V.newer(base.latest)} {base.diff.summary}
          </p>
          {base.diff.lines.length ? (
            <ul className="list-disc pl-6 text-small" data-testid="update-lines">
              {base.diff.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          ) : null}
          {error ? (
            <p role="alert" className="field-error">
              {error}
            </p>
          ) : null}
          <div data-testid="update-to-latest">
            <ConfirmButton
              label={V.update}
              question={V.updateQuestion(base.version, base.latest)}
              confirmLabel={V.updateYes}
              cancelLabel={copy.common.cancel}
              pending={pending}
              onConfirm={() =>
                start(async () => {
                  setError(null);
                  const r = await updateEventTrickBase(eventId);
                  if (!r.ok) return setError(r.error);
                  toast({ title: V.updated(r.version) });
                  onUpdated();
                })
              }
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

export function TrickBasePanel(props: PanelProps) {
  const router = useRouter();
  const [base, setBase] = useState<EventTrickBase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    let live = true;
    loadEventTrickBase(props.eventId).then((r) => {
      if (!live) return;
      if (r.ok) setBase(r.base);
      else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [props.eventId, round]);
  if (error) return <p className="rounded-card border border-beach-line p-3 text-body font-semibold">{error}</p>;
  if (!base) return <p className="text-body font-semibold" data-testid="trick-base-loading">{V.loading}</p>;
  return (
    <div className="flex flex-col gap-4">
      <VersionBar
        base={base}
        eventId={props.eventId}
        onUpdated={() => {
          setRound((n) => n + 1);
          router.refresh();
        }}
      />
      <TrickBaseTicks key={`${base.version}-${round}`} {...props} vocabulary={base.vocabulary} freshTrickBase={base.divisionTrickBases[props.divisionId]} />
    </div>
  );
}

/**
 * The ticks and the spotter's layout of one division in the version this event uses. Blocks the master base retired are not shown; blocks it has off for
 * new events start unticked (ticking one stores it in `enabled`).
 */
function TrickBaseTicks({ eventId, divisionId, vocabulary, localBlocks, onBlockAdded, trickBase, freshTrickBase, started, modelCategories }: PanelProps & { freshTrickBase?: unknown }) {
  const families = useMemo(() => familiesOf(vocabulary), [vocabulary]);
  const familyKeys = useMemo(() => families.map((f) => f.key), [families]);
  const initial = parseTrickBase(freshTrickBase ?? trickBase);
  const [disabled, setDisabled] = useState<string[]>(() => initial.disabled);
  const [enabled, setEnabled] = useState<string[]>(() => initial.enabled ?? []);
  const [layout, setLayout] = useState<TrickLayout>(() => parseLayout(initial.layout, familyKeys));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [family, setFamily] = useState<BuiltInFamily>("base");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const blocks = useMemo(() => blocksFromVocabulary(vocabulary, localBlocks).filter((b) => !b.retired), [vocabulary, localBlocks]);
  const off = useMemo(() => effectiveDisabled(blocks, { disabled, enabled }), [blocks, disabled, enabled]);
  const view = useMemo(() => resolveLayout(blocks, off, layout, true, families), [blocks, off, layout, families]);
  const derived = useMemo(() => deriveCategories(blocks, off, vocabulary.categoryPrecedence, modelCategories), [blocks, off, vocabulary.categoryPrecedence, modelCategories]);
  const missingInScoring = derived.filter((c) => !modelCategories.some((m) => m.key === c.key));
  const on = blocks.length - blocks.filter((b) => off.includes(blockId(b))).length;

  function save(nextDisabled: string[], nextEnabled: string[], nextLayout: TrickLayout, saved: string) {
    const before = { disabled, enabled, layout };
    setDisabled(nextDisabled);
    setEnabled(nextEnabled);
    setLayout(nextLayout);
    setError(null);
    start(async () => {
      const r = await saveTrickBase(divisionId, nextDisabled, nextLayout, nextEnabled);
      if (!r.ok) {
        setDisabled(before.disabled);
        setEnabled(before.enabled);
        setLayout(before.layout);
        setError(r.error);
      } else toast({ title: saved });
    });
  }

  const toggle = (b: Block, checked: boolean) => {
    const next = toggleBlock({ disabled, enabled }, blockId(b), checked, b.defaultOn !== false);
    save(next.disabled, next.enabled ?? [], layout, T.saved);
  };
  const relayout = (next: TrickLayout) => save(disabled, enabled, next, T.layoutSaved);
  const tickAll = () => save([], blocks.filter((b) => b.defaultOn === false).map(blockId), layout, T.saved);

  function onDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const activeId = String(e.active.id);
    const overId = String(e.over.id);
    const block = blocks.find((b) => blockId(b) === activeId);
    if (!block || activeId === overId) return;
    let target: FamilyKey | null = null;
    let index = 0;
    if (overId.startsWith("family:")) {
      target = overId.slice(7) as FamilyKey;
      index = view.find((v) => v.family === target)?.blocks.length ?? 0;
    } else {
      const fam = view.find((v) => v.blocks.some((b) => blockId(b) === overId));
      if (!fam) return;
      target = fam.family;
      index = fam.blocks.findIndex((b) => blockId(b) === overId);
    }
    const next = placeBlock(view, layout, block, target, index);
    if (JSON.stringify(next) !== JSON.stringify(layout)) relayout(next);
  }

  function addBlock() {
    setError(null);
    const preview = addLocalBlock(vocabulary, localBlocks, { family, label, category: category || null });
    if (!preview.ok) return setError(preview.error);
    start(async () => {
      const r = await addTrickBlock(eventId, { family, label, category: category || null });
      if (!r.ok) return setError(r.error);
      onBlockAdded(r.block);
      setLabel("");
      setCategory("");
      setAdding(false);
      toast({ title: T.added(r.block.label) });
    });
  }

  return (
    <div className="flex flex-col gap-5" data-testid="trick-base">
      <div>
        <h3 className="text-xl font-semibold">{T.heading}</h3>
        <p className="font-semibold">{T.intro}</p>
        <h4 className="mt-2 text-lg font-semibold">{T.layoutHeading}</h4>
        <p className="font-semibold">{T.layoutIntro}</p>
        {started ? (
          <p className="panel mt-2 font-semibold" role="note" data-testid="trick-base-locked">
            {T.lockedNote}
          </p>
        ) : null}
        <p className="mt-1 font-semibold">{T.count(on, blocks.length)}</p>
      </div>
      {error ? (
        <p role="alert" className="field-error">
          {copy.common.problem(error)}
        </p>
      ) : null}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        {view.map((v, i) => (
          <fieldset key={v.family} className="flex flex-col gap-2" data-testid={`family-${v.family}`}>
            <legend className="flex flex-wrap items-center gap-2 text-lg font-semibold">
              {v.label}
              <button type="button" className="btn !min-h-[36px] !px-2" aria-label={T.familyUp(v.label)} data-testid={`family-up-${v.family}`} disabled={pending || i === 0} onClick={() => relayout(nudgeFamily(layout, v.family, -1))}>
                ↑
              </button>
              <button type="button" className="btn !min-h-[36px] !px-2" aria-label={T.familyDown(v.label)} data-testid={`family-down-${v.family}`} disabled={pending || i === view.length - 1} onClick={() => relayout(nudgeFamily(layout, v.family, 1))}>
                ↓
              </button>
            </legend>
            <FamilyList family={v.family} ids={v.blocks.map(blockId)}>
              {v.blocks.map((b) => {
                const id = blockId(b);
                const ticked = !off.includes(id);
                return (
                  <BlockRow
                    key={id}
                    block={b}
                    ticked={ticked}
                    cannotUntick={started && ticked}
                    favourite={layout.favourites.includes(id)}
                    pending={pending}
                    movable={isMovable(b.family)}
                    families={families}
                    onTick={(checked) => toggle(b, checked)}
                    onUp={() => relayout(nudgeBlock(view, layout, b, -1))}
                    onDown={() => relayout(nudgeBlock(view, layout, b, 1))}
                    onMove={(f) => relayout(placeBlock(view, layout, b, f, 9999))}
                    onFavourite={() => relayout(toggleFavourite(layout, id))}
                  />
                );
              })}
            </FamilyList>
          </fieldset>
        ))}
      </DndContext>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" disabled={pending || off.length === 0 || started} onClick={tickAll}>
          {T.tickAll}
        </button>
        <button type="button" className="btn" disabled={pending} data-testid="reset-layout" onClick={() => relayout(defaultLayout(familyKeys))}>
          {T.resetLayout}
        </button>
        <button type="button" className="btn" onClick={() => setAdding((a) => !a)} aria-expanded={adding} data-testid="add-block">
          {T.addBlock}
        </button>
      </div>

      {adding ? (
        <form
          className="panel flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            addBlock();
          }}
        >
          <div className="flex flex-col gap-1">
            <label htmlFor={`blk-family-${divisionId}`} className="font-semibold">
              {T.addFamily}
            </label>
            <select id={`blk-family-${divisionId}`} value={family} onChange={(e) => setFamily(e.target.value as BuiltInFamily)}>
              {/* the names of the version this event uses (the same list as the panel and the spotter), for the families a local block can join */}
              {families.filter((f) => FAMILIES.some((b) => b.key === f.key)).map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`blk-name-${divisionId}`} className="font-semibold">
              {T.addName}
            </label>
            <input id={`blk-name-${divisionId}`} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} className="w-64" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`blk-cat-${divisionId}`} className="font-semibold">
              {T.addCategory}
            </label>
            <select id={`blk-cat-${divisionId}`} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">{T.addCategoryNone}</option>
              {vocabulary.categoryPrecedence.map((c) => (
                <option key={c} value={c}>
                  {modelCategories.find((m) => m.key === c)?.label ?? T.categoryLabels[c] ?? c}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary" disabled={pending || label.trim().length === 0}>
            {T.addConfirm}
          </button>
        </form>
      ) : null}

      <section className="panel flex flex-col gap-1" aria-labelledby={`cats-${divisionId}`}>
        <h4 id={`cats-${divisionId}`} className="text-lg font-semibold">
          {T.categoriesHeading}
        </h4>
        <p className="text-lg font-semibold" data-testid="derived-categories">
          {derived.length ? derived.map((c) => c.label).join(" · ") : T.categoriesNone}
        </p>
        <p className="text-sm font-semibold">{T.categoriesNote}</p>
        {missingInScoring.length > 0 && modelCategories.length > 0 ? <p className="text-sm font-semibold">{T.notInScoring(missingInScoring.map((c) => c.label).join(", "))}</p> : null}
      </section>
    </div>
  );
}

