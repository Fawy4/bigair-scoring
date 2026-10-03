"use client";

import { useMemo, useState } from "react";
import { HeadControlTab } from "@/components/live/head-control-tab";
import { HeadConsole } from "@/components/live/head-console";
import { ImpressionCard } from "@/components/live/impression-card";
import { JudgeQueue } from "@/components/live/judge-queue";
import { PhoneFrame } from "@/components/live/phone-frame";
import { ScreenHeader } from "@/components/live/screen-header";
import { AttemptLogger, enabledIdsOf } from "@/components/live/attempt-logger";
import { categoryLabel, impressionRiders, judgeQueue, KOTA, previewVocab, previewView } from "@/lib/live/design-fixtures";
import { formatPadValue } from "@/lib/live/score-pad";
import { copy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

const S = copy.design.screens;
const NAMES = copy.design.sections;

export const JudgeLive = () => (
  <PhoneFrame id="judge-live" title={NAMES["judge-live"]} note={S.judgeLive}>
    <JudgeQueue />
  </PhoneFrame>
);
export const JudgeDetails = () => (
  <PhoneFrame id="judge-details" title={NAMES["judge-details"]} note={S.judgeDetails}>
    <JudgeQueue startDetails />
  </PhoneFrame>
);

/** The spotter's phone: the riders in one row, direction and multiplier, the builder in vertical lists, and CRASH and Log fixed at the bottom. The real builder and composer; nothing is saved. */
export function SpotterLive() {
  const live = useMemo(() => judgeQueue(), []);
  const vocab = useMemo(() => previewVocab(), []);
  const view = useMemo(() => previewView(), []);
  const enabled = useMemo(() => enabledIdsOf(view), [view]);
  const [counts, setCounts] = useState(live.riders.map((r) => r.attempts));
  return (
    <PhoneFrame id="spotter-live" title={NAMES["spotter-live"]} note={S.spotterLive}>
      <ScreenHeader heatName={live.heatName} seat="Spotter 1" remainingMs={live.remainingMs} />
      <AttemptLogger
        riders={live.riders.map((r, i) => ({ id: r.id, label: r.label, attempts: counts[i], max: r.max }))}
        vocab={vocab}
        view={view}
        enabledIds={enabled}
        canLog
        categoryLabelOf={categoryLabel}
        onLog={(id) => {
          setCounts((c) => c.map((n, i) => (live.riders[i].id === id ? Math.min(n + 1, live.riders[i].max ?? n + 1) : n)));
          return `preview-${Date.now()}`;
        }}
        onUndo={() => {}}
      />
    </PhoneFrame>
  );
}

/** The judge's phone after the heat: Impression / Variety score per rider, with the compact heat summary above the pad. */
export function JudgeEnd() {
  const riders = useMemo(() => impressionRiders(), []);
  const [values, setValues] = useState<Record<string, number | null>>(() => Object.fromEntries(riders.map((r) => [r.id, r.initialValue])));
  const [submitted, setSubmitted] = useState(false);
  const [saved, setSaved] = useState<string | null>(copy.live.saved.impression("7.5", "RED", "Impression"));
  const scale = KOTA.heat.impression!.scale;
  const live = useMemo(() => judgeQueue(), []);
  return (
    <PhoneFrame id="judge-end" title={NAMES["judge-end"]} note={S.judgeEnd}>
      <ScreenHeader heatName={live.heatName} seat={live.seat} remainingMs={0} timerState="ended" />
      <div data-testid="screen-body" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-1.5">
        <ImpressionCard
          riders={riders}
          scale={scale}
          values={values}
          submitted={submitted}
          caption={<span className="block font-semibold text-beach-ink">{saved ?? copy.live.saved.waiting}</span>}
          onChange={(id, v) => {
            setValues((p) => ({ ...p, [id]: v }));
            setSaved(copy.live.saved.impression(formatPadValue(v, scale), riders.find((r) => r.id === id)!.label.primary.text, "Impression"));
          }}
          onSubmit={() => setSubmitted(true)}
        />
      </div>
    </PhoneFrame>
  );
}

/** The head judge who also scores: one login, two tabs. Score is exactly a judge's queue; Control has the heat's buttons. */
function HeadPhone({ id, start }: { id: "head-score" | "head-control"; start: "score" | "control" }) {
  const [tab, setTab] = useState<"score" | "control">(start);
  const T = copy.live.tabs;
  return (
    <PhoneFrame id={id} title={NAMES[id]} note={id === "head-score" ? S.headScore : S.headControl}>
      <div role="tablist" aria-label={T.label} className="grid grid-cols-2 border-b border-beach-line bg-beach-bg">
        {(["score", "control"] as const).map((t) => (
          <button key={t} type="button" role="tab" data-tab={t} aria-selected={tab === t} onClick={() => setTab(t)} className={cn("min-h-tap text-body font-semibold", tab === t ? "border-b-2 border-beach-accent text-beach-ink" : "border-b-2 border-transparent text-beach-muted")}>
            {t === "score" ? T.score : T.control}
          </button>
        ))}
      </div>
      {tab === "score" ? <JudgeQueue /> : <HeadControlTab />}
    </PhoneFrame>
  );
}
export const HeadScore = () => <HeadPhone id="head-score" start="score" />;
export const HeadControl = () => <HeadPhone id="head-control" start="control" />;

/** The laptop console: a working tool in a laptop-wide box that scrolls inside itself on a small screen. */
export function HeadLaptop() {
  return (
    <section id="head-laptop" data-testid="section-head-laptop" className="flex scroll-mt-16 flex-col gap-1">
      <h2 className="text-heading font-semibold">{NAMES["head-laptop"]}</h2>
      <p className="text-small font-medium text-beach-muted">{S.headLaptop}</p>
      <div data-testid="laptop-frame" className="overflow-x-auto rounded-card border border-beach-line bg-beach-bg">
        <HeadConsole />
      </div>
    </section>
  );
}
