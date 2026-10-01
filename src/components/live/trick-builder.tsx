"use client";

import { useState } from "react";
import { Mic, Zap } from "lucide-react";
import { blockId, type Block, type FamilyKey } from "@/lib/trick-base";
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
 * The spotter's trick builder, compact and vertical so the common tricks are loggable without scrolling:
 * one row for Left / Right and the multiplier; below it two columns — the base tricks as a vertical list on the left (the most common first),
 * add-ons and then grabs in two columns of their own on the right; a text field and a microphone; and a bar fixed at the bottom with the composed
 * name, CRASH and Log. CRASH asks once. Presentational: the parent owns the selection and the name. Typing and the microphone do nothing yet (5b).
 */
export function TrickBuilder({
  blocks,
  selection,
  onPick,
  name,
  categoryLabel,
  riderLabelText,
  status,
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
  /** The persistent line after Log ("Logged — RED — attempt 7"), shown until the next trick is started. */
  status?: string | null;
  onCrash: () => void;
  onLog: () => void;
  canLog: boolean;
}) {
  const T = copy.live.builder;
  const [text, setText] = useState("");
  const [micNote, setMicNote] = useState(false);
  const [confirmCrash, setConfirmCrash] = useState(false);
  const isOn = (b: Block) => (SINGLE.includes(b.family) ? selection[b.family as "direction" | "multiplier" | "base"] === b.key : selection.addons.includes(b.key));
  const of = (f: FamilyKey) => blocks.filter((b) => b.family === f);
  const on = "border border-beach-accent bg-beach-accent font-semibold text-beach-on-accent";
  const off = "border border-beach-border bg-beach-bg font-semibold text-beach-ink";
  const chip = (b: Block, extra = "") => (
    <button key={blockId(b)} type="button" data-block={blockId(b)} aria-pressed={isOn(b)} onClick={() => onPick(b.family, b.key)} className={cn("min-h-tap rounded-xl px-2 text-small leading-tight", isOn(b) ? on : off, extra)}>
      {b.label}
    </button>
  );
  const legend = "text-heading font-semibold text-beach-muted";
  const bar = "inline-flex min-h-tap items-center justify-center gap-1.5 rounded-xl border px-3 text-name font-semibold";
  return (
    <div data-testid="trick-builder" className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-2 py-1.5" data-testid="builder-body">
        <div className="grid grid-cols-[1.4fr_1.4fr_1fr_1fr_1fr_1fr] gap-1">
          {of("direction").map((b) => chip(b, "text-body"))}
          {of("multiplier").map((b) => chip(b, "text-body"))}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-2">
          <fieldset className="flex min-h-0 flex-col gap-1" data-testid="base-list">
            <legend className={legend}>{copy.trickBase.families.base}</legend>
            <div className="mt-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-0.5">{of("base").map((b) => chip(b, "w-full shrink-0 text-left"))}</div>
          </fieldset>
          <div className="flex min-h-0 flex-col gap-1.5 overflow-y-auto">
            <fieldset className="flex flex-col gap-1">
              <legend className={legend}>{copy.trickBase.families.addon}</legend>
              <div className="mt-1 grid grid-cols-2 gap-1">{of("addon").map((b) => chip(b))}</div>
            </fieldset>
            <fieldset className="flex flex-col gap-1">
              <legend className={legend}>{copy.trickBase.families.grab_landing}</legend>
              <div className="mt-1 grid grid-cols-2 gap-1">{of("grab_landing").map((b) => chip(b))}</div>
            </fieldset>
            <div className="flex flex-col gap-1">
              <label htmlFor="trick-text" className={legend}>
                {T.type}
              </label>
              <div className="flex gap-1">
                <input id="trick-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={T.typePlaceholder} className="min-h-tap min-w-0 flex-1 rounded-xl border border-beach-border bg-beach-bg px-2 text-small font-medium text-beach-ink placeholder:text-beach-muted" />
                <button type="button" aria-label={T.speak} aria-expanded={micNote} onClick={() => setMicNote((v) => !v)} className="inline-flex min-h-tap min-w-tap items-center justify-center rounded-xl border border-beach-border bg-beach-bg text-beach-ink">
                  <Mic aria-hidden className="size-5" />
                </button>
              </div>
              {micNote ? (
                <p role="note" className="rounded-lg border border-beach-line bg-beach-surface p-1.5 text-small font-medium">
                  {T.speakOff}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1 border-t border-beach-line bg-beach-bg px-2 pb-2 pt-1.5" data-testid="builder-bar">
        <div data-testid="composed-name" className="flex items-baseline justify-between gap-2 rounded-xl border border-beach-line bg-beach-surface px-2 py-1">
          <p className="min-w-0 truncate text-name font-semibold">{name || status || T.none}</p>
          <p className="shrink-0 text-small font-medium text-beach-muted">
            {T.category}: <span className="text-beach-ink">{categoryLabel || copy.live.pad.none}</span>
          </p>
        </div>
        {confirmCrash ? (
          <div role="alertdialog" aria-label={T.crashConfirm(riderLabelText)} className="flex flex-col gap-1 rounded-xl border border-beach-crash bg-beach-surface p-1.5">
            <p className="text-body font-semibold">{T.crashConfirm(riderLabelText)}</p>
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" className={cn(bar, "border-beach-crash bg-beach-crash text-beach-on-crash")} onClick={() => { setConfirmCrash(false); onCrash(); }}>
                {T.crashYes}
              </button>
              <button type="button" className={cn(bar, "border-beach-border bg-beach-bg text-beach-ink")} onClick={() => setConfirmCrash(false)}>
                {T.crashNo}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" data-testid="crash-button" onClick={() => setConfirmCrash(true)} className={cn(bar, "border-beach-crash bg-beach-crash text-beach-on-crash")}>
              <Zap aria-hidden className="size-5" />
              {T.crash}
            </button>
            <button type="button" data-testid="log-button" disabled={!canLog} onClick={onLog} className={cn(bar, canLog ? "border-beach-accent bg-beach-accent text-beach-on-accent" : "border-beach-line bg-beach-surface text-beach-muted")}>
              {T.log}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
