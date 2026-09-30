"use client";

import { useEffect, useRef, useState } from "react";
import { HelpButton } from "@/components/help-button";
import type { LadderColumn } from "@/lib/format-ui/preview";
import { copy, help } from "@/lib/ui-copy";

/** A name you can click to change. Enter or leaving the box saves, Escape cancels, blank goes back to the default. */
function EditableName({ text, defaultText, ariaLabel, fieldLabel, onCommit, className }: { text: string; defaultText: string; ariaLabel: string; fieldLabel: string; onCommit: (name: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) box.current?.select();
  }, [editing]);
  const save = () => {
    setEditing(false);
    const clean = draft.trim();
    if (clean !== text) onCommit(clean === defaultText ? "" : clean);
  };
  if (!editing) {
    return (
      <button
        type="button"
        className={`text-left underline decoration-dotted underline-offset-4 ${className ?? ""}`}
        aria-label={ariaLabel}
        onClick={() => {
          setDraft(text);
          setEditing(true);
        }}
      >
        {text}
      </button>
    );
  }
  return (
    <input
      ref={box}
      aria-label={fieldLabel}
      className="!min-h-[40px] w-40 max-w-full px-2 py-1 text-base font-bold"
      maxLength={40}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}

/**
 * The ladder as a picture: rounds are columns, heats are boxes ("4 riders"), and every column says where its places go.
 * Text and borders only (no colour meaning), so it reads in sunlight and prints in black and white.
 * With `onRenameRound` / `onRenameHeat` a click on a round or heat name renames it; with `onAddRound` every column offers "+ Add round".
 */
export function LadderDiagram({
  columns,
  onRenameRound,
  onRenameHeat,
  onAddRound,
}: {
  columns: LadderColumn[];
  onRenameRound?: (roundId: string, name: string) => void;
  onRenameHeat?: (heatId: string, name: string) => void;
  /** `afterId` is the round the new one follows (null = before every round). */
  onAddRound?: (afterId: string | null) => void;
}) {
  if (columns.length === 0) return null;
  const heats = columns.reduce((s, c) => s + c.heats.filter((h) => !h.advancing).length, 0);
  const editable = Boolean(onRenameRound || onRenameHeat);
  return (
    <figure data-testid="ladder-diagram" aria-label={copy.ladder.label} className="flex flex-col gap-2">
      <figcaption className="flex flex-wrap items-center gap-2 text-base font-extrabold">
        <span>
          {copy.ladder.label}: {copy.ladder.title(columns.length, heats)}
        </span>
        {editable ? <HelpButton what={copy.formatSimple.renameHint} help={help["format.rename"]} /> : null}
      </figcaption>
      {editable ? <p className="text-sm font-semibold">{copy.formatSimple.renameHint}</p> : null}
      <ol className="flex items-stretch gap-2 overflow-x-auto pb-2">
        {columns.map((c, i) => (
          <li key={c.id} className="flex items-stretch gap-2">
            <div className="flex min-w-40 flex-col gap-2 rounded-lg border-2 border-[#111] p-2" data-testid="ladder-round">
              <p className="flex flex-wrap items-baseline gap-1 text-base font-extrabold">
                {c.shortName.length > 4 ? null : <span>{c.shortName} ·</span>}
                {onRenameRound ? (
                  <EditableName text={c.name} defaultText={c.defaultName} ariaLabel={copy.formatSimple.renameRound(c.name)} fieldLabel={copy.formatSimple.renameField(c.name)} onCommit={(n) => onRenameRound(c.id, n)} className="font-extrabold" />
                ) : (
                  <span className="font-semibold">{c.name}</span>
                )}
              </p>
              <p className="text-sm font-semibold">{c.summary}</p>
              <ul className="flex flex-col gap-1">
                {c.heats.map((h) => (
                  <li key={h.id} className="rounded border-2 border-[#111] px-2 py-1" data-testid="ladder-heat">
                    <span className="flex flex-wrap items-baseline gap-1 text-base font-bold">
                      {onRenameHeat ? (
                        <EditableName text={h.name} defaultText={h.defaultName} ariaLabel={copy.formatSimple.renameHeat(h.name)} fieldLabel={copy.formatSimple.renameField(h.name)} onCommit={(n) => onRenameHeat(h.id, n)} className="font-bold" />
                      ) : (
                        <span>{h.name}</span>
                      )}
                      <span>: {h.advancing ? copy.ladder.advancesWithoutRiding : copy.ladder.heatBox(h.size)}</span>
                    </span>
                    {h.from.length > 0 ? (
                      <span className="block text-sm font-semibold" data-testid="ladder-from">
                        {h.from.join(" · ")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <ul className="mt-auto flex flex-col gap-0.5 border-t-2 border-[#111] pt-2 text-sm font-bold">
                {c.routes.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              {onAddRound ? (
                <button type="button" className="btn" onClick={() => onAddRound(c.id)} aria-label={copy.formatSimple.addRoundAfter(c.name)}>
                  {copy.formatSimple.addRound}
                </button>
              ) : null}
            </div>
            {i < columns.length - 1 ? (
              <span aria-hidden className="flex items-center text-2xl font-extrabold">
                {copy.ladder.arrow}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </figure>
  );
}
