"use client";

import { useMemo, useState } from "react";
import { AttemptLogger, enabledIdsOf, type LoggerRider } from "@/components/live/attempt-logger";
import { HeadControlTab } from "@/components/live/head-control-tab";
import { JudgeQueue } from "@/components/live/judge-queue";
import { ThemedPhone } from "@/components/live/phone-frame";
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
