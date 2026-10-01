"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chip } from "./chip";
import { RiderTile } from "./rider-tile";
import { TrickBuilder, type BuilderTyped } from "./trick-builder";
import {
  canLog as builderCanLog,
  categoryOf,
  composeTrick,
  emptyBuilder,
  parseTrickText,
  removeTrickItem,
  tapBlock,
  tapDirection,
  tapMultiplier,
  toParts,
  type BuilderState,
  type TrickParts,
  type TrickVocab,
} from "@/lib/engine/tricks";
import type { LabelModel } from "@/lib/identification/rider-label";
import { listenOnce, speechSupported } from "@/lib/live/speech";
import type { FamilyView } from "@/lib/trick-base/layout";
import { blockId, type FamilyKey } from "@/lib/trick-base";
import { copy } from "@/lib/ui-copy";

export interface LoggerRider {
  id: string;
  label: LabelModel;
  /** Attempts used, counting the ones still waiting to be sent. */
  attempts: number;
  max: number | null;
}

export interface LoggedAttempt {
  status: "landed" | "crashed";
  trickName: string | null;
  direction: "left" | "right" | null;
  categoryKey: string | null;
  trickParts: TrickParts;
  inputMethod: "builder" | "text" | "speech";
  rawText: string | null;
}

const UNDO_MS = 10_000;

/**
 * Pick a rider, build the trick by taps, typing or speech, and Log or CRASH (docs/PLAN-phase-5 step 2). The same component serves the spotter's phone, the
 * judge's "Log an attempt" (when the event allows it) and the /design page: it only reports what the person did through `onLog`; the parent decides how an
 * attempt is saved. Out-of-attempts riders are greyed and cannot be logged.
 */
export function AttemptLogger({
  riders,
  assignedIds,
  vocab,
  view,
  enabledIds,
  canLog,
  disabledNote,
  onLog,
  onUndo,
  categoryLabelOf,
  lastSeq,
}: {
  riders: LoggerRider[];
  /** Riders this spotter is assigned to; the others are behind "Other riders". */
  assignedIds?: string[];
  vocab: TrickVocab;
  view: FamilyView[];
  enabledIds: ReadonlySet<string>;
  /** False while the heat is not running (paused, ended, or not started). */
  canLog: boolean;
  disabledNote?: string | null;
  /** Returns the key of the queued attempt, so Undo can take it back. */
  onLog: (riderId: string, a: LoggedAttempt) => string;
  onUndo: (clientKey: string) => void;
  categoryLabelOf: (key: string | null) => string;
  /** Overrides the number shown in the "Logged — RED — attempt n" line (the rider's attempts after this one). */
  lastSeq?: (riderId: string) => number;
}) {
  const T = copy.spotter;
  const [selectedId, setSelectedId] = useState(riders[0]?.id ?? "");
  const [state, setState] = useState<BuilderState>(emptyBuilder());
  const [freeText, setFreeText] = useState("");
  const [raw, setRaw] = useState<{ method: "text" | "speech"; text: string } | null>(null);
  const [typed, setTyped] = useState("");
  const [listening, setListening] = useState(false);
  // only known in the browser: deciding it while rendering would not match what the server drew
  const [micSupported, setMicSupported] = useState(false);
  useEffect(() => setMicSupported(speechSupported()), []);
  const [micNote, setMicNote] = useState<string | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const [logged, setLogged] = useState<{ text: string; key: string; at: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const stopListening = useRef<() => void>(() => {});

  useEffect(() => () => stopListening.current(), []);
  useEffect(() => {
    if (!logged) return;
    const left = UNDO_MS - (Date.now() - logged.at);
    setNow(Date.now());
    const t = setTimeout(() => setNow(Date.now()), Math.max(0, left) + 50);
    return () => clearTimeout(t);
  }, [logged]);

  const selected = riders.find((r) => r.id === selectedId) ?? riders[0];
  const out = selected ? selected.max !== null && selected.attempts >= selected.max : false;
  const word = selected?.label.primary.text ?? "";
  const assigned = assignedIds && assignedIds.length > 0 && assignedIds.length < riders.length ? new Set(assignedIds) : null;
  const shown = assigned && !showOthers ? riders.filter((r) => assigned.has(r.id)) : riders;

  const composed = useMemo(() => composeTrick(vocab, { direction: state.direction, items: state.items, freeText }), [vocab, state, freeText]);
  const category = categoryOf(vocab, state.items.map((i) => i.id));
  const ready = canLog && !out && Boolean(selected) && builderCanLog(state, freeText);

  const reset = () => {
    setState(emptyBuilder());
    setFreeText("");
    setRaw(null);
    setTyped("");
    setMicNote(null);
  };
  const touch = (fn: (s: BuilderState) => BuilderState) => {
    setLogged(null);
    setState(fn);
  };

  const readText = (text: string, method: "text" | "speech") => {
    const t = text.trim();
    if (!t) return;
    const r = parseTrickText(vocab, t, enabledIds);
    setLogged(null);
    setState({ direction: r.parts.direction, items: r.parts.items, pendingMultiplier: null });
    setFreeText(r.parts.freeText ?? "");
    setRaw({ method, text: t });
    setTyped("");
  };

  const record = (status: "landed" | "crashed") => {
    if (!selected) return;
    const dir = state.direction === "left" || state.direction === "right" ? state.direction : null;
    const parts = toParts(state, freeText ? { freeText, needsReview: true } : {});
    const a: LoggedAttempt = {
      status,
      trickName: composed.name || null,
      direction: dir,
      categoryKey: category,
      trickParts: parts,
      inputMethod: raw?.method ?? "builder",
      rawText: raw?.text ?? null,
    };
    const key = onLog(selected.id, a);
    const n = lastSeq ? lastSeq(selected.id) : selected.attempts + 1;
    setLogged({ text: copy.live.saved.logged(word, n), key, at: Date.now() });
    reset();
  };

  const typedProps: BuilderTyped = {
    value: typed,
    onChange: setTyped,
    onRead: () => readText(typed, "text"),
    micSupported,
    listening,
    micNote,
    onMic: () => {
      if (listening) {
        stopListening.current();
        return;
      }
      setMicNote(null);
      setListening(true);
      stopListening.current = listenOnce(
        "en-GB",
        (text) => readText(text, "speech"),
        (error) => {
          setListening(false);
          if (error === "not-allowed" || error === "service-not-allowed") setMicNote(copy.live.builder.micDenied);
          else if (error && error !== "aborted" && error !== "no-speech") setMicNote(copy.live.builder.micFailed);
        },
      );
    },
  };

  const undoLeft = logged ? UNDO_MS - (now - logged.at) : 0;
  const note = !canLog ? (disabledNote ?? null) : out && selected ? T.outOfAttempts(word, selected.attempts, selected.max ?? selected.attempts) : null;

  return (
    <>
      <div className="flex flex-col gap-0.5 px-2 pt-1.5">
        <div role="group" aria-label={copy.live.tile.strip} data-testid="rider-strip" className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, shown.length)}, minmax(0, 1fr))` }}>
          {shown.map((r) => (
            <RiderTile key={r.id} compact lockWhenOut label={r.label} attempts={r.attempts} max={r.max} selected={selected?.id === r.id} onSelect={() => setSelectedId(r.id)} />
          ))}
        </div>
        {assigned ? (
          <div className="flex justify-end">
            <Chip data-testid="other-riders" pressed={showOthers} onClick={() => setShowOthers((v) => !v)}>
              {showOthers ? T.assignedOnly : T.otherRiders}
            </Chip>
          </div>
        ) : null}
      </div>
      <TrickBuilder
        view={view}
        vocab={vocab}
        state={state}
        freeText={freeText}
        onTapDirection={(k) => touch((s) => tapDirection(s, k))}
        onTapBlock={(id) => touch((s) => tapBlock(vocab, s, id))}
        onTapMultiplier={(k) => touch((s) => tapMultiplier(vocab, s, k))}
        onRemove={(i) => touch((s) => removeTrickItem(s, i))}
        onClearFreeText={() => setFreeText("")}
        categoryLabel={categoryLabelOf(category)}
        riderLabelText={word}
        status={logged?.text ?? null}
        statusAction={
          logged && undoLeft > 0 ? (
            <Chip
              data-testid="undo-button"
              onClick={() => {
                onUndo(logged.key);
                setLogged(null);
              }}
            >
              {T.undo}
            </Chip>
          ) : null
        }
        onCrash={() => record("crashed")}
        onLog={() => record("landed")}
        canLog={ready}
        canCrash={canLog && !out && Boolean(selected)}
        typed={typedProps}
        note={note}
      />
    </>
  );
}

/** The blocks the division has switched on, as the reader takes them. */
export function enabledIdsOf(view: FamilyView[]): Set<string> {
  return new Set(view.flatMap((v) => v.blocks.map(blockId)));
}

export type { FamilyKey };
