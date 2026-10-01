"use client";

import { useState } from "react";
import { Mic, Zap } from "lucide-react";
import { FAMILIES, blockId, type Block, type FamilyKey } from "@/lib/trick-base";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

export interface BuilderSelection {
  direction: string | null;
  multiplier: string | null;
  base: string | null;
  /** Add-ons and grabs, any order. */
  addons: string[];
}

const SINGLE: FamilyKey[] = ["direction", "multiplier", "base"];

/**
 * The spotter's trick builder: one row of blocks for each single-choice family (direction, multiplier, base trick), toggles for add-ons and grabs,
 * the composed name and category, a text field and a microphone, then CRASH and Log. Presentational: the parent owns the selection and the name.
 * CRASH asks once. In this preview the text field and the microphone do nothing yet (wired in 5b).
 */
export function TrickBuilder({
  blocks,
  selection,
  onPick,
  name,
  categoryLabel,
  riderLabelText,
  onCrash,
  onLog,
  canLog,
}: {
  blocks: Block[];
  selection: BuilderSelection;
  onPick: (family: FamilyKey, key: string) => void;
  name: string;
  categoryLabel: string;
  riderLabelText: string;
  onCrash: () => void;
  onLog: () => void;
  canLog: boolean;
}) {
  const T = copy.live.builder;
  const [text, setText] = useState("");
  const [micNote, setMicNote] = useState(false);
  const [confirmCrash, setConfirmCrash] = useState(false);
  const isOn = (b: Block) => (SINGLE.includes(b.family) ? selection[b.family as "direction" | "multiplier" | "base"] === b.key : selection.addons.includes(b.key));
  const block = "min-h-[3.5rem] rounded-lg px-4 text-xl font-bold";
  return (
    <div data-testid="trick-builder" className="flex flex-col gap-4">
      {FAMILIES.map((f) => {
        const list = blocks.filter((b) => b.family === f.key);
        if (list.length === 0) return null;
        return (
          <fieldset key={f.key} className="flex flex-col gap-2">
            <legend className="mb-1 text-xl font-extrabold">{f.label}</legend>
            <div className="flex flex-wrap gap-2">
              {list.map((b) => (
                <button
                  key={blockId(b)}
                  type="button"
                  data-block={blockId(b)}
                  aria-pressed={isOn(b)}
                  onClick={() => onPick(b.family, b.key)}
                  className={cn(block, isOn(b) ? "border-4 border-beach-border bg-beach-selected text-beach-on-selected" : "border-2 border-beach-border bg-beach-bg text-beach-ink")}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </fieldset>
        );
      })}

      <div data-testid="composed-name" className="rounded-lg border-4 border-beach-border bg-beach-surface p-3">
        <p className="text-base font-bold text-beach-muted">{T.composed}</p>
        <p className="min-h-[2.25rem] text-3xl font-extrabold">{name || T.none}</p>
        <p className="text-xl font-bold text-beach-muted">
          {T.category}: <span className="text-beach-ink">{categoryLabel || copy.live.pad.none}</span>
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="trick-text" className="text-xl font-extrabold">
          {T.type}
        </label>
        <div className="flex gap-2">
          <input id="trick-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={T.typePlaceholder} className="min-h-[3.5rem] min-w-0 flex-1 rounded-lg border-2 border-beach-border bg-beach-bg px-3 text-xl font-semibold text-beach-ink placeholder:text-beach-muted" />
          <button type="button" aria-expanded={micNote} onClick={() => setMicNote((v) => !v)} className="inline-flex min-h-[3.5rem] min-w-[3.5rem] items-center justify-center gap-2 rounded-lg border-2 border-beach-border bg-beach-bg px-3 text-lg font-extrabold text-beach-ink">
            <Mic aria-hidden className="size-6" />
            {T.speak}
          </button>
        </div>
        {micNote ? <p role="note" className="rounded-md border-l-8 border-beach-border bg-beach-surface p-2 text-lg font-semibold">{T.speakOff}</p> : null}
      </div>

      {confirmCrash ? (
        <div role="alertdialog" aria-label={T.crashConfirm(riderLabelText)} className="flex flex-col gap-3 rounded-lg border-4 border-beach-crash bg-beach-surface p-3">
          <p className="text-xl font-extrabold text-beach-crash">{T.crashConfirm(riderLabelText)}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="min-h-[3.5rem] rounded-lg border-2 border-beach-crash bg-beach-crash px-5 text-xl font-extrabold text-beach-on-crash" onClick={() => { setConfirmCrash(false); onCrash(); }}>
              {T.crashYes}
            </button>
            <button type="button" className="min-h-[3.5rem] rounded-lg border-2 border-beach-border bg-beach-bg px-5 text-xl font-extrabold text-beach-ink" onClick={() => setConfirmCrash(false)}>
              {T.crashNo}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" data-testid="crash-button" onClick={() => setConfirmCrash(true)} className="inline-flex min-h-[4.5rem] items-center justify-center gap-2 rounded-lg border-4 border-beach-crash bg-beach-crash text-2xl font-extrabold text-beach-on-crash">
            <Zap aria-hidden className="size-7" />
            {T.crash}
          </button>
          <button
            type="button"
            data-testid="log-button"
            disabled={!canLog}
            onClick={onLog}
            className={cn("inline-flex min-h-[4.5rem] items-center justify-center rounded-lg border-4 text-2xl font-extrabold", canLog ? "border-beach-border bg-beach-ink text-beach-bg" : "border-dashed border-beach-missing bg-beach-surface text-beach-missing")}
          >
            {T.log}
          </button>
        </div>
      )}
      {!canLog && !confirmCrash ? <p className="text-lg font-bold text-beach-muted">{T.choose}</p> : null}
    </div>
  );
}
