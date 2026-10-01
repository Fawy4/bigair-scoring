"use client";

import { useMemo, useState } from "react";
import { HeadControlTab } from "@/components/live/head-control-tab";
import { HeadConsole } from "@/components/live/head-console";
import { ImpressionCard } from "@/components/live/impression-card";
import { JudgeQueue } from "@/components/live/judge-queue";
import { PhoneFrame } from "@/components/live/phone-frame";
import { RiderTile } from "@/components/live/rider-tile";
import { ScreenHeader } from "@/components/live/screen-header";
import { TrickBuilder, type BuilderSelection } from "@/components/live/trick-builder";
import { categoryLabel, impressionRiders, judgeQueue, KOTA, previewBlocks, previewCompose } from "@/lib/live/design-fixtures";
import { formatPadValue } from "@/lib/live/score-pad";
import type { FamilyKey } from "@/lib/trick-base";
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

const EMPTY: BuilderSelection = { direction: null, multiplier: null, base: null, addons: [] };

/** The spotter's phone: the riders in one row, direction and multiplier, the builder in vertical lists, and CRASH and Log fixed at the bottom. */
export function SpotterLive() {
  const live = useMemo(() => judgeQueue(), []);
  const blocks = useMemo(() => previewBlocks(), []);
  const [selected, setSelected] = useState(0);
  const [sel, setSel] = useState<BuilderSelection>(EMPTY);
  const [logged, setLogged] = useState<string | null>(null);
  const [counts, setCounts] = useState(live.riders.map((r) => r.attempts));
  const composed = previewCompose(sel);
  const word = live.riders[selected].label.primary.text;
  const pick = (family: FamilyKey, key: string) =>
    setSel((s) => {
      if (family === "direction" || family === "multiplier" || family === "base") return { ...s, [family]: s[family] === key ? null : key };
      return { ...s, addons: s.addons.includes(key) ? s.addons.filter((k) => k !== key) : [...s.addons, key] };
    });
  const done = () => {
    setLogged(copy.live.saved.logged(word, counts[selected] + 1));
    setCounts((c) => c.map((n, i) => (i === selected ? Math.min(n + 1, live.riders[i].max) : n)));
    setSel(EMPTY);
  };
  return (
    <PhoneFrame id="spotter-live" title={NAMES["spotter-live"]} note={S.spotterLive}>
      <ScreenHeader heatName={live.heatName} seat="Spotter 1" remainingMs={live.remainingMs} />
      <div className="flex flex-col gap-0.5 px-2 pt-1.5">
        <div role="group" aria-label={copy.live.tile.strip} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${live.riders.length}, minmax(0, 1fr))` }}>
          {live.riders.map((r, i) => (
            <RiderTile key={r.id} compact lockWhenOut label={r.label} attempts={counts[i]} max={r.max} selected={selected === i} onSelect={() => setSelected(i)} />
          ))}
        </div>
      </div>
      <TrickBuilder blocks={blocks} selection={sel} onPick={pick} name={composed.name} categoryLabel={categoryLabel(composed.categoryKey)} riderLabelText={word} status={logged} canLog={!!sel.base} onCrash={done} onLog={done} />
    </PhoneFrame>
  );
}

/** The judge's phone after the heat: Impression / Variety score per rider, with the compact heat summary above the pad. */
export function JudgeEnd() {
  const riders = useMemo(() => impressionRiders(), []);
  const [values, setValues] = useState<Record<string, number | null>>(() => Object.fromEntries(riders.map((r) => [r.id, r.initialValue])));
  const [submitted, setSubmitted] = useState(false);
  const [saved, setSaved] = useState<string | null>(copy.live.saved.impression("7.5", "RED"));
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
            setSaved(copy.live.saved.impression(formatPadValue(v, scale), riders.find((r) => r.id === id)!.label.primary.text));
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
