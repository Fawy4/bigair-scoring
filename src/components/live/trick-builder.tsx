"use client";

import { Mic, X, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Chip } from "./chip";
import { composeTrick, type BuilderState, type TrickVocab } from "@/lib/engine/tricks";
import { blockId, type Block, type FamilyKey } from "@/lib/trick-base";
import type { FamilyView } from "@/lib/trick-base/layout";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const ROW_FAMILIES: FamilyKey[] = ["direction", "multiplier"];

export interface BuilderTyped {
  value: string;
  onChange: (v: string) => void;
  /** Read the typed text into blocks (Enter does the same). */
  onRead: () => void;
  micSupported: boolean;
  listening: boolean;
  onMic: () => void;
  micNote?: string | null;
}

/**
 * The spotter's trick builder (docs/08 §1G-3), compact. A trick is built in the order it is done: tap a direction, then blocks one after the other; a
 * multiplier tapped after a block belongs to it. The composed name is the sequence, each block a one-tap token that removes it. Families only decide where a
 * block is shown (the division's spotter layout: the order of the families and blocks, favourites on top). CRASH asks once; Log does not.
 * Presentational: the parent owns the sequence, the typed text and the speech.
 */
export function TrickBuilder({
  view,
  vocab,
  state,
  freeText,
  onTapDirection,
  onTapBlock,
  onTapMultiplier,
  onRemove,
  onClearFreeText,
  categoryLabel,
  riderLabelText,
  status,
  statusAction,
  onCrash,
  onLog,
  canLog,
  canCrash = true,
  typed,
  note,
}: {
  view: FamilyView[];
  vocab: TrickVocab;
  state: BuilderState;
  freeText: string;
  onTapDirection: (key: string) => void;
  onTapBlock: (id: string) => void;
  onTapMultiplier: (key: string) => void;
  onRemove: (index: number) => void;
  onClearFreeText: () => void;
  categoryLabel: string;
  riderLabelText: string;
  /** The persistent line after Log ("Logged — RED — attempt 7"), shown until the next trick is started. */
  status?: string | null;
  /** Something that goes with the status line (the Undo button). */
  statusAction?: React.ReactNode;
  onCrash: () => void;
  onLog: () => void;
  canLog: boolean;
  /** False when the rider is out of attempts or the heat is not running. */
  canCrash?: boolean;
  typed?: BuilderTyped;
  /** A one-line note above the lists (why Log is off). */
  note?: string | null;
}) {
  const T = copy.live.builder;
  const [confirmCrash, setConfirmCrash] = useState(false);
  const strip = useRef<HTMLDivElement>(null);
  const name = composeTrick(vocab, { direction: state.direction, items: state.items, freeText }).name;
  const last = state.items.at(-1);
  const count = (id: string) => state.items.filter((i) => i.id === id).length;
  const blockOf = (id: string): Block | undefined => view.flatMap((v) => v.blocks).find((b) => blockId(b) === id);
  const labelOf = (id: string) => vocab.blocks.find((b) => b.id === id)?.label ?? blockOf(id)?.label ?? id;
  const multLabel = (key: string) => vocab.blocks.find((b) => b.family === "multiplier" && b.key === key)?.label ?? key;
  const hidden = vocab.hideMultiplierWhen;
  useEffect(() => {
    strip.current?.scrollTo({ left: strip.current.scrollWidth });
  }, [state.items.length, freeText]);

  const chip = (b: Block) => {
    const on = b.family === "direction" ? state.direction === b.key : b.family === "multiplier" ? last?.multiplier === b.key || state.pendingMultiplier === b.key : count(blockId(b)) > 0;
    const tap = () => (b.family === "direction" ? onTapDirection(b.key) : b.family === "multiplier" ? onTapMultiplier(b.key) : onTapBlock(blockId(b)));
    return (
      <Chip key={blockId(b)} data-block={blockId(b)} pressed={on} onClick={tap}>
        {b.label}
      </Chip>
    );
  };
  /** A row of a list (not a chip): the whole width of its column, one line (two when the name is long). */
  const row = (b: Block) => {
    const n = count(blockId(b));
    return (
      <button
        key={blockId(b)}
        type="button"
        data-block={blockId(b)}
        data-row
        data-count={n}
        aria-pressed={n > 0}
        onClick={() => onTapBlock(blockId(b))}
        className={cn("flex min-h-row w-full shrink-0 items-center justify-between gap-1 rounded-lg border px-2 text-left text-small font-semibold leading-tight", n > 0 ? "border-beach-accent bg-beach-accent text-beach-on-accent" : "border-beach-border bg-beach-bg text-beach-ink")}
      >
        <span className="min-w-0">{b.label}</span>
        {n > 1 ? <span className="shrink-0 tabular-nums">×{n}</span> : null}
      </button>
    );
  };
  const legend = "text-heading font-semibold text-beach-muted";
  const rows = view.filter((v) => ROW_FAMILIES.includes(v.family));
  const lists = view.filter((v) => !ROW_FAMILIES.includes(v.family));
  const [main, ...others] = lists;
  const empty = state.items.length === 0 && !state.direction && !freeText;

  return (
    <div data-testid="trick-builder" className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-1 px-2 py-1" data-testid="builder-body">
        {rows.map((v) => (
          <div key={v.family} className="flex flex-wrap items-center gap-1" role="group" aria-label={v.family === "direction" ? T.direction : v.label}>
            {v.blocks.map(chip)}
            {v.family === "multiplier" && typed ? (
              <>
                <input
                  id="trick-text"
                  aria-label={T.type}
                  value={typed.value}
                  enterKeyHint="go"
                  onChange={(e) => typed.onChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") typed.onRead();
                  }}
                  placeholder={T.typePlaceholder}
                  className="min-h-tap min-w-0 flex-1 rounded-lg border border-beach-border bg-beach-bg px-1.5 text-small font-medium text-beach-ink placeholder:text-beach-muted"
                />
                {typed.value.trim() ? (
                  <Chip variant="accent" data-testid="read-text" onClick={typed.onRead}>
                    {T.read}
                  </Chip>
                ) : null}
                {typed.micSupported ? (
                  <Chip icon={Mic} data-testid="mic-button" aria-label={typed.listening ? T.listening : T.speak} pressed={typed.listening} onClick={typed.onMic} />
                ) : null}
              </>
            ) : null}
          </div>
        ))}
        {typed?.micNote ? (
          <p role="note" className="rounded-lg border border-beach-line bg-beach-surface px-1.5 py-1 text-small font-medium">
            {typed.micNote}
          </p>
        ) : null}
        {note ? (
          <p role="status" data-testid="builder-note" className="rounded-lg border border-beach-line bg-beach-surface px-1.5 py-0.5 text-small font-semibold">
            {note}
          </p>
        ) : null}
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,5fr)_minmax(0,6fr)] grid-rows-[minmax(0,1fr)] gap-1.5">
          {main ? (
            <div role="group" aria-label={main.label} className="flex min-h-0 flex-col" data-testid="base-list">
              <p className={legend}>{main.label}</p>
              <div className="mt-0.5 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">{main.blocks.map(row)}</div>
            </div>
          ) : null}
          <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
            {others.map((v) => (
              <div key={v.family} role="group" aria-label={v.label} className="flex flex-col">
                <p className={legend}>{v.label}</p>
                <div className="mt-0.5 grid grid-cols-2 gap-1">{v.blocks.map(row)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1 border-t border-beach-line bg-beach-bg px-2 pb-1.5 pt-1" data-testid="builder-bar">
        <div data-testid="composed-name" className="flex min-h-[2.75rem] items-center justify-between gap-2 rounded-lg border border-beach-line bg-beach-surface px-1.5 py-0.5">
          {empty && status ? (
            <>
              <p className="min-w-0 flex-1 text-composed font-semibold" role="status">
                {status}
              </p>
              {statusAction}
            </>
          ) : (
            <>
              <p className="sr-only">{name || T.none}</p>
              <div ref={strip} data-testid="sequence" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap" aria-label={T.composed}>
                {empty ? <span className="text-composed font-semibold text-beach-muted">{T.none}</span> : null}
                {state.direction ? <span className="shrink-0 text-composed font-semibold">{vocab.blocks.find((b) => b.family === "direction" && b.key === state.direction)?.label} </span> : null}
                {state.pendingMultiplier && state.pendingMultiplier !== hidden ? <span className="shrink-0 text-composed font-semibold text-beach-muted">{multLabel(state.pendingMultiplier)} </span> : null}
                {state.items.map((item, i) => {
                  const m = item.multiplier && item.multiplier !== hidden ? `${multLabel(item.multiplier)} ` : "";
                  return (
                    <button
                      key={`${item.id}-${i}`}
                      type="button"
                      data-testid="sequence-block"
                      aria-label={T.removeBlock(`${m}${labelOf(item.id)}`)}
                      onClick={() => onRemove(i)}
                      className="inline-flex min-h-tap shrink-0 items-center gap-1 rounded-lg border border-beach-border bg-beach-bg px-1.5 text-composed font-semibold text-beach-ink"
                    >
                      {m}
                      {labelOf(item.id)}
                      <X aria-hidden className="size-3 text-beach-muted" />
                    </button>
                  );
                })}
                {freeText ? (
                  <button type="button" data-testid="free-text" aria-label={T.removeBlock(freeText)} onClick={onClearFreeText} className="inline-flex min-h-tap shrink-0 items-center gap-1 rounded-lg border border-dashed border-beach-border bg-beach-bg px-1.5 text-composed font-semibold text-beach-ink">
                    {freeText}
                    <X aria-hidden className="size-3 text-beach-muted" />
                  </button>
                ) : null}
              </div>
            </>
          )}
          <p className="shrink-0 text-small font-medium text-beach-muted">
            {T.category}: <span className="text-beach-ink">{categoryLabel || copy.live.pad.none}</span>
          </p>
        </div>
        {freeText ? (
          <p data-testid="free-text-note" className="text-small font-semibold text-beach-ink">
            {T.freeTextNote}
          </p>
        ) : null}
        {confirmCrash ? (
          <div role="alertdialog" aria-label={T.crashConfirm(riderLabelText)} className="flex min-h-bar items-center justify-between gap-2 rounded-lg border border-beach-crash bg-beach-surface px-1.5">
            <p className="min-w-0 text-body font-semibold">{T.crashConfirm(riderLabelText)}</p>
            <span className="flex gap-1">
              <Chip variant="danger" data-testid="crash-yes" onClick={() => { setConfirmCrash(false); onCrash(); }}>
                {T.crashYes}
              </Chip>
              <Chip onClick={() => setConfirmCrash(false)}>{T.crashNo}</Chip>
            </span>
          </div>
        ) : (
          <div className="grid min-h-bar grid-cols-2 gap-1.5">
            <button type="button" data-testid="crash-button" disabled={!canCrash} onClick={() => setConfirmCrash(true)} className={cn("inline-flex items-center justify-center gap-1.5 rounded-lg border text-name font-semibold", canCrash ? "border-beach-crash bg-beach-crash text-beach-on-crash" : "border-beach-line bg-beach-surface text-beach-muted")}>
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
