"use client";

import { useMemo, useState } from "react";
import { AttemptCard } from "@/components/live/attempt-card";
import { ConnectionBadge } from "@/components/live/connection-badge";
import { CriteriaRows } from "@/components/live/criteria-rows";
import { HeadMatrix } from "@/components/live/head-matrix";
import { HeatTimer } from "@/components/live/heat-timer";
import { ImpressionCard } from "@/components/live/impression-card";
import { ResultRow } from "@/components/live/result-row";
import { RiderTile } from "@/components/live/rider-tile";
import { SavedBanner } from "@/components/live/saved-banner";
import { ScorePad } from "@/components/live/score-pad";
import { TrickBuilder, type BuilderSelection } from "@/components/live/trick-builder";
import { RiderLabel } from "@/components/rider-label";
import { judgeTrickScore } from "@/lib/engine/scoring";
import { riderLabelModel, type LabelModel } from "@/lib/identification/rider-label";
import type { ArrowScheme } from "@/lib/live/arrow-loader";
import {
  categoryLabel,
  FIXTURE_SCHEMES,
  impressionRiders,
  KOTA,
  labelRiders,
  matrixMain,
  matrixStates,
  previewBlocks,
  previewCompose,
  resultRows,
  tileRiders,
} from "@/lib/live/design-fixtures";
import { formatCell } from "@/lib/live/matrix-model";
import { formatPadValue } from "@/lib/live/score-pad";
import type { FamilyKey } from "@/lib/trick-base";
import { copy } from "@/lib/ui-copy";

export const SECTION_IDS = ["labels", "timer", "judge", "impression", "spotter", "result", "matrix", "sizes"] as const;
type SectionId = (typeof SECTION_IDS)[number];

function Section({ id, children, intro }: { id: SectionId; children: React.ReactNode; intro: string }) {
  return (
    <section id={id} data-testid={`section-${id}`} className="flex scroll-mt-24 flex-col gap-4">
      <h2 className="border-b-4 border-beach-border pb-1 text-3xl font-extrabold">{copy.design.sections[id]}</h2>
      <p className="text-xl font-semibold text-beach-muted">{intro}</p>
      {children}
    </section>
  );
}

const sub = "text-2xl font-extrabold";
const previewOnly = <p className="text-lg font-bold text-beach-muted">{copy.design.previewOnly}</p>;

// ---------------------------------------------------------------- Rider labels
function LabelsSection({ arrow }: { arrow: ArrowScheme | null }) {
  const riders = useMemo(() => labelRiders(), []);
  const lycra = FIXTURE_SCHEMES[0];
  const tileScheme = arrow?.scheme ?? lycra;
  const [selected, setSelected] = useState(0);
  const tiles = useMemo(() => tileRiders(tileScheme), [tileScheme]);
  const show = (scheme: typeof lycra, which: number[]) => (
    <div className="flex flex-col items-start gap-3">
      {which.map((i) => (
        <RiderLabel key={i} model={riderLabelModel(scheme, riders[i])} size="lg" nameplate />
      ))}
    </div>
  );
  return (
    <Section id="labels" intro={copy.design.labels.intro}>
      {arrow ? (
        <div data-testid="arrow-scheme" className="flex flex-col gap-3 rounded-lg border-4 border-beach-border bg-beach-surface p-3">
          <h3 className={sub}>{copy.design.labels.arrowScheme(arrow.eventName, arrow.scheme.name)}</h3>
          <p className="text-lg font-bold text-beach-muted">{copy.design.labels.arrowFound}</p>
          {show(arrow.scheme, [0, 1, 3, 4, 2, 5])}
        </div>
      ) : (
        <p data-testid="arrow-missing" className="rounded-lg border-2 border-dashed border-beach-missing p-3 text-lg font-bold text-beach-muted">
          {copy.design.labels.arrowMissing}
        </p>
      )}
      <h3 className={sub}>{copy.design.labels.standardHeading}</h3>
      {FIXTURE_SCHEMES.map((scheme) => (
        <div key={scheme.id} data-testid="standard-scheme" className="flex flex-col gap-3 rounded-lg border-2 border-beach-border bg-beach-bg p-3">
          <h4 className="text-xl font-extrabold">{scheme.name}</h4>
          {show(scheme, [0, 2, 3, 4])}
        </div>
      ))}
      <p className="text-lg font-bold text-beach-muted">{copy.design.labels.nameplateNote}</p>
      <h3 className={sub}>{copy.design.labels.tilesHeading}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {tiles.map((t, i) => (
          <RiderTile key={t.id} label={t.label} attempts={t.attempts} max={t.max} selected={selected === i} onSelect={() => setSelected(i)} />
        ))}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- Timer and status
function TimerSection() {
  const [sound, setSound] = useState(true);
  const T = copy.live;
  return (
    <Section id="timer" intro={copy.design.timer.intro}>
      <HeatTimer remainingMs={330_000} state="running" soundOn={sound} onToggleSound={() => setSound((s) => !s)} />
      <HeatTimer remainingMs={420_000} state="paused" />
      <HeatTimer remainingMs={0} state="ended" />
      <HeatTimer remainingMs={600_000} state="held" />
      <div className="flex flex-wrap gap-2">
        <ConnectionBadge status="synced" />
        <ConnectionBadge status="pending" pending={2} />
        <ConnectionBadge status="offline" />
        <ConnectionBadge status="failed" onRetry={() => undefined} />
      </div>
      <SavedBanner message={T.saved.line("7.5", "RED", 4)} />
      <SavedBanner message={null} />
    </Section>
  );
}

// ---------------------------------------------------------------- Judge card
const redLabel = (): LabelModel => riderLabelModel(FIXTURE_SCHEMES[0], { name: "Sam Rivera", slotColour: "red" });
const blueLabel = (): LabelModel => riderLabelModel(FIXTURE_SCHEMES[0], { name: "Noor Haddad", slotColour: "blue" });

function JudgeSection() {
  const tiles = useMemo(() => tileRiders(), []);
  const [selected, setSelected] = useState(0);
  const [saved, setSaved] = useState<string | null>(null);
  const [crit, setCrit] = useState<Record<string, number | undefined>>({});
  const [redMissed, setRedMissed] = useState(false);
  const [blueScore, setBlueScore] = useState<number | null>(null);
  const [blueMissed, setBlueMissed] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const criteria = KOTA.trick.criteria;
  const complete = criteria.every((c) => crit[c.key] !== undefined);
  const computed = complete ? formatCell(judgeTrickScore(KOTA, crit as Record<string, number>).score) : null;
  const red = redLabel();
  const blue = blueLabel();
  const trickScale = KOTA.trick.scale;
  return (
    <Section id="judge" intro={copy.design.judge.intro}>
      <div className="flex flex-col gap-3 rounded-lg border-4 border-beach-border bg-beach-surface p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-2xl font-extrabold">Pro Men · R1 · Heat 3</h3>
          <span className="text-xl font-extrabold">Judge 1</span>
        </div>
        <HeatTimer remainingMs={330_000} state="running" />
        <ConnectionBadge status="synced" />
        <SavedBanner message={saved} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {tiles.map((t, i) => (
          <RiderTile key={t.id} label={t.label} attempts={t.attempts} max={t.max} selected={selected === i} onSelect={() => setSelected(i)} />
        ))}
      </div>

      <h3 className={sub}>{copy.design.judge.singleHeading}</h3>
      <AttemptCard
        number={5}
        label={blue}
        trick="Left Backroll"
        categoryLabel={copy.trickBase.categoryLabels.rotation}
        status="landed"
        repeat={{ nth: "2nd", previous: "7.0" }}
        missed={blueMissed}
        onMissed={() => {
          setBlueMissed(true);
          setBlueScore(null);
          setSaved(copy.live.saved.missed("BLUE", 5));
        }}
        onFlag={() => setFlagged((f) => !f)}
      >
        <ScorePad
          scale={trickScale}
          value={blueScore}
          label={copy.live.criteria.trickScore}
          onChange={(v) => {
            setBlueScore(v);
            setBlueMissed(false);
            setSaved(copy.live.saved.line(formatPadValue(v, trickScale), "BLUE", 5));
          }}
        />
      </AttemptCard>
      {flagged ? <p className="rounded-lg border-2 border-beach-border bg-beach-surface p-3 text-lg font-bold">{copy.live.attempt.flag} ✓</p> : null}

      <h3 className={sub}>{copy.design.judge.criteriaHeading}</h3>
      <AttemptCard
        number={5}
        label={red}
        trick="Contra loop"
        categoryLabel={copy.trickBase.categoryLabels.kiteloop}
        status="landed"
        missed={redMissed}
        onMissed={() => {
          setRedMissed(true);
          setCrit({});
          setSaved(copy.live.saved.missed("RED", 5));
        }}
        onFlag={() => undefined}
      >
        <CriteriaRows
          criteria={criteria.map((c) => ({ key: c.key, label: c.label, help: c.help, scale: c.scale }))}
          values={crit}
          computedLabel={computed}
          onChange={(key, v) => {
            setRedMissed(false);
            setCrit((p) => ({ ...p, [key]: v }));
            setSaved(copy.live.saved.line(formatPadValue(v, criteria.find((c) => c.key === key)!.scale), "RED", 5));
          }}
        />
      </AttemptCard>
      <AttemptCard number={4} label={red} trick="Board-off" categoryLabel={copy.trickBase.categoryLabels.board_off} status="crashed" onFlag={() => undefined} />
      {previewOnly}
    </Section>
  );
}

// ---------------------------------------------------------------- Impression / Variety step
function ImpressionSection() {
  const riders = useMemo(() => impressionRiders(), []);
  const [values, setValues] = useState<Record<string, number | null>>(() => Object.fromEntries(riders.map((r) => [r.id, r.initialValue])));
  const [submitted, setSubmitted] = useState(false);
  const [saved, setSaved] = useState<string | null>(copy.live.saved.impression("7.5", "RED"));
  const scale = KOTA.heat.impression!.scale;
  return (
    <Section id="impression" intro={copy.design.impression.intro}>
      <SavedBanner message={saved} />
      <ImpressionCard
        riders={riders}
        scale={scale}
        values={values}
        submitted={submitted}
        onChange={(id, v) => {
          setValues((p) => ({ ...p, [id]: v }));
          setSaved(copy.live.saved.impression(formatPadValue(v, scale), riders.find((r) => r.id === id)!.label.primary.text));
        }}
        onSubmit={() => setSubmitted(true)}
      />
      {previewOnly}
    </Section>
  );
}

// ---------------------------------------------------------------- Spotter builder
const EMPTY: BuilderSelection = { direction: null, multiplier: null, base: null, addons: [] };

function SpotterSection() {
  const blocks = useMemo(() => previewBlocks(), []);
  const tiles = useMemo(() => tileRiders(), []);
  const [selected, setSelected] = useState(0);
  const [sel, setSel] = useState<BuilderSelection>(EMPTY);
  const [logged, setLogged] = useState<string | null>(null);
  const [count, setCount] = useState(6);
  const composed = previewCompose(sel);
  const rider = tiles[selected];
  const riderText = rider.label.primary.text;
  const pick = (family: FamilyKey, key: string) =>
    setSel((s) => {
      if (family === "direction" || family === "multiplier" || family === "base") return { ...s, [family]: s[family] === key ? null : key };
      return { ...s, addons: s.addons.includes(key) ? s.addons.filter((k) => k !== key) : [...s.addons, key] };
    });
  const done = () => {
    setLogged(copy.live.builder.logged(riderText, count));
    setCount((c) => c + 1);
    setSel(EMPTY);
  };
  return (
    <Section id="spotter" intro={copy.design.spotter.intro}>
      <SavedBanner message={logged} />
      <div className="grid gap-3 sm:grid-cols-2">
        {tiles.map((t, i) => (
          <RiderTile key={t.id} label={t.label} attempts={t.attempts} max={t.max} selected={selected === i} onSelect={() => setSelected(i)} />
        ))}
      </div>
      <TrickBuilder blocks={blocks} selection={sel} onPick={pick} name={composed.name} categoryLabel={categoryLabel(composed.categoryKey)} riderLabelText={riderText} canLog={!!sel.base} onCrash={done} onLog={done} />
      {previewOnly}
    </Section>
  );
}

// ---------------------------------------------------------------- Result row and the head judge's table
function ResultSection() {
  const rows = useMemo(() => resultRows(), []);
  return (
    <Section id="result" intro={copy.design.result.intro}>
      {rows.map((r) => (
        <ResultRow key={r.id} row={r} />
      ))}
    </Section>
  );
}

function MatrixSection() {
  const main = useMemo(() => matrixMain(), []);
  const states = useMemo(() => matrixStates(), []);
  const legend = copy.live.matrix.legend;
  return (
    <Section id="matrix" intro={copy.design.matrix.intro}>
      <p data-testid="matrix-phone-note" className="rounded-lg border-2 border-dashed border-beach-missing p-3 text-lg font-bold text-beach-muted">
        {copy.design.matrix.phoneNote}
      </p>
      <h3 className={sub}>{copy.design.matrix.mainHeading}</h3>
      <HeadMatrix model={main} />
      <h3 className={sub}>{copy.design.matrix.statesHeading}</h3>
      <HeadMatrix model={states} />
      <h3 className="text-xl font-extrabold">{copy.live.matrix.legendHeading}</h3>
      <ul className="flex flex-col gap-1 text-lg font-bold">
        {Object.entries(legend).map(([k, text]) => (
          <li key={k}>
            <span className="font-extrabold">{k === "scored" ? "7.75" : copy.live.matrix[k as "missing"]}</span> — {text}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function SizesSection() {
  return (
    <Section id="sizes" intro={copy.design.sizes.intro}>
      <ul className="list-disc space-y-1 pl-6 text-xl font-bold">
        {copy.design.sizes.rows.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </Section>
  );
}

export function DesignSections({ arrow }: { arrow: ArrowScheme | null }) {
  const order: Record<SectionId, React.ReactNode> = {
    labels: <LabelsSection key="labels" arrow={arrow} />,
    timer: <TimerSection key="timer" />,
    judge: <JudgeSection key="judge" />,
    impression: <ImpressionSection key="impression" />,
    spotter: <SpotterSection key="spotter" />,
    result: <ResultSection key="result" />,
    matrix: <MatrixSection key="matrix" />,
    sizes: <SizesSection key="sizes" />,
  };
  return <>{SECTION_IDS.map((id) => order[id])}</>;
}
