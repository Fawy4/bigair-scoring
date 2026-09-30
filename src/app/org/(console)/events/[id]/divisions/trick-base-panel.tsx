"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "@/hooks/use-toast";
import { addLocalBlock, blockId, blocksFromVocabulary, deriveCategories, FAMILIES, parseTrickBase, type FamilyKey, type LocalBlock, type VocabularyJson } from "@/lib/trick-base";
import { copy } from "@/lib/ui-copy";
import { addTrickBlock, saveTrickBase } from "./actions";

const T = copy.trickBase;

/** The trick base of one division: five families of building blocks, every block a tick box, all on to begin with. */
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
  const [disabled, setDisabled] = useState<string[]>(() => parseTrickBase(trickBase).disabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [family, setFamily] = useState<FamilyKey>("base");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("");

  const blocks = useMemo(() => blocksFromVocabulary(vocabulary, localBlocks), [vocabulary, localBlocks]);
  const derived = useMemo(() => deriveCategories(blocks, disabled, vocabulary.categoryPrecedence, modelCategories), [blocks, disabled, vocabulary.categoryPrecedence, modelCategories]);
  const missingInScoring = derived.filter((c) => !modelCategories.some((m) => m.key === c.key));
  const on = blocks.length - blocks.filter((b) => disabled.includes(blockId(b))).length;

  function save(next: string[]) {
    const before = disabled;
    setDisabled(next);
    setError(null);
    start(async () => {
      const r = await saveTrickBase(divisionId, next);
      if (!r.ok) {
        setDisabled(before);
        setError(r.error);
      } else toast({ title: T.saved });
    });
  }

  const toggle = (id: string, checked: boolean) => save(checked ? disabled.filter((d) => d !== id) : [...disabled, id]);

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

      {FAMILIES.map((f) => (
        <fieldset key={f.key} className="flex flex-col gap-2" data-testid={`family-${f.key}`}>
          <legend className="text-lg font-extrabold">{f.label}</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {blocks
              .filter((b) => b.family === f.key)
              .map((b) => {
                const id = blockId(b);
                const ticked = !disabled.includes(id);
                const cannotUntick = started && ticked;
                return (
                  <label key={id} className="flex items-center gap-2 font-semibold" title={cannotUntick ? T.cannotUntick : undefined}>
                    <input type="checkbox" className="h-6 w-6" checked={ticked} disabled={pending || cannotUntick} onChange={(e) => toggle(id, e.target.checked)} data-testid={`block-${id}`} />
                    <span>{b.label}</span>
                    {b.local || b.proposed ? <span className="rounded border-2 border-[#111] px-1 text-xs font-bold">{b.proposed ? T.proposedTag : T.localTag}</span> : null}
                  </label>
                );
              })}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" disabled={pending || disabled.length === 0 || started} onClick={() => save([])}>
          {T.tickAll}
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
