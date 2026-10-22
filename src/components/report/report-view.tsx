"use client";

import Link from "next/link";
import "@/app/home.css";
import "@/app/report.css";
import { HomeSky } from "@/components/home/home-sky";
import { ThemeSwitch, useBeachTheme } from "@/components/live/theme-switch";
import type { CompareRow, FieldFigure, HeatRow, RiderReport } from "@/lib/engine/report";
import { avg1, clock, gapText, goalText, highlightText, ordinal, percent, score2, strategyText, strengthText, trainText } from "@/lib/public/report-text";
import { copy } from "@/lib/ui-copy";
import { HeatTimeline } from "./timeline";

const R = copy.report;
const FAMILY_COLOURS = ["var(--r-f1)", "var(--r-f2)", "var(--r-f3)", "var(--r-f4)", "var(--r-f5)"];

function FieldLine({ field, fmt }: { field: FieldFigure; fmt: (x: number | null) => string }) {
  return (
    <div className="r-tile-field" data-testid="tile-field">
      {R.field(fmt(field.all))}
      <br />
      {field.finalists === null ? R.noFinalists : R.finalists(fmt(field.finalists))}
    </div>
  );
}

function Tile({ id, label, value, sub, field, fmt = avg1 }: { id: string; label: string; value: string; sub?: string; field: FieldFigure; fmt?: (x: number | null) => string }) {
  return (
    <li className="r-tile" data-testid={`tile-${id}`}>
      <span className="r-tile-label">{label}</span>
      <span className="r-tile-value">{value}</span>
      {sub ? <span className="r-tile-sub">{sub}</span> : null}
      <FieldLine field={field} fmt={fmt} />
    </li>
  );
}

function Tiles({ report }: { report: RiderReport }) {
  const t = report.tiles;
  const T = R.tile;
  const sw = report.sideWords;
  return (
    <ul className="r-tiles" style={{ listStyle: "none", margin: 0, padding: 0 }} data-testid="report-tiles">
      <Tile id="jumps" label={T.jumps} value={String(t.jumps.value)} sub={t.jumps.allowed === null ? undefined : T.jumpsOf(t.jumps.allowed)} field={t.jumps.field} />
      <Tile id="landed" label={T.landed} value={String(t.landed.value)} field={t.landed.field} />
      <Tile id="crashes" label={T.crashes} value={String(t.crashes.value)} sub={t.crashes.rate === null ? undefined : T.crashRate(percent(t.crashes.rate))} field={t.crashes.field} />
      <Tile id="different" label={T.different} value={String(t.differentTricks.value ?? 0)} field={t.differentTricks.field} />
      <Tile id="loops" label={T.loops} value={String(t.loops.landed)} sub={T.loopsOf(t.loops.landed, t.loops.tried)} field={t.loops.field} />
      <li className="r-tile" data-testid="tile-sides">
        <span className="r-tile-label">{T.sides}</span>
        <span className="r-tile-value">
          {t.directions.left} · {t.directions.right}
        </span>
        <span className="r-tile-sub">
          {sw.left} · {sw.right}
        </span>
        <div className="r-tile-field">{T.sidesLine(t.directions.withDirection, t.directions.jumps)}</div>
      </li>
      <li className="r-tile" data-testid="tile-won">
        <span className="r-tile-label">{T.won}</span>
        <span className="r-tile-value">{t.heatsWon.value}</span>
        <span className="r-tile-sub">{T.wonOf(t.heatsWon.value, t.heatsWon.heats)}</span>
      </li>
      <Tile id="average" label={T.average} value={score2(t.averageTotal.value)} field={t.averageTotal.field} fmt={(x) => (x === null ? "–" : x.toFixed(2))} />
      <Tile id="best" label={T.best} value={score2(t.bestTotal.value)} sub={t.bestTotal.heatLabel ? T.bestWhere(t.bestTotal.heatLabel) : undefined} field={t.bestTotal.field} fmt={(x) => (x === null ? "–" : x.toFixed(2))} />
      <Tile id="steadiness" label={T.steadiness} value={t.steadiness.value === null ? "–" : t.steadiness.value.toFixed(2)} sub={T.steadinessLine} field={t.steadiness.field} fmt={(x) => (x === null ? "–" : x.toFixed(2))} />
    </ul>
  );
}

function Hero({ report }: { report: RiderReport }) {
  const h = report.headline;
  const place = h.place === null ? null : R.place(ordinal(h.place), h.shared);
  return (
    <section className="r-hero" data-testid="report-hero" aria-label={report.name}>
      <span className="r-hero-event">{R.heroEvent(report.eventName, report.divisionName)}</span>
      <h1 className="r-hero-name" data-testid="report-name">
        {report.name}
      </h1>
      {place ? (
        <p className="r-hero-place" data-testid="report-place">
          {report.soFar ? R.placeSoFar(place) : place}
        </p>
      ) : (
        <p className="r-hero-sub" data-testid="report-place">
          {R.stillIn(h.lastRound)}
        </p>
      )}
      {h.outInRound ? (
        <span className="r-hero-sub" data-testid="report-out-in">
          {R.outIn(h.outInRound)}
        </span>
      ) : null}
      {report.soFar ? (
        <span className="r-sofar" data-testid="report-so-far">
          {R.soFarLine}
        </span>
      ) : null}
    </section>
  );
}

function Path({ report }: { report: RiderReport }) {
  return (
    <section aria-label={R.pathHeading}>
      <h2 className="r-h2">{R.pathHeading}</h2>
      <ol className="r-path" data-testid="report-path">
        {report.headline.steps.map((s) => (
          <li key={s.heatId} className="r-pill" data-outcome={s.outcome} data-testid="path-step">
            <b>{s.roundName}</b>
            <span>
              {R.outcome[s.outcome]}
              {s.place && (s.outcome === "won" || s.outcome === "through" || s.outcome === "out" || s.outcome === "done") ? ` · ${ordinal(s.place)}` : ""}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Highlights({ report }: { report: RiderReport }) {
  if (!report.highlights.length) return null;
  return (
    <section className="r-card r-soft" data-testid="report-highlights" aria-label={R.highlightsHeading}>
      <h2 className="r-h2">{R.highlightsHeading}</h2>
      <ul className="r-list">
        {report.highlights.map((h) => (
          <li key={h.kind} data-testid="highlight">
            {highlightText(h, report)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Takeaways({ report }: { report: RiderReport }) {
  const t = report.takeaways;
  if (!t.strength && !t.train && !t.strategy && !t.gap) return null;
  return (
    <section className="flex-col" style={{ display: "flex", flexDirection: "column", gap: 8 }} aria-label={R.takeawaysHeading} data-testid="report-takeaways">
      <h2 className="r-h2" style={{ marginBottom: 0 }}>
        {R.takeawaysHeading}
      </h2>
      {t.strength ? (
        <div className="r-take" data-testid="take-strength">
          <b>{R.strengthLabel}</b>
          <p>{strengthText(t.strength)}</p>
        </div>
      ) : null}
      {t.train ? (
        <div className="r-take" data-testid="take-train">
          <b>{R.trainLabel}</b>
          <p>{trainText(t.train, report)}</p>
        </div>
      ) : null}
      {t.strategy ? (
        <div className="r-take" data-testid="take-strategy">
          <b>{R.strategyLabel}</b>
          <p>{strategyText(t.strategy)}</p>
        </div>
      ) : null}
      {t.gap ? (
        <div className="r-take r-gap" data-testid="take-gap">
          <p>{gapText(t.gap)}</p>
        </div>
      ) : null}
    </section>
  );
}

function Best({ report }: { report: RiderReport }) {
  if (!report.bestTricks.length) return null;
  return (
    <section className="r-card" aria-label={R.bestHeading} data-testid="report-best">
      <h2 className="r-h2">{R.bestHeading}</h2>
      <ol className="r-best">
        {report.bestTricks.map((b, i) => (
          <li key={`${b.trick}-${i}`} data-testid="best-trick">
            <span className="r-rank" aria-hidden>
              {i + 1}
            </span>
            <span className="r-best-name">
              {b.trick}
              {b.side ? ` · ${b.side === "right" ? report.sideWords.right : report.sideWords.left}` : ""}
              <span className="r-best-where">{b.heatLabel}</span>
            </span>
            <span className="r-best-score">{score2(b.score)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Heat({ heat, report }: { heat: HeatRow; report: RiderReport }) {
  const H = R.heat;
  const side = (s: string | null) => (s === null ? "" : s === "right" ? report.sideWords.right : report.sideWords.left);
  return (
    <article className="r-card r-heat" data-testid="report-heat">
      <div className="r-heat-head">
        <h3>{heat.heatLabel}</h3>
        <span className="r-badge" data-outcome={heat.outcome}>
          {R.outcome[heat.outcome]}
          {heat.place ? ` · ${ordinal(heat.place)}` : ""}
        </span>
      </div>
      {heat.total !== null && heat.tricksTotal !== null ? (
        <p style={{ margin: 0, fontWeight: 700 }} data-testid="heat-total">
          {heat.impression === null ? H.totalNoScore(score2(heat.total), score2(heat.tricksTotal)) : H.total(score2(heat.total), score2(heat.tricksTotal), report.scoreName, score2(heat.impression))}
        </p>
      ) : null}
      <p className="r-small r-muted" style={{ margin: 0, fontWeight: 600 }}>
        {heat.gapToThrough !== null ? H.gapThrough(`${heat.gapToThrough.toFixed(2)}`) : heat.gapToWinner !== null ? H.gapWinner(`${heat.gapToWinner.toFixed(2)}`) : heat.leadOverNext !== null ? H.lead(`${heat.leadOverNext.toFixed(2)}`) : ""}
      </p>
      {heat.jumps ? (
        <>
          <ul className="r-stats">
            <li>{H.attempts(heat.jumps)}</li>
            <li>{heat.crashRate === null ? "" : H.crashRate(percent(heat.crashRate))}</li>
            <li>{heat.firstLandedAt === null ? H.noLanded : H.firstLanded(clock(heat.firstLandedAt))}</li>
            <li>{heat.paceSec === null ? "" : H.pace(clock(heat.paceSec))}</li>
          </ul>
          <HeatTimeline heat={heat} />
          <details className="r-details" open>
            <summary>{H.jumpsHeading}</summary>
            <ol className="r-jumps" data-testid="jump-list">
              {heat.jumpLines.map((j) => (
                <li key={j.seq} data-testid="jump-line">
                  <span className="r-t">{clock(j.at_sec)}</span>
                  <span className="r-name">
                    {j.trick ? j.trick : "–"}
                    {j.side ? ` · ${side(j.side)}` : ""}
                    {j.counted ? <span className="r-tag">{H.counts}</span> : null}
                  </span>
                  <span>{j.landed ? `${H.landed}${j.score !== null ? ` ${score2(j.score)}` : ""}` : <span className="r-crashed">{H.crash}</span>}</span>
                </li>
              ))}
            </ol>
          </details>
        </>
      ) : null}
    </article>
  );
}

function Mix({ report }: { report: RiderReport }) {
  if (!report.mix.length) return null;
  const total = report.mix.reduce((s, m) => s + m.tried, 0);
  const label = (k: string) => report.familyLabels[k] ?? R.family(k);
  return (
    <section className="r-card" aria-label={R.mixHeading} data-testid="report-mix">
      <h2 className="r-h2">{R.mixHeading}</h2>
      <div className="r-mixbar" role="img" aria-label={report.mix.map((m) => `${label(m.key)} ${m.tried}`).join(", ")}>
        {report.mix.map((m, i) => (
          <span key={m.key} style={{ width: `${(m.tried / total) * 100}%`, background: FAMILY_COLOURS[i % FAMILY_COLOURS.length] }} />
        ))}
      </div>
      {report.mix.map((m, i) => (
        <div key={m.key} className="r-mixrow" data-testid="mix-row">
          <div className="r-mixhead">
            <span>
              <span className="r-swatch" style={{ background: FAMILY_COLOURS[i % FAMILY_COLOURS.length] }} aria-hidden />
              {label(m.key)}
            </span>
            <span>{R.mixLine(m.landed, m.tried)}</span>
          </div>
          <span className="r-small">
            <b>{R.mixLanded}:</b> {m.landedTricks.length ? m.landedTricks.join(", ") : R.mixNone}
          </span>
          <span className="r-small">
            <b>{R.mixStill}:</b> {m.stillToLand.length ? m.stillToLand.join(", ") : R.mixNone}
          </span>
        </div>
      ))}
    </section>
  );
}

const compareText = (key: string, name: string): string => {
  const v = R.compare[key];
  return typeof v === "function" ? v(name) : v;
};
const compareFmt = (key: CompareRow["key"], x: number | null): string => {
  if (x === null) return "–";
  if (key === "landing_rate" || key === "loop_share") return percent(x);
  return (Math.round(x * 100) / 100).toString();
};

function Compare({ report }: { report: RiderReport }) {
  return (
    <section className="r-card" aria-label={R.compareHeading} data-testid="report-compare">
      <h2 className="r-h2">{R.compareHeading}</h2>
      {report.compare.map((c) => {
        const max = Math.max(c.me ?? 0, c.all ?? 0, c.finalists ?? 0, 0.0001);
        const bar = (label: string, v: number | null, colour: string) => (
          <div className="r-bar">
            <span>{label}</span>
            <span className="r-bar-track">
              <span className="r-bar-fill" style={{ width: `${v === null ? 0 : (v / max) * 100}%`, background: colour }} />
            </span>
            <span className="r-bar-val">{compareFmt(c.key, v)}</span>
          </div>
        );
        return (
          <div key={c.key} className="r-cmp" data-testid="compare-row">
            <b>{compareText(c.key, report.scoreName)}</b>
            {bar(R.youLabel, c.me, "var(--r-accent)")}
            {bar(R.allLabel, c.all, "var(--r-f4)")}
            {bar(R.finalistsLabel, c.finalists, "var(--r-f3)")}
          </div>
        );
      })}
      <p className="r-foot" style={{ margin: "8px 0 0" }}>
        {R.fieldOnly}
      </p>
    </section>
  );
}

function Goals({ report }: { report: RiderReport }) {
  return (
    <section className="r-card" aria-label={R.goalsHeading} data-testid="report-goals">
      <h2 className="r-h2">{R.goalsHeading}</h2>
      {report.goals.length ? (
        <ul className="r-goals">
          {report.goals.map((g, i) => (
            <li key={i} data-testid="goal">
              {goalText(g, report)}
            </li>
          ))}
        </ul>
      ) : null}
      <h2 className="r-h2" style={{ marginTop: 16 }}>
        {R.reflectHeading}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {R.reflect.map((q) => (
          <div key={q} className="r-goal-box" data-testid="reflect">
            {q}
          </div>
        ))}
      </div>
      <p className="r-foot" style={{ margin: "8px 0 0" }}>
        {R.reflectNote}
      </p>
    </section>
  );
}

/** The rider's report: the whole page, with its own Day / Dark switch and the Sendbook background. */
export function RiderReportView({ report, backHref, preview }: { report: RiderReport; backHref: string; preview: boolean }) {
  const [theme, setTheme] = useBeachTheme();
  return (
    <div className="home home-sky report" data-theme={theme === "dark" ? "dark" : "light"} data-testid="rider-report">
      <HomeSky />
      <div className="report-wrap">
        <div className="report-top">
          <Link href={backHref} className="report-back" prefetch={false}>
            ← {R.back}
          </Link>
          <div className={`home-theme ${theme === "dark" ? "beach-dark" : "beach-day"} beach-text-normal`} data-testid="report-theme">
            <ThemeSwitch theme={theme} onChange={setTheme} />
          </div>
        </div>
        {preview ? (
          <p className="r-banner" data-testid="report-preview-banner">
            {R.previewBanner}
          </p>
        ) : null}
        <div className="report-slot" data-home-sky-slot aria-hidden />
        <Hero report={report} />
        <Path report={report} />
        <Tiles report={report} />
        <Highlights report={report} />
        <Takeaways report={report} />
        <Best report={report} />
        <section aria-label={R.heatsHeading} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="r-h2" style={{ marginBottom: 0 }}>
            {R.heatsHeading}
          </h2>
          {report.heats.map((h) => (
            <Heat key={h.heatId} heat={h} report={report} />
          ))}
        </section>
        <Mix report={report} />
        <Compare report={report} />
        <Goals report={report} />
        <p className="r-foot">{R.shownFor}</p>
      </div>
    </div>
  );
}
