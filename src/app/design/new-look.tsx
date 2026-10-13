"use client";

import { useMemo, useState } from "react";
import { AttemptLogger, enabledIdsOf, type LoggerRider } from "@/components/live/attempt-logger";
import { HeadControlTab } from "@/components/live/head-control-tab";
import { JudgeQueue } from "@/components/live/judge-queue";
import { ThemedColumn, ThemedPhone } from "@/components/live/phone-frame";
import type { FlagStripModel } from "@/components/live/flag-strip";
import { DEFAULT_FLAGS } from "@/lib/schemas/flags";
import { RiderSheetView, ViewSwitch } from "@/components/live/rider-sheet";
import { ScreenHeader } from "@/components/live/screen-header";
import { SpotterSheetView } from "@/components/live/spotter-sheet";
import { PillSwitch } from "@/components/live/chip";
import { designSheetLines, designSpotterAttempts } from "@/lib/live/design-sheets";
import { judgeQueue, KOTA, previewVocab, previewView } from "@/lib/live/design-fixtures";
import type { SheetLine } from "@/lib/live/rider-sheet";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const N = copy.design.newLook;

function Pair({ id, title, note, children }: { id: string; title: string; note: string; children: () => React.ReactNode }) {
  return (
    <section id={id} data-testid={`section-${id}`} className="flex scroll-mt-16 flex-col gap-1">
      <h2 className="text-heading font-bold uppercase tracking-wide">{title}</h2>
      <p className="text-small font-medium text-beach-muted">{note}</p>
      <div className="flex flex-wrap items-start justify-center gap-6">
        {(["day", "dark"] as const).map((t) => (
          <div key={t} className="flex w-full flex-col gap-1 md:w-auto">
            <p className="text-small font-bold text-beach-muted">{t === "day" ? copy.design.day : copy.design.dark}</p>
            <ThemedPhone theme={t} label={`${title} — ${t === "day" ? copy.design.day : copy.design.dark}`}>
              {children()}
            </ThemedPhone>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The judge's Rider sheet: header, rider cards and all 7 lines. Scores typed here stay on the page only. */
function JudgeSheetDemo() {
  const q = useMemo(() => judgeQueue(), []);
  const [lines, setLines] = useState<Record<string, SheetLine[]>>(() => designSheetLines());
  const [view, setView] = useState<"queue" | "sheet">("sheet");
  const change = (riderId: string, n: number, f: (l: SheetLine) => SheetLine) => setLines((all) => ({ ...all, [riderId]: all[riderId].map((l) => (l.n === n ? f(l) : l)) }));
  if (view === "queue") return <JudgeQueue />;
  return (
    <RiderSheetView
      heatName={q.heatName}
      seat={q.seat}
      remainingMs={q.remainingMs}
      switcher={<ViewSwitch view={view} onChange={setView} />}
      riders={q.riders}
      lines={lines}
      scale={KOTA.trick.scale}
      onScore={(id, l, v) => change(id, l.n, (x) => (x.kind === "empty" ? { ...x, pending: v } : { ...x, mine: v }))}
      onMissed={(id, l) => change(id, l.n, (x) => (x.kind === "empty" ? { ...x, pending: "missed" } : { ...x, mine: "missed" }))}
      onClear={(id, l) => change(id, l.n, (x) => ({ ...x, pending: null }))}
      onFlag={() => {}}
    />
  );
}

/** The spotter's Rider sheet: the same header, the rider cards and 7 lines. */
function SpotterSheetDemo() {
  const q = useMemo(() => judgeQueue(), []);
  const vocab = useMemo(() => previewVocab(), []);
  const view = useMemo(() => previewView(), []);
  const enabled = useMemo(() => enabledIdsOf(view), [view]);
  const attempts = useMemo(() => designSpotterAttempts(), []);
  const [mode, setMode] = useState<"sheet" | "list">("sheet");
  const riders: LoggerRider[] = q.riders.map((r) => ({ id: r.id, label: r.label, attempts: attempts.filter((a) => a.entryId === r.id).length, max: r.max }));
  const switcher = (
    <PillSwitch
      label={copy.spotterSheet.switchLabel}
      testId="view-switch"
      value={mode}
      onChange={setMode}
      options={[
        { key: "sheet", text: copy.spotterSheet.sheet },
        { key: "list", text: copy.spotterSheet.list },
      ]}
    />
  );
  return (
    <>
      <ScreenHeader heatName={q.heatName} seat="Spotter 1" remainingMs={q.remainingMs} />
      {mode === "sheet" ? (
        <SpotterSheetView riders={riders} vocab={vocab} enabledIds={enabled} cap={7} attempts={attempts} queued={[]} changing={new Set()} canLog onLog={(id) => `design-${id}-${Date.now()}`} onEdit={() => {}} topSlot={switcher} />
      ) : (
        <AttemptLogger topSlot={switcher} riders={riders} vocab={vocab} view={view} enabledIds={enabled} canLog categoryLabelOf={(k) => (k ? (copy.trickBase.categoryLabels[k] ?? k) : "")} onLog={(id) => `design-${id}`} onUndo={() => {}} />
      )}
    </>
  );
}

/** The head judge who also scores: Score and Control tabs. */
function HeadPhoneDemo() {
  const [tab, setTab] = useState<"score" | "control">("control");
  const T = copy.live.tabs;
  return (
    <>
      <div role="tablist" aria-label={T.label} className="grid grid-cols-2 border-b border-beach-line bg-beach-bg">
        {(["score", "control"] as const).map((t) => (
          <button key={t} type="button" role="tab" data-tab={t} aria-selected={tab === t} onClick={() => setTab(t)} className={cn("min-h-tap text-body font-bold", tab === t ? "border-b-4 border-beach-selected text-beach-ink" : "border-b-4 border-transparent text-beach-muted")}>
            {t === "score" ? T.score : T.control}
          </button>
        ))}
      </div>
      {tab === "score" ? <JudgeQueue /> : <HeadControlTab />}
    </>
  );
}

/** The composed screens of the New look, each in Day and in Dark: Judge — Rider sheet, Spotter — Rider sheet, Head judge — phone. (The console and an organiser step follow below.) */
export function NewLookScreens() {
  return (
    <>
      <p className="text-small font-medium text-beach-muted">{N.intro}</p>
      <Pair id="look-judge-sheet" title={N.judgeSheet} note={N.judgeSheetNote}>
        {() => <JudgeSheetDemo />}
      </Pair>
      <Pair id="look-spotter-sheet" title={N.spotterSheet} note={N.spotterSheetNote}>
        {() => <SpotterSheetDemo />}
      </Pair>
      <Pair id="look-head-phone" title={N.headPhone} note={N.headPhoneNote}>
        {() => <HeadPhoneDemo />}
      </Pair>
    </>
  );
}

/** The header in each flag state, the new scoreboard bar next to the previous light header, in Daylight and in Dark, so the two can be compared. */
export function FlagHeaderComparison() {
  const st = DEFAULT_FLAGS.states;
  const model = (kind: "before_start" | "running" | "last_minute" | "stopped", words: string, countdownMs: number | null): FlagStripModel => ({
    state: { kind, why: kind === "stopped" ? "finished" : null, label: st[kind].label, colour: st[kind].colour, countdownMs, startsAtMs: null, prestartSec: null, inPrestart: false },
    words,
    heatName: "Pro Men · R1 · Heat 3",
    heatShort: "Heat 3",
  });
  const rows: Array<[string, FlagStripModel]> = [
    ["Yellow — before the start", model("before_start", st.before_start.label, 58_000)],
    ["Green — running", model("running", st.running.label, 330_000)],
    ["Yellow — last minute", model("last_minute", st.last_minute.label, 48_000)],
    ["Red — finished", model("stopped", copy.flags.why.finished, null)],
  ];
  return (
    <section id="look-flag-header" data-testid="section-look-flag-header" className="flex scroll-mt-16 flex-col gap-2">
      <h2 className="text-heading font-bold">{N.flagHeader}</h2>
      <p className="text-small font-medium text-beach-muted">{N.flagHeaderNote}</p>
      {(["day", "dark"] as const).map((t) => (
        <div key={t} className="flex flex-col gap-1">
          <p className="text-small font-bold text-beach-muted">{t === "day" ? copy.design.day : copy.design.dark}</p>
          <div className="grid grid-cols-[auto_auto] justify-start gap-x-4 gap-y-3">
            <p className="text-small font-bold">{N.flagNew}</p>
            <p className="text-small font-bold">{N.flagPrevious}</p>
            {rows.map(([label, m]) => (
              <div key={label} className="contents">
                {[false, true].map((plain) => (
                  <div key={String(plain)} className="flex flex-col gap-0.5">
                    <ThemedColumn theme={t}>
                      <ScreenHeader heatName="Pro Men · R1 · Heat 3" seat="Judge 1" remainingMs={330_000} flag={m} plain={plain} />
                    </ThemedColumn>
                    <p className="text-small font-medium text-beach-muted">{label}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
