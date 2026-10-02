"use client";

import { useMemo, useState, useTransition } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "@/hooks/use-toast";
import { addLocalBlock, blockId, blocksFromVocabulary, deriveCategories, FAMILIES, parseTrickBase, type Block, type FamilyKey, type LocalBlock, type VocabularyJson } from "@/lib/trick-base";
import { MOVABLE, nudgeBlock, nudgeFamily, parseLayout, placeBlock, resolveLayout, toggleFavourite, defaultLayout, type TrickLayout } from "@/lib/trick-base/layout";
import { copy } from "@/lib/ui-copy";
import { addTrickBlock, saveTrickBase } from "./actions";

const T = copy.trickBase;

/** One block of a family: tick box, the way it is moved (drag handle, arrows, "Move to…"), and the favourite star. */
function BlockRow({
  block,
  ticked,
  cannotUntick,
  favourite,
  pending,
  movable,
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
  onTick: (on: boolean) => void;
  onUp: () => void;
  onDown: () => void;
  onMove: (family: FamilyKey) => void;
  onFavourite: () => void;
}) {
  const id = blockId(block);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }} data-testid={`block-row-${id}`} className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-[#111] bg-white px-2 py-1">
      <button type="button" className="min-h-[40px] min-w-[40px] cursor-grab text-xl font-extrabold" aria-label={T.dragBlock(block.label)} data-testid={`drag-${id}`} {...attributes} {...listeners}>
        ⠿
      </button>
      <label className="flex min-w-0 flex-1 items-center gap-2 font-semibold" title={cannotUntick ? T.cannotUntick : undefined}>
        <input type="checkbox" className="h-6 w-6" checked={ticked} disabled={pending || cannotUntick} onChange={(e) => onTick(e.target.checked)} data-testid={`block-${id}`} />
        <span>{block.label}</span>
        {block.local || block.proposed ? <span className="rounded border-2 border-[#111] px-1 text-xs font-bold">{block.proposed ? T.proposedTag : T.localTag}</span> : null}
        {favourite ? <span className="text-xs font-bold">{T.favouriteTag}</span> : null}
      </label>
      <button type="button" className="btn !min-h-[var(--org-ctl)] !px-3" aria-label={T.moveUp(block.label)} data-testid={`up-${id}`} disabled={pending} onClick={onUp}>
        ↑
      </button>
      <button type="button" className="btn !min-h-[var(--org-ctl)] !px-3" aria-label={T.moveDown(block.label)} data-testid={`down-${id}`} disabled={pending} onClick={onDown}>
        ↓
      </button>
      <button type="button" className="btn !min-h-[var(--org-ctl)] !px-3" aria-label={T.favourite(block.label)} aria-pressed={favourite} data-testid={`fav-${id}`} disabled={pending} onClick={onFavourite}>
        {favourite ? "★" : "☆"}
      </button>
      {movable ? (
        <select aria-label={T.moveTo(block.label)} data-testid={`moveto-${id}`} className="min-h-[40px]" disabled={pending} value="" onChange={(e) => e.target.value && onMove(e.target.value as FamilyKey)}>
          <option value="">{T.moveToChoose}</option>
          {FAMILIES.filter((f) => MOVABLE.includes(f.key)).map((f) => (
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
export function TrickBasePanel({
  eventId,
  divisionId,
  vocabulary,
  localBlocks,
  onBlockAdded,
  trickBase,
  started,
  modelCategories,
}: {
  eventId: string;
  divisionId: string;
  vocabulary: VocabularyJson;
  localBlocks: LocalBlock[];
  onBlockAdded: (b: LocalBlock) => void;
  trickBase: unknown;
  started: boolean;
  modelCategories: Array<{ key: string; label: string }>;
}) {
  const initial = parseTrickBase(trickBase);
  const [disabled, setDisabled] = useState<string[]>(() => initial.disabled);
  const [layout, setLayout] = useState<TrickLayout>(() => parseLayout(initial.layout));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [family, setFamily] = useState<FamilyKey>("base");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const blocks = useMemo(() => blocksFromVocabulary(vocabulary, localBlocks), [vocabulary, localBlocks]);
  const view = useMemo(() => resolveLayout(blocks, disabled, layout, true), [blocks, disabled, layout]);
  const derived = useMemo(() => deriveCategories(blocks, disabled, vocabulary.categoryPrecedence, modelCategories), [blocks, disabled, vocabulary.categoryPrecedence, modelCategories]);
  const missingInScoring = derived.filter((c) => !modelCategories.some((m) => m.key === c.key));
  const on = blocks.length - blocks.filter((b) => disabled.includes(blockId(b))).length;

  function save(nextDisabled: string[], nextLayout: TrickLayout, saved: string) {
    const before = { disabled, layout };
    setDisabled(nextDisabled);
    setLayout(nextLayout);
    setError(null);
    start(async () => {
      const r = await saveTrickBase(divisionId, nextDisabled, nextLayout);
      if (!r.ok) {
        setDisabled(before.disabled);
        setLayout(before.layout);
        setError(r.error);
      } else toast({ title: saved });
    });
  }

  const toggle = (id: string, checked: boolean) => save(checked ? disabled.filter((d) => d !== id) : [...disabled, id], layout, T.saved);
  const relayout = (next: TrickLayout) => save(disabled, next, T.layoutSaved);

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
        <h3 className="text-xl font-extrabold">{T.heading}</h3>
        <p className="font-semibold">{T.intro}</p>
        <h4 className="mt-2 text-lg font-extrabold">{T.layoutHeading}</h4>
        <p className="font-semibold">{T.layoutIntro}</p>
        {started ? (
          <p className="panel mt-2 font-bold" role="note" data-testid="trick-base-locked">
            {T.lockedNote}
          </p>
        ) : null}
        <p className="mt-1 font-bold">{T.count(on, blocks.length)}</p>
      </div>
      {error ? (
        <p role="alert" className="field-error">
          {copy.common.problem(error)}
        </p>
      ) : null}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        {view.map((v, i) => (
          <fieldset key={v.family} className="flex flex-col gap-2" data-testid={`family-${v.family}`}>
            <legend className="flex flex-wrap items-center gap-2 text-lg font-extrabold">
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
                const ticked = !disabled.includes(id);
                return (
                  <BlockRow
                    key={id}
                    block={b}
                    ticked={ticked}
                    cannotUntick={started && ticked}
                    favourite={layout.favourites.includes(id)}
                    pending={pending}
                    movable={MOVABLE.includes(b.family)}
                    onTick={(checked) => toggle(id, checked)}
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
        <button type="button" className="btn" disabled={pending || disabled.length === 0 || started} onClick={() => save([], layout, T.saved)}>
          {T.tickAll}
        </button>
        <button type="button" className="btn" disabled={pending} data-testid="reset-layout" onClick={() => relayout(defaultLayout())}>
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
            <label htmlFor={`blk-family-${divisionId}`} className="font-bold">
              {T.addFamily}
            </label>
            <select id={`blk-family-${divisionId}`} value={family} onChange={(e) => setFamily(e.target.value as FamilyKey)}>
              {FAMILIES.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`blk-name-${divisionId}`} className="font-bold">
              {T.addName}
            </label>
            <input id={`blk-name-${divisionId}`} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} className="w-64" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`blk-cat-${divisionId}`} className="font-bold">
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
        <h4 id={`cats-${divisionId}`} className="text-lg font-extrabold">
          {T.categoriesHeading}
        </h4>
        <p className="text-lg font-bold" data-testid="derived-categories">
          {derived.length ? derived.map((c) => c.label).join(" · ") : T.categoriesNone}
        </p>
        <p className="text-sm font-semibold">{T.categoriesNote}</p>
        {missingInScoring.length > 0 && modelCategories.length > 0 ? <p className="text-sm font-bold">{T.notInScoring(missingInScoring.map((c) => c.label).join(", "))}</p> : null}
      </section>
    </div>
  );
}

