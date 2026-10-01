"use client";

import { useMemo, useState } from "react";
import { ConnectionBadge } from "@/components/live/connection-badge";
import { CriteriaRows } from "@/components/live/criteria-rows";
import { HeadMatrix } from "@/components/live/head-matrix";
import { HeatTimer } from "@/components/live/heat-timer";
import { ResultRow } from "@/components/live/result-row";
import { RiderTile } from "@/components/live/rider-tile";
import { SavedBanner } from "@/components/live/saved-banner";
import { RiderLabel } from "@/components/rider-label";
import { judgeTrickScore } from "@/lib/engine/scoring";
import { riderLabelModel } from "@/lib/identification/rider-label";
import type { ArrowScheme } from "@/lib/live/arrow-loader";
import { FIXTURE_SCHEMES, KOTA, labelRiders, matrixMain, matrixStates, resultRows, tileRiders } from "@/lib/live/design-fixtures";
import { formatCell } from "@/lib/live/matrix-model";
import { formatPadValue } from "@/lib/live/score-pad";
import { LARGE, NORMAL } from "@/lib/live/size-tokens";
import { copy } from "@/lib/ui-copy";
import { HeadPhone, JudgeDetails, JudgeEnd, JudgeLive, JudgeSheet, SpotterLive } from "./screens";

export const SCREEN_IDS = ["judge-live", "judge-details", "judge-sheet", "spotter-live", "judge-end", "head-phone"] as const;
export const PART_IDS = ["labels", "status", "criteria", "result", "matrix", "sizes"] as const;
export const SECTION_IDS = [...SCREEN_IDS, ...PART_IDS] as const;

function Part({ id, title, intro, children }: { id: string; title: string; intro: string; children: React.ReactNode }) {
  return (
    <section id={id} data-testid={`section-${id}`} className="flex scroll-mt-24 flex-col gap-3">
      <h2 className="border-b border-beach-line pb-1 text-name font-semibold">{title}</h2>
      <p className="text-body font-medium text-beach-muted">{intro}</p>
      {children}
    </section>
  );
}

const sub = "text-body font-semibold";
const card = "flex flex-col gap-3 rounded-card border border-beach-line bg-beach-surface p-3";

function LabelsPart({ arrow }: { arrow: ArrowScheme | null }) {
  const riders = useMemo(() => labelRiders(), []);
  const lycra = FIXTURE_SCHEMES[0];
  const tileScheme = arrow?.scheme ?? lycra;
  const [selected, setSelected] = useState(0);
  const tiles = useMemo(() => tileRiders(tileScheme), [tileScheme]);
  const show = (scheme: typeof lycra, which: number[]) => (
    <div className="flex flex-col items-stretch gap-2">
      {which.map((i) => (
        <RiderLabel key={i} model={riderLabelModel(scheme, riders[i])} variant="stripe" />
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
  const rows = useMemo(() => resultRows(), []);
  const [showPercent, setShowPercent] = useState(false);
  return (
    <Part id="result" title={copy.design.sections.result} intro={copy.design.result.intro}>
      <label className="flex min-h-tap items-center gap-3 rounded-card border border-beach-line bg-beach-surface px-3 py-2 text-body font-semibold">
        <input type="checkbox" checked={showPercent} onChange={(e) => setShowPercent(e.target.checked)} className="size-6 accent-[var(--beach-accent)]" />
        <span>
          {copy.design.result.showPercent}
          <span className="block text-small font-medium text-beach-muted">{copy.design.result.percentNote}</span>
        </span>
      </label>
      {rows.map((r) => (
        <ResultRow key={r.id} row={r} showPercent={showPercent} />
      ))}
    </Part>
  );
}

function MatrixPart() {
  const main = useMemo(() => matrixMain(), []);
  const states = useMemo(() => matrixStates(), []);
  const legend = copy.live.matrix.legend;
  return (
    <Part id="matrix" title={copy.design.sections.matrix} intro={copy.design.matrix.intro}>
      <p data-testid="matrix-phone-note" className="rounded-card border border-dashed border-beach-line p-3 text-body font-medium text-beach-muted">
        {copy.design.matrix.phoneNote}
      </p>
      <h3 className={sub}>{copy.design.matrix.mainHeading}</h3>
      <HeadMatrix model={main} />
      <h3 className={sub}>{copy.design.matrix.statesHeading}</h3>
      <HeadMatrix model={states} />
      <h3 className={sub}>{copy.live.matrix.legendHeading}</h3>
      <ul className="flex flex-col gap-1 text-body font-medium">
        {Object.entries(legend).map(([k, text]) => (
          <li key={k}>
            <span className="font-semibold">{k === "scored" ? "7.75" : copy.live.matrix[k as "missing"]}</span> — {text}
          </li>
        ))}
      </ul>
    </Part>
  );
}

function SizesPart() {
  const W = copy.design.sizes.what;
  const row = copy.design.sizes.row;
  const px = (n: number) => `${n} px`;
  return (
    <Part id="sizes" title={copy.design.sections.sizes} intro={copy.design.sizes.intro}>
      <ul className="list-disc space-y-1 pl-6 text-body font-medium">
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
      <div className="flex flex-col gap-2">
        <h2 className="text-name font-semibold">{copy.design.groups.screens}</h2>
        <p className="text-body font-medium text-beach-muted">{copy.design.screens.intro}</p>
      </div>
      <JudgeLive />
      <JudgeDetails />
      <JudgeSheet />
      <SpotterLive />
      <JudgeEnd />
      <HeadPhone />
      <h2 className="text-name font-semibold">{copy.design.groups.parts}</h2>
      <LabelsPart arrow={arrow} />
      <StatusPart />
      <CriteriaPart />
      <ResultPart />
      <MatrixPart />
      <SizesPart />
    </>
  );
}
