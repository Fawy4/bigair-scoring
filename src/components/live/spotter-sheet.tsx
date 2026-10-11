"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Zap } from "lucide-react";
import { Chip } from "./chip";
import type { LoggerRider, LoggedAttempt } from "./attempt-logger";
import { RiderTile } from "./rider-tile";
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
    if (focused || dirty.current) return;
    setText(initialText(line));
    setDir(line.direction);
    setCrash(line.crash);
  }, [line.state, line.clientKey, line.trickName, line.rawText, line.direction, line.crash, focused]); // eslint-disable-line react-hooks/exhaustive-deps

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
    picked.current = false;
    dirty.current = true;
    typedAt.current = Date.now();
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
    if (next || key) commit({ crash: next });
  };

  const stateWord = line.state === "saving" ? T.states.saving : line.state === "logged" ? T.states.logged : T.states.empty;
  const keptTrick = crash ? (readTrick(vocab, enabledIds, text, dir).trickName ?? line.trickName ?? "") : "";
  const dim = line.state === "waiting";
  const btn = "inline-flex h-14 shrink-0 items-center justify-center rounded-lg text-name font-semibold disabled:opacity-50";

  return (
    <li ref={row} data-testid="spotter-line" data-line={line.n} data-state={line.state} data-crash={crash ? "true" : "false"} className={cn("flex flex-col gap-1 px-2 py-1.5", dim && "bg-beach-bg text-beach-muted", crash && logged && "bg-beach-surface")}>
      <div className="flex items-center gap-1.5">
        <span data-testid="line-number" className="w-6 shrink-0 text-center text-name font-semibold tabular-nums">
          {line.n}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          {crash && logged ? (
            <div data-testid="line-crash-word" className="flex min-h-14 flex-col justify-center">
              <span className="inline-flex items-center gap-1 text-name font-semibold text-beach-crash">
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
            <input
              ref={input}
              data-testid="line-trick"
              aria-label={T.trickBox(line.n)}
              placeholder={T.placeholder}
              value={text}
              disabled={!canType}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="done"
              onChange={(e) => onType(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur(); // closes the keyboard; it never logs
              }}
              className="h-14 min-w-0 rounded-lg border border-beach-border bg-beach-bg px-2 text-body font-semibold text-beach-ink placeholder:font-medium placeholder:text-beach-muted disabled:bg-beach-surface"
            />
          )}
        </div>
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
            className={cn(btn, "w-[3.25rem] gap-0.5", dir === d ? "border-4 border-beach-ink bg-beach-surface text-beach-ink" : "border border-beach-border bg-beach-bg text-beach-ink")}
          >
            {dir === d ? <Check aria-hidden className="size-3.5" strokeWidth={3} /> : null}
            {d === "left" ? T.left : T.right}
          </button>
        ))}
        <button
          type="button"
          data-testid="line-crash"
          aria-label={T.crashAria(line.n)}
          aria-pressed={crash}
          disabled={!canType}
          onPointerDown={(e) => e.preventDefault()}
          onClick={tapCrash}
          className={cn(btn, "w-[4.5rem] gap-1 px-1", crash ? "border border-beach-crash bg-beach-crash text-beach-on-crash" : "border border-beach-border bg-beach-bg text-beach-ink")}
        >
          {crash ? <Check aria-hidden className="size-3.5" strokeWidth={3} /> : null}
          {T.crash}
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 pl-8 text-small font-medium">
        <span data-testid="line-state" className={cn(line.state === "logged" ? "font-semibold text-beach-ink" : "text-beach-muted")}>
          {stateWord}
        </span>
        {logged && !mine ? <span className="text-beach-muted">{T.othersLine}</span> : null}
        {logged && mine && read(line, text, vocab, enabledIds) ? <span className="text-beach-muted">{T.freeTag}</span> : null}
      </div>
      {focused && suggestions.length > 0 ? (
        <div role="group" aria-label={T.suggestions} data-testid="line-suggestions" className="flex flex-wrap gap-1 pl-8">
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
    <div data-testid="screen-body" className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2 py-1.5">
      {p.topSlot}
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
      {note ? (
        <p role="status" data-testid="sheet-note" className="rounded-lg border border-beach-line bg-beach-surface px-1.5 py-0.5 text-small font-semibold">
          {note}
        </p>
      ) : null}
      {rider ? (
        <div data-testid="spotter-sheet" className="flex flex-col gap-1.5">
          <h2 data-testid="sheet-heading" className="text-heading font-semibold text-beach-muted">
            {T.sheetFor(rider.label.primary.text)}
          </h2>
          <ol data-testid="sheet-lines" aria-label={T.sheetFor(rider.label.primary.text)} className="flex flex-col divide-y divide-beach-line rounded-xl border border-beach-line">
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
