"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Mic, X, Zap } from "lucide-react";
import { Chip } from "./chip";
import type { LoggerRider, LoggedAttempt } from "./attempt-logger";
import { RiderTile } from "./rider-tile";
import { MicStatus } from "./trick-builder";
import { useSpeech } from "./use-speech";
import type { TrickVocab } from "@/lib/engine/tricks";
import {
  applySuggestion,
  commitDecision,
  readTrick,
  spotterLines,
  suggestionsFor,
  toggleDirection,
  type Direction,
  type LoggedAttemptRow,
  type QueuedAttempt,
  type SpotterLine,
} from "@/lib/live/spotter-sheet";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const T = copy.spotterSheet;

/** What the phone sends when a logged line is changed: the whole line as it is now (a later change of the same line replaces an earlier one still waiting). */
export interface LineEdit {
  clientKey: string;
  setTrick: boolean;
  trickName: string | null;
  trickParts: unknown;
  categoryKey: string | null;
  rawText: string | null;
  inputMethod: "text";
  status: "landed" | "crashed";
  direction: Direction | null;
}

export interface SpotterSheetProps {
  riders: LoggerRider[];
  /** Riders this spotter is assigned to; the others are behind "Other riders". */
  assignedIds?: string[];
  vocab: TrickVocab;
  enabledIds: ReadonlySet<string>;
  cap: number | null;
  /** Every attempt of the heat that the phone knows (anyone's), and the ones still waiting on this phone. */
  attempts: Array<LoggedAttemptRow & { entryId: string }>;
  queued: Array<QueuedAttempt & { entryId: string }>;
  /** Client keys of attempts with a change still on its way. */
  changing: ReadonlySet<string>;
  /** False while the heat is not running (a new line cannot be logged; a logged one can still be corrected). */
  canLog: boolean;
  disabledNote?: string | null;
  /** Returns the key of the queued attempt. */
  onLog: (riderId: string, a: LoggedAttempt) => string;
  onEdit: (e: LineEdit) => void;
  /** The switch, drawn above the rider cards. */
  topSlot?: React.ReactNode;
}

const initialText = (l: SpotterLine) => (l.crash && !l.rawText ? (l.trickName ?? "") : (l.rawText ?? l.trickName ?? ""));

/**
 * One numbered line: the attempt number, the trick box, L and R, a Crash toggle, and its state in words. The line logs itself (commitDecision) and, once logged,
 * every change of it updates the same attempt. Only the first empty line takes typing.
 */
function SheetLineRow({
  line,
  riderId,
  vocab,
  enabledIds,
  canLog,
  onLog,
  onEdit,
}: {
  line: SpotterLine;
  riderId: string;
  vocab: TrickVocab;
  enabledIds: ReadonlySet<string>;
  canLog: boolean;
  onLog: (riderId: string, a: LoggedAttempt) => string;
  onEdit: (e: LineEdit) => void;
}) {
  const [text, setText] = useState(() => initialText(line));
  const [dir, setDir] = useState<Direction | null>(line.direction);
  const [crash, setCrash] = useState(line.crash);
  const [focused, setFocused] = useState(false);
  const picked = useRef(false);
  const dirty = useRef(false);
  // the box was emptied with the clear button: it stays empty until a new trick is typed (the attempt keeps its trick meanwhile)
  const cleared = useRef(false);
  const typedAt = useRef(0);
  const ownKey = useRef<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const row = useRef<HTMLLIElement>(null);
  const [tick, setTick] = useState(0);

  const logged = line.state === "logged" || line.state === "saving";
  const mine = line.editable;
  const active = line.state === "active";
  const canType = mine && (logged || (active && canLog));
  const key = line.clientKey ?? ownKey.current;

  // a different attempt on this line (one before it was taken back, or another seat changed it): show what the database has
  useEffect(() => {
    if (line.state === "active") {
      ownKey.current = null;
      return;
    }
    if (line.state === "saving") return;
    if (focused || dirty.current || cleared.current) return;
    setText(initialText(line));
    setDir(line.direction);
    setCrash(line.crash);
  }, [line.state, line.clientKey, line.trickName, line.rawText, line.direction, line.crash, focused]); // eslint-disable-line react-hooks/exhaustive-deps

  // the microphone: the words go into the box as if typed (so the same suggestions, tidy-up and logging rules apply); another line, rider or view stops it
  const speech = useSpeech((t) => {
    onType(t);
    input.current?.focus({ preventScroll: true });
  }, `${riderId}:${line.n}`);

  const suggestions = useMemo(() => suggestionsFor(vocab, enabledIds, text).filter((s) => !s.exact), [vocab, enabledIds, text]);

  /** Logs the line (when it is the empty one) or sends the change (when it is logged). */
  const commit = (over: { text?: string; dir?: Direction | null; crash?: boolean } = {}) => {
    const t = over.text ?? text;
    const d = over.dir !== undefined ? over.dir : dir;
    const c = over.crash ?? crash;
    const read = readTrick(vocab, enabledIds, t, d);
    dirty.current = false;
    const k = line.clientKey ?? ownKey.current;
    if (k) {
      onEdit({ clientKey: k, setTrick: Boolean(t.trim()), trickName: read.trickName, trickParts: read.trickParts, categoryKey: read.categoryKey, rawText: read.rawText, inputMethod: "text", status: c ? "crashed" : "landed", direction: read.direction });
      return;
    }
    if (!c && !t.trim()) return; // L or R alone is not an attempt
    ownKey.current = onLog(riderId, {
      status: c ? "crashed" : "landed",
      trickName: read.trickName,
      direction: read.direction,
      categoryKey: read.categoryKey,
      trickParts: read.trickParts,
      inputMethod: "text",
      rawText: read.rawText,
    });
  };

  // free text that matches no suggestion counts as entered once the typing has been quiet for about 2 seconds
  useEffect(() => {
    if (!dirty.current || !canType) return;
    const d = commitDecision({ text, crash, picked: picked.current, quietMs: Date.now() - typedAt.current, hasOpenSuggestions: suggestions.length > 0 });
    if (d.log) {
      picked.current = false;
      commit();
      return;
    }
    if (d.waitMs === null) return;
    const t = setTimeout(() => setTick((n) => n + 1), d.waitMs + 20);
    return () => clearTimeout(t);
  }, [text, crash, suggestions.length, tick, canType]); // eslint-disable-line react-hooks/exhaustive-deps

  // whatever is being typed stays in view above the keyboard (the screen is as tall as what the keyboard leaves free)
  useEffect(() => {
    if (!focused) return;
    const t = setTimeout(() => row.current?.scrollIntoView({ block: "nearest" }), 250);
    return () => clearTimeout(t);
  }, [focused, suggestions.length]);

  const onType = (v: string) => {
    setText(v);
    cleared.current = false;
    picked.current = false;
    dirty.current = true;
    typedAt.current = Date.now();
  };
  const clearBox = () => {
    setText("");
    cleared.current = true;
    dirty.current = false;
    picked.current = false;
    input.current?.focus();
  };
  const pick = (i: number) => {
    const next = applySuggestion(text, suggestions[i]);
    setText(next);
    picked.current = true;
    dirty.current = false;
    commit({ text: next });
    picked.current = false;
  };
  const tapDirection = (d: Direction) => {
    const next = toggleDirection(dir, d);
    setDir(next);
    if (key) commit({ dir: next });
  };
  const tapCrash = () => {
    const next = !crash;
    setCrash(next);
    setFocused(false); // the box is replaced by the CRASH word (it never gets its blur), so the suggestions go with it
    if (next || key) commit({ crash: next });
  };

  // text typed on a line that is not logged yet, with its suggestions still open: it waits for a tap, and the line says so (never mistaken for a logged one)
  const tapToLog = !logged && active && !crash && Boolean(text.trim()) && suggestions.length > 0;
  const stateWord = line.state === "saving" ? T.states.saving : line.state === "logged" ? T.states.logged : tapToLog ? T.states.tapToLog : T.states.empty;
  const keptTrick = crash ? (readTrick(vocab, enabledIds, text, dir).trickName ?? line.trickName ?? "") : "";
  const dim = line.state === "waiting";
  const freeText = logged && mine && read(line, text, vocab, enabledIds);
  // one row per line: the state is a small tick by the number; the words are kept for a screen reader and show only when something needs saying (a typed trick waiting for a tap, another seat's line, free text)
  const sayState = tapToLog || (logged && !mine) || freeText;

  return (
    <li ref={row} data-testid="spotter-line" data-line={line.n} data-state={line.state} data-crash={crash ? "true" : "false"} className={cn("flex scroll-mt-20 flex-col gap-0 px-2 py-1", dim && "bg-beach-bg text-beach-muted", crash && logged && "bg-beach-bg")}>
      <div className="flex items-center gap-1.5">
        <span className="flex w-6 shrink-0 flex-col items-center leading-none">
          <span data-testid="line-number" className="text-lg font-bold tabular-nums">
            {line.n}
          </span>
          {line.state === "logged" ? <Check aria-hidden data-testid="line-tick" className="mt-1 size-3.5 text-beach-selected" strokeWidth={4} /> : null}
        </span>
        <div role="group" aria-label={T.directionAria(line.n)} className="inline-flex shrink-0 overflow-hidden rounded-full border border-beach-border bg-beach-fill">
          {(["left", "right"] as const).map((d) => (
            <button
              key={d}
              type="button"
              data-testid={d === "left" ? "line-left" : "line-right"}
              aria-label={d === "left" ? T.leftAria(line.n) : T.rightAria(line.n)}
              aria-pressed={dir === d}
              disabled={!canType}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => tapDirection(d)}
              className={cn("inline-flex h-11 w-11 items-center justify-center gap-0.5 text-name font-bold disabled:opacity-50", d === "right" && "border-l border-beach-border", dir === d ? "bg-beach-selected text-beach-on-selected" : "bg-transparent text-beach-ink")}
            >
              {dir === d ? <Check aria-hidden className="size-3.5" strokeWidth={3} /> : null}
              {d === "left" ? T.left : T.right}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          {crash && logged ? (
            <div data-testid="line-crash-word" className="flex min-h-11 flex-col justify-center">
              <span className="inline-flex items-center gap-1 text-name font-bold text-beach-crash">
                <Zap aria-hidden className="size-4" />
                {T.crashWord}
              </span>
              {keptTrick ? (
                <span data-testid="line-kept-trick" className="truncate text-small font-medium text-beach-muted">
                  {T.typedKept(keptTrick)}
                </span>
              ) : null}
            </div>
          ) : (
            <div className="relative">
              <input
                ref={input}
                data-testid="line-trick"
                aria-label={T.trickBox(line.n)}
                placeholder={T.placeholder}
                value={text}
                disabled={!canType}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="sentences"
                spellCheck={false}
                enterKeyHint="done"
                onChange={(e) => onType(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur(); // closes the keyboard; it never logs
                }}
                className="h-11 w-full min-w-0 rounded-full border border-beach-line bg-beach-fill py-0 pl-3 pr-9 text-body font-medium text-ellipsis text-beach-ink placeholder:font-medium placeholder:text-beach-muted disabled:bg-beach-surface"
              />
              {!text && canType && speech.supported ? (
                <button
                  type="button"
                  data-testid="line-mic"
                  aria-label={speech.listening ? copy.live.builder.stopListening : copy.live.builder.speak}
                  aria-pressed={speech.listening}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={speech.toggle}
                  className={cn("absolute right-0 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full", speech.listening ? "bg-beach-selected text-beach-on-selected" : "text-beach-muted")}
                >
                  <Mic aria-hidden className="size-5" strokeWidth={2.5} />
                </button>
              ) : null}
              {text && canType ? (
                <button
                  type="button"
                  data-testid="line-trick-clear"
                  aria-label={T.clearBox(line.n)}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={clearBox}
                  className="absolute right-0 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-beach-muted"
                >
                  <X aria-hidden className="size-5" strokeWidth={2.5} />
                </button>
              ) : null}
            </div>
          )}
        </div>
        <button
          type="button"
          data-testid="line-crash"
          aria-label={T.crashAria(line.n)}
          aria-pressed={crash}
          disabled={!canType}
          onPointerDown={(e) => e.preventDefault()}
          onClick={tapCrash}
          className={cn("inline-flex h-11 w-[4.5rem] shrink-0 items-center justify-center gap-1 rounded-full border border-beach-crash px-1 text-small font-bold disabled:opacity-50", crash ? "bg-beach-crash text-beach-on-crash ring-[3px] ring-beach-ink ring-offset-1 ring-offset-beach-bg" : "bg-transparent text-beach-crash")}
        >
          {crash ? <Check aria-hidden className="size-4" strokeWidth={3} /> : <Zap aria-hidden className="size-4" />}
          {copy.live.builder.crash}
        </button>
      </div>
      <div className={cn("flex items-center justify-between gap-2 pl-[30px] text-small font-medium", !sayState && "sr-only")}>
        <span data-testid="line-state" data-tap-to-log={tapToLog ? "true" : undefined} className={cn(line.state === "logged" || tapToLog ? "font-bold text-beach-ink" : "text-beach-muted")}>
          {stateWord}
        </span>
        {logged && !mine ? <span className="text-beach-muted">{T.othersLine}</span> : null}
        {freeText ? <span className="text-beach-muted">{T.freeTag}</span> : null}
      </div>
      {speech.listening || speech.note ? (
        <div className="pl-[30px]">
          <MicStatus listening={speech.listening} note={speech.note} />
        </div>
      ) : null}
      {focused && !(crash && logged) && suggestions.length > 0 ? (
        <div role="group" aria-label={T.suggestions} data-testid="line-suggestions" className="flex flex-wrap gap-1 pl-[30px]">
          {suggestions.map((s, i) => (
            <Chip key={s.id} data-testid="suggestion" onPointerDown={(e) => e.preventDefault()} onClick={() => pick(i)}>
              {s.label}
            </Chip>
          ))}
        </div>
      ) : null}
    </li>
  );
}

/** A logged line whose words matched nothing: the head judge will check it. */
const read = (line: SpotterLine, text: string, vocab: TrickVocab, enabledIds: ReadonlySet<string>): boolean => line.crash === false && Boolean(text.trim()) && readTrick(vocab, enabledIds, text, null).needsReview;

/**
 * The spotter's Rider sheet: the heat's rider cards across the top and, for the rider tapped, one numbered line per attempt (as many as the division allows;
 * with no limit 10, and "Add attempt" adds one). Nothing needs a Log press: a line logs itself. Attempts logged by anyone appear in order.
 */
export function SpotterSheetView(p: SpotterSheetProps) {
  const [picked, setPicked] = useState(p.riders[0]?.id ?? "");
  const [showOthers, setShowOthers] = useState(false);
  const [added, setAdded] = useState<Record<string, number>>({});
  const rider = p.riders.find((r) => r.id === picked) ?? p.riders[0];
  const assigned = p.assignedIds && p.assignedIds.length > 0 && p.assignedIds.length < p.riders.length ? new Set(p.assignedIds) : null;
  const shown = assigned && !showOthers ? p.riders.filter((r) => assigned.has(r.id)) : p.riders;
  const lines = useMemo(
    () => (rider ? spotterLines({ attempts: p.attempts.filter((a) => a.entryId === rider.id), queued: p.queued.filter((q) => q.entryId === rider.id), cap: p.cap, added: added[rider.id] ?? 0, changing: p.changing }) : []),
    [rider, p.attempts, p.queued, p.cap, added, p.changing],
  );
  const out = rider ? rider.max !== null && rider.attempts >= rider.max : false;
  const note = !p.canLog ? (p.disabledNote ?? null) : out && rider ? T.outOfAttempts(rider.label.primary.text, rider.attempts, rider.max ?? rider.attempts) : null;
  return (
    <div data-testid="screen-body" className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-1.5">
      <div className="pt-1.5">{p.topSlot}</div>
      <div className="sticky top-0 z-10 -mx-2 flex flex-col gap-0.5 bg-beach-bg px-2 pb-1 pt-0.5" data-testid="rider-strip-sticky">
        <div role="group" aria-label={T.strip} data-testid="rider-strip" className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, shown.length)}, minmax(0, 1fr))` }}>
          {shown.map((r) => (
            <RiderTile key={r.id} compact lockWhenOut label={r.label} attempts={r.attempts} max={r.max} selected={rider?.id === r.id} onSelect={() => setPicked(r.id)} />
          ))}
        </div>
        {assigned ? (
          <div className="flex justify-end">
            <Chip data-testid="other-riders" pressed={showOthers} onClick={() => setShowOthers((v) => !v)}>
              {showOthers ? copy.spotter.assignedOnly : copy.spotter.otherRiders}
            </Chip>
          </div>
        ) : null}
      </div>
      {note ? (
        <p role="status" data-testid="sheet-note" className="rounded-2xl bg-beach-surface px-3 py-1 text-small font-bold">
          {note}
        </p>
      ) : null}
      {rider ? (
        <div data-testid="spotter-sheet" className="flex flex-col gap-1.5">
          <h2 data-testid="sheet-heading" className="text-heading font-bold uppercase tracking-wide text-beach-muted">
            {T.sheetFor(rider.label.primary.text)}
          </h2>
          <ol data-testid="sheet-lines" aria-label={T.sheetFor(rider.label.primary.text)} className="flex flex-col divide-y divide-beach-line border-y border-beach-line">
            {lines.map((l) => (
              <SheetLineRow key={`${rider.id}:${l.n}`} line={l} riderId={rider.id} vocab={p.vocab} enabledIds={p.enabledIds} canLog={p.canLog && !out} onLog={p.onLog} onEdit={p.onEdit} />
            ))}
          </ol>
          {p.cap === null ? (
            <Chip data-testid="add-attempt" className="self-start" onClick={() => setAdded((a) => ({ ...a, [rider.id]: (a[rider.id] ?? 0) + 1 }))}>
              {T.addAttempt}
            </Chip>
          ) : null}
        </div>
      ) : (
        <p className="text-body font-medium text-beach-muted">{T.noRider}</p>
      )}
    </div>
  );
}
