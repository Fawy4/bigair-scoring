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
 * The spotter's trick builder: a Left / Right toggle, then one row of blocks for each other single-choice family (multiplier, base trick), toggles for
 * add-ons and grabs, a text field and a microphone. The composed name, CRASH and Log stay in a bar at the bottom, always in reach of the thumb.
 * CRASH asks once. Presentational: the parent owns the selection and the name. In this preview the text field and the microphone do nothing yet (5b).
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
  const direction = blocks.filter((b) => b.family === "direction");
  const block = "min-h-tap rounded-xl px-3 text-body font-semibold";
  const bar = "inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border px-4 text-name font-semibold";
  return (
    <div data-testid="trick-builder" className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-2" data-testid="screen-body">
        <div role="group" aria-label={T.direction} className="grid grid-cols-2 gap-1.5">
          {direction.map((b) => (
            <button
              key={blockId(b)}
              type="button"
              data-block={blockId(b)}
              aria-pressed={isOn(b)}
              onClick={() => onPick(b.family, b.key)}
              className={cn("min-h-[52px] rounded-xl text-name font-semibold", isOn(b) ? "border border-beach-accent bg-beach-accent text-beach-on-accent" : "border border-beach-border bg-beach-bg text-beach-ink")}
            >
              {b.label}
            </button>
          ))}
        </div>
        {FAMILIES.filter((f) => f.key !== "direction").map((f) => {
          const list = blocks.filter((b) => b.family === f.key);
          if (list.length === 0) return null;
          return (
            <fieldset key={f.key} className="flex flex-col gap-1.5">
              <legend className="mb-1 text-small font-semibold text-beach-muted">{f.label}</legend>
              <div className="flex flex-wrap gap-1.5">
                {list.map((b) => (
                  <button
                    key={blockId(b)}
                    type="button"
                    data-block={blockId(b)}
                    aria-pressed={isOn(b)}
                    onClick={() => onPick(b.family, b.key)}
                    className={cn(block, isOn(b) ? "border border-beach-accent bg-beach-accent text-beach-on-accent" : "border border-beach-border bg-beach-bg text-beach-ink")}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </fieldset>
          );
        })}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="trick-text" className="text-small font-semibold text-beach-muted">
            {T.type}
          </label>
          <div className="flex gap-1.5">
            <input id="trick-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={T.typePlaceholder} className="min-h-[48px] min-w-0 flex-1 rounded-xl border border-beach-border bg-beach-bg px-3 text-body font-medium text-beach-ink placeholder:text-beach-muted" />
            <button type="button" aria-expanded={micNote} onClick={() => setMicNote((v) => !v)} className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center gap-1.5 rounded-xl border border-beach-border bg-beach-bg px-3 text-body font-semibold text-beach-ink">
              <Mic aria-hidden className="size-5" />
              {T.speak}
            </button>
          </div>
          {micNote ? (
            <p role="note" className="rounded-xl border border-beach-line bg-beach-surface p-2 text-body font-medium">
              {T.speakOff}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-beach-line bg-beach-bg px-3 pb-3 pt-2" data-testid="builder-bar">
        <div data-testid="composed-name" className="rounded-xl border border-beach-line bg-beach-surface px-3 py-1.5">
          <p className="min-h-[1.5rem] truncate text-name font-semibold">{name || T.none}</p>
          <p className="text-small font-medium text-beach-muted">
            {T.category}: <span className="text-beach-ink">{categoryLabel || copy.live.pad.none}</span>
          </p>
        </div>
        {confirmCrash ? (
          <div role="alertdialog" aria-label={T.crashConfirm(riderLabelText)} className="flex flex-col gap-2 rounded-xl border border-beach-crash bg-beach-surface p-2">
            <p className="text-body font-semibold">{T.crashConfirm(riderLabelText)}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={cn(bar, "border-beach-crash bg-beach-crash text-beach-on-crash")} onClick={() => { setConfirmCrash(false); onCrash(); }}>
                {T.crashYes}
              </button>
              <button type="button" className={cn(bar, "border-beach-border bg-beach-bg text-beach-ink")} onClick={() => setConfirmCrash(false)}>
                {T.crashNo}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" data-testid="crash-button" onClick={() => setConfirmCrash(true)} className={cn(bar, "border-beach-crash bg-beach-crash text-beach-on-crash")}>
              <Zap aria-hidden className="size-5" />
              {T.crash}
            </button>
            <button type="button" data-testid="log-button" disabled={!canLog} onClick={onLog} className={cn(bar, canLog ? "border-beach-accent bg-beach-accent text-beach-on-accent" : "border-dashed border-beach-line bg-beach-surface text-beach-muted")}>
              {T.log}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
