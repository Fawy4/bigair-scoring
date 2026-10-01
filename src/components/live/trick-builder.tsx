"use client";

import { useState } from "react";
import { Mic, Zap } from "lucide-react";
import { Chip } from "./chip";
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
 * The spotter's trick builder, compact (owner, round 4): a row for Left / Right, a row for the multipliers (with the type field and the microphone),
 * then the base tricks as a compact list on the left and the add-ons and then the grabs in two columns on the right. The composed name (two lines at most)
 * and CRASH and Log, one row 44 px high, are fixed at the bottom. In Normal the common tricks are loggable without scrolling. The order of the blocks is the
 * division's trick base order (drag and drop in the Divisions step; 5b). CRASH asks once. Presentational: the parent owns the selection and the name.
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
  const chip = (b: Block) => (
    <Chip key={blockId(b)} data-block={blockId(b)} pressed={isOn(b)} onClick={() => onPick(b.family, b.key)}>
      {b.label}
    </Chip>
  );
  /** A row of a list (not a chip): the whole width of its column, one line (two when the name is long). */
  const row = (b: Block) => (
    <button
      key={blockId(b)}
      type="button"
      data-block={blockId(b)}
      data-row
      aria-pressed={isOn(b)}
      onClick={() => onPick(b.family, b.key)}
      className={cn("flex min-h-row w-full shrink-0 items-center rounded-lg border px-2 text-left text-small font-semibold leading-tight", isOn(b) ? "border-beach-accent bg-beach-accent text-beach-on-accent" : "border-beach-border bg-beach-bg text-beach-ink")}
    >
      {b.label}
    </button>
  );
  const legend = "text-heading font-semibold text-beach-muted";
  return (
    <div data-testid="trick-builder" className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-1 px-2 py-1" data-testid="builder-body">
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label={T.direction}>
          {of("direction").map(chip)}
        </div>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label={copy.trickBase.families.multiplier}>
          {of("multiplier").map(chip)}
          <input id="trick-text" aria-label={T.type} value={text} onChange={(e) => setText(e.target.value)} placeholder={T.typePlaceholder} className="min-h-tap min-w-0 flex-1 rounded-lg border border-beach-border bg-beach-bg px-1.5 text-small font-medium text-beach-ink placeholder:text-beach-muted" />
          <Chip icon={Mic} aria-label={T.speak} aria-expanded={micNote} onClick={() => setMicNote((v) => !v)} />
        </div>
        {micNote ? (
          <p role="note" className="rounded-lg border border-beach-line bg-beach-surface px-1.5 py-1 text-small font-medium">
            {T.speakOff}
          </p>
        ) : null}
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,5fr)_minmax(0,6fr)] grid-rows-[minmax(0,1fr)] gap-1.5">
          <div role="group" aria-label={copy.trickBase.families.base} className="flex min-h-0 flex-col" data-testid="base-list">
            <p className={legend}>{copy.trickBase.families.base}</p>
            <div className="mt-0.5 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">{of("base").map(row)}</div>
          </div>
          <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
            <div role="group" aria-label={copy.trickBase.families.addon} className="flex flex-col">
              <p className={legend}>{copy.trickBase.families.addon}</p>
              <div className="mt-0.5 grid grid-cols-2 gap-1">{of("addon").map(row)}</div>
            </div>
            <div role="group" aria-label={copy.trickBase.families.grab_landing} className="flex flex-col">
              <p className={legend}>{copy.trickBase.families.grab_landing}</p>
              <div className="mt-0.5 grid grid-cols-2 gap-1">{of("grab_landing").map(row)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1 border-t border-beach-line bg-beach-bg px-2 pb-1.5 pt-1" data-testid="builder-bar">
        <div data-testid="composed-name" className="flex items-start justify-between gap-2 rounded-lg border border-beach-line bg-beach-surface px-1.5 py-0.5">
          <p className="line-clamp-2 min-h-[2.4em] min-w-0 text-composed font-semibold">{name || status || T.none}</p>
          <p className="shrink-0 text-small font-medium text-beach-muted">
            {T.category}: <span className="text-beach-ink">{categoryLabel || copy.live.pad.none}</span>
          </p>
        </div>
        {confirmCrash ? (
          <div role="alertdialog" aria-label={T.crashConfirm(riderLabelText)} className="flex min-h-bar items-center justify-between gap-2 rounded-lg border border-beach-crash bg-beach-surface px-1.5">
            <p className="min-w-0 text-body font-semibold">{T.crashConfirm(riderLabelText)}</p>
            <span className="flex gap-1">
              <Chip variant="danger" onClick={() => { setConfirmCrash(false); onCrash(); }}>
                {T.crashYes}
              </Chip>
              <Chip onClick={() => setConfirmCrash(false)}>{T.crashNo}</Chip>
            </span>
          </div>
        ) : (
          <div className="grid min-h-bar grid-cols-2 gap-1.5">
            <button type="button" data-testid="crash-button" onClick={() => setConfirmCrash(true)} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-beach-crash bg-beach-crash text-name font-semibold text-beach-on-crash">
              <Zap aria-hidden className="size-4" />
              {T.crash}
            </button>
            <button type="button" data-testid="log-button" disabled={!canLog} onClick={onLog} className={cn("inline-flex items-center justify-center rounded-lg border text-name font-semibold", canLog ? "border-beach-accent bg-beach-accent text-beach-on-accent" : "border-beach-line bg-beach-surface text-beach-muted")}>
              {T.log}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
