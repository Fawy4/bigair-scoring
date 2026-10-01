"use client";

import { useMemo, useState } from "react";
import { AttemptCard } from "@/components/live/attempt-card";
import { HeadControls } from "@/components/live/head-controls";
import { ImpressionCard } from "@/components/live/impression-card";
import { PhoneFrame } from "@/components/live/phone-frame";
import { RiderSheet } from "@/components/live/rider-sheet";
import { RiderTile } from "@/components/live/rider-tile";
import { ScorePad } from "@/components/live/score-pad";
import { ScreenHeader } from "@/components/live/screen-header";
import { TrickBuilder, type BuilderSelection } from "@/components/live/trick-builder";
import { categoryLabel, headPhone, impressionRiders, judgeLive, KOTA, previewBlocks, previewCompose } from "@/lib/live/design-fixtures";
import { formatPadValue } from "@/lib/live/score-pad";
import type { FamilyKey } from "@/lib/trick-base";
import { copy } from "@/lib/ui-copy";

const S = copy.design.screens;
const NAMES = copy.design.sections;

/** The judge's phone, as 5b will compose it. Used three times: the default view, Details on, and with a rider's sheet open. */
function JudgeScreen({ id, note, startDetails = false, startSheet = false }: { id: string; note: string; startDetails?: boolean; startSheet?: boolean }) {
  const live = useMemo(() => judgeLive(), []);
  const [details, setDetails] = useState(startDetails);
  const [sheet, setSheet] = useState(startSheet);
  const [selected, setSelected] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  const [missed, setMissed] = useState(false);
  const [saved, setSaved] = useState<string | null>(copy.live.saved.line("8.125", "RED", 5));
  const scale = KOTA.trick.scale;
  const word = live.riders[0].label.primary.text;
  return (
    <PhoneFrame id={id} title={NAMES[id]} note={note}>
      <ScreenHeader heatName={live.heatName} seat={live.seat} remainingMs={live.remainingMs} details={details} onToggleDetails={() => { setDetails((d) => !d); setSheet(false); }} />
      <div data-testid="screen-body" className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2 py-1.5">
        {details ? (
          <div data-testid="details-list" className="flex flex-col gap-1.5">
            {live.details.map((a) => (
              <AttemptCard key={a.number} compact number={a.number} label={a.label} riderName={a.riderName} trick={a.trick} status={a.status} direction={a.direction} myScoreLabel={a.number === 6 && score !== null ? formatPadValue(score, scale) : a.myScoreLabel} repeat={a.repeat} />
            ))}
          </div>
        ) : (
          <>
            <div role="group" aria-label={copy.live.tile.strip} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${live.riders.length}, minmax(0, 1fr))` }}>
              {live.riders.map((r, i) => (
                <RiderTile key={r.id} compact label={r.label} attempts={r.attempts} max={r.max} selected={selected === i} onSelect={() => setSelected(i)} />
              ))}
            </div>
            <AttemptCard
              number={live.current.number}
              label={live.current.label}
              riderName={live.current.riderName}
              trick={live.current.trick}
              status="landed"
              direction={live.current.direction}
              missed={missed}
              onOpenRider={() => setSheet(true)}
              onMissed={() => { setMissed(true); setScore(null); setSaved(copy.live.saved.missed(word, 6)); }}
              onFlag={() => undefined}
            >
              <ScorePad
                scale={scale}
                value={score}
                label={copy.live.criteria.trickScore}
                caption={<span data-testid="pad-caption" className="block font-semibold text-beach-ink">{saved ?? copy.live.saved.waiting}</span>}
                onChange={(v) => { setScore(v); setMissed(false); setSaved(copy.live.saved.line(formatPadValue(v, scale), word, 6)); }}
              />
            </AttemptCard>
            <AttemptCard compact number={live.previous.number} label={live.previous.label} riderName={live.previous.riderName} trick={live.previous.trick} status="landed" direction={live.previous.direction} myScoreLabel={live.previous.myScoreLabel} />
          </>
        )}
      </div>
      {sheet ? <RiderSheet sheet={live.sheet} onClose={() => setSheet(false)} /> : null}
    </PhoneFrame>
  );
}

export const JudgeLive = () => <JudgeScreen id="judge-live" note={S.judgeLive} />;
export const JudgeDetails = () => <JudgeScreen id="judge-details" note={S.judgeDetails} startDetails />;
export const JudgeSheet = () => <JudgeScreen id="judge-sheet" note={S.judgeSheet} startSheet />;

const EMPTY: BuilderSelection = { direction: null, multiplier: null, base: null, addons: [] };

/** The spotter's phone: riders with counters, direction, builder, CRASH and Log. */
export function SpotterLive() {
  const live = useMemo(() => judgeLive(), []);
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
      <div className="flex flex-col gap-1.5 px-3 pt-2">
        <div role="group" aria-label={copy.live.tile.strip} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${live.riders.length}, minmax(0, 1fr))` }}>
          {live.riders.map((r, i) => (
            <RiderTile key={r.id} compact label={r.label} attempts={counts[i]} max={r.max} selected={selected === i} onSelect={() => setSelected(i)} />
          ))}
        </div>
        <p data-testid="spotter-logged" className="min-h-[20px] truncate text-small font-semibold text-beach-ink">
          {logged ?? copy.live.saved.waiting}
        </p>
      </div>
      <TrickBuilder blocks={blocks} selection={sel} onPick={pick} name={composed.name} categoryLabel={categoryLabel(composed.categoryKey)} riderLabelText={word} canLog={!!sel.base} onCrash={done} onLog={done} />
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
  const live = useMemo(() => judgeLive(), []);
  return (
    <PhoneFrame id="judge-end" title={NAMES["judge-end"]} note={S.judgeEnd}>
      <ScreenHeader heatName={live.heatName} seat={live.seat} remainingMs={0} timerState="ended" />
      <div data-testid="screen-body" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-2">
        <ImpressionCard
          riders={riders}
          scale={scale}
          values={values}
          submitted={submitted}
          caption={<span className="block truncate font-semibold text-beach-ink">{saved ?? copy.live.saved.waiting}</span>}
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

/** The head judge's phone: controls only. */
export function HeadPhone() {
  const h = useMemo(() => headPhone(), []);
  return (
    <PhoneFrame id="head-phone" title={NAMES["head-phone"]} note={S.headPhone}>
      <HeadControls heatName={h.heatName} state={h.state} remainingMs={h.remainingMs} next={h.next} controls={h.controls} />
    </PhoneFrame>
  );
}
