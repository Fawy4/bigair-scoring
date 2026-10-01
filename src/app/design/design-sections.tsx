"use client";

import { useMemo, useState } from "react";
import { ConnectionBadge } from "@/components/live/connection-badge";
import { CriteriaRows } from "@/components/live/criteria-rows";
import { HeatTimer } from "@/components/live/heat-timer";
import { PublicResults } from "@/components/live/public-results";
import { RiderTile } from "@/components/live/rider-tile";
import { SavedBanner } from "@/components/live/saved-banner";
import { RiderLabel } from "@/components/rider-label";
import { judgeTrickScore } from "@/lib/engine/scoring";
import { riderLabelModel } from "@/lib/identification/rider-label";
import type { ArrowScheme } from "@/lib/live/arrow-loader";
import { FIXTURE_SCHEMES, KOTA, labelRiders, tileRiders } from "@/lib/live/design-fixtures";
import { formatCell } from "@/lib/live/matrix-model";
import { formatPadValue } from "@/lib/live/score-pad";
import { LARGE, NORMAL } from "@/lib/live/size-tokens";
import { copy } from "@/lib/ui-copy";
import { HeadControl, HeadLaptop, HeadScore, JudgeDetails, JudgeEnd, JudgeLive, SpotterLive } from "./screens";

export const SCREEN_IDS = ["judge-live", "judge-details", "spotter-live", "judge-end", "head-score", "head-control", "head-laptop"] as const;
export const PART_IDS = ["result", "labels", "status", "criteria", "sizes"] as const;
export const SECTION_IDS = [...SCREEN_IDS, ...PART_IDS] as const;

function Part({ id, title, intro, children }: { id: string; title: string; intro: string; children: React.ReactNode }) {
  return (
    <section id={id} data-testid={`section-${id}`} className="flex scroll-mt-16 flex-col gap-2">
      <h2 className="text-heading font-semibold">{title}</h2>
      <p className="text-small font-medium text-beach-muted">{intro}</p>
      {children}
    </section>
  );
}

const sub = "text-heading font-semibold text-beach-muted";
const card = "flex flex-col gap-2 rounded-card border border-beach-line bg-beach-surface p-2";

function LabelsPart({ arrow }: { arrow: ArrowScheme | null }) {
  const riders = useMemo(() => labelRiders(), []);
  const lycra = FIXTURE_SCHEMES[0];
  const tileScheme = arrow?.scheme ?? lycra;
  const [selected, setSelected] = useState(0);
  const tiles = useMemo(() => tileRiders(tileScheme), [tileScheme]);
  const show = (scheme: typeof lycra, which: number[]) => (
    <div className="flex flex-col items-stretch gap-2">
      {which.map((i) => (
        <RiderLabel key={i} model={riderLabelModel(scheme, riders[i])} variant="live" />
      ))}
    </div>
  );
  return (
    <Part id="labels" title={copy.design.sections.labels} intro={copy.design.labels.intro}>
      {arrow ? (
        <div data-testid="arrow-scheme" className={card}>
          <h3 className={sub}>{copy.design.labels.arrowScheme(arrow.eventName, arrow.scheme.name)}</h3>
          <p className="text-small font-medium text-beach-muted">{copy.design.labels.arrowFound}</p>
          {show(arrow.scheme, [0, 1, 3, 4, 2, 5])}
        </div>
      ) : (
        <p data-testid="arrow-missing" className="rounded-card border border-dashed border-beach-line p-3 text-body font-medium text-beach-muted">
          {copy.design.labels.arrowMissing}
        </p>
      )}
      <h3 className={sub}>{copy.design.labels.standardHeading}</h3>
      {FIXTURE_SCHEMES.map((scheme) => (
        <div key={scheme.id} data-testid="standard-scheme" className={card}>
          <h4 className={sub}>{scheme.name}</h4>
          {show(scheme, [0, 2, 3, 4])}
        </div>
      ))}
      <h3 className={sub}>{copy.design.labels.tilesHeading}</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {tiles.map((t, i) => (
          <RiderTile key={t.id} label={t.label} attempts={t.attempts} max={t.max} selected={selected === i} onSelect={() => setSelected(i)} />
        ))}
      </div>
    </Part>
  );
}

function StatusPart() {
  const [sound, setSound] = useState(true);
  return (
    <Part id="status" title={copy.design.sections.status} intro={copy.design.status.intro}>
      <div className={card}>
        <HeatTimer remainingMs={330_000} state="running" soundOn={sound} onToggleSound={() => setSound((s) => !s)} />
        <HeatTimer remainingMs={420_000} state="paused" />
        <HeatTimer remainingMs={0} state="ended" />
        <HeatTimer remainingMs={600_000} state="held" />
        <HeatTimer remainingMs={330_000} state="running" size="head" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ConnectionBadge status="synced" />
        <ConnectionBadge status="pending" pending={2} />
        <ConnectionBadge status="offline" />
        <ConnectionBadge status="failed" onRetry={() => undefined} />
      </div>
      <SavedBanner message={copy.live.saved.line("7.5", "RED", 4)} />
      <SavedBanner message={null} />
    </Part>
  );
}

function CriteriaPart() {
  const [crit, setCrit] = useState<Record<string, number | undefined>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const criteria = KOTA.trick.criteria;
  const complete = criteria.every((c) => crit[c.key] !== undefined);
  const computed = complete ? formatCell(judgeTrickScore(KOTA, crit as Record<string, number>).score) : null;
  return (
    <Part id="criteria" title={copy.design.sections.criteria} intro={copy.design.criteria.intro}>
      <div className={card}>
        <CriteriaRows
          criteria={criteria.map((c) => ({ key: c.key, label: c.label, help: c.help, scale: c.scale }))}
          values={crit}
          computedLabel={computed}
          caption={<span className="block truncate font-semibold text-beach-ink">{saved ?? copy.live.saved.waiting}</span>}
          onChange={(key, v) => {
            setCrit((p) => ({ ...p, [key]: v }));
            setSaved(copy.live.saved.line(formatPadValue(v, criteria.find((c) => c.key === key)!.scale), "RED", 5));
          }}
        />
      </div>
    </Part>
  );
}

function ResultPart() {
  return (
    <Part id="result" title={copy.design.sections.result} intro={copy.design.result.intro}>
      <PublicResults />
    </Part>
  );
}

function SizesPart() {
  const W = copy.design.sizes.what;
  const row = copy.design.sizes.row;
  const px = (n: number) => `${n} px`;
  return (
    <Part id="sizes" title={copy.design.sections.sizes} intro={copy.design.sizes.intro}>
      <ul className="list-disc space-y-0.5 pl-5 text-body font-medium">
        <li>{row(W.readout, px(NORMAL.readout), px(LARGE.readout))}</li>
        <li>{row(W.row, px(NORMAL.row), px(LARGE.row))}</li>
        <li>{row(W.composed, px(NORMAL.composed), px(LARGE.composed))}</li>
        <li>{row(W.bar, px(NORMAL.bar), px(LARGE.bar))}</li>
        <li>{row(W.heading, px(NORMAL.heading), px(LARGE.heading))}</li>
        <li>{row(W.body, px(NORMAL.body), px(LARGE.body))}</li>
        <li>{row(W.small, px(NORMAL.small), px(LARGE.small))}</li>
        <li>{row(W.name, px(NORMAL.name), px(LARGE.name))}</li>
        <li>{row(W.digit, px(NORMAL.digit), px(LARGE.digit))}</li>
        <li>{row(W.pad, `${NORMAL.padHeight} px, ${NORMAL.padGap} px`, `${LARGE.padHeight} px, ${LARGE.padGap} px`)}</li>
        <li>{row(W.tap, px(NORMAL.tap), px(LARGE.tap))}</li>
        <li>{row(W.timer, px(NORMAL.timerSlim), px(LARGE.timerSlim))}</li>
        <li>{row(W.timerHead, px(NORMAL.timerHead), px(LARGE.timerHead))}</li>
        <li>{copy.design.sizes.weights}</li>
        <li>{copy.design.sizes.contrast}</li>
      </ul>
    </Part>
  );
}

export function DesignSections({ arrow }: { arrow: ArrowScheme | null }) {
  return (
    <>
      <p className="text-small font-medium text-beach-muted">{copy.design.screens.intro}</p>
      <JudgeLive />
      <JudgeDetails />
      <SpotterLive />
      <JudgeEnd />
      <HeadScore />
      <HeadControl />
      <HeadLaptop />
      <ResultPart />
      <LabelsPart arrow={arrow} />
      <StatusPart />
      <CriteriaPart />
      <SizesPart />
    </>
  );
}
