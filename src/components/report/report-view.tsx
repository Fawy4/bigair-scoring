"use client";

import "@/app/home.css";
import "@/app/report.css";
import { useRouter } from "next/navigation";
import { HomeSky } from "@/components/home/home-sky";
import { ThemeSwitch, useBeachTheme } from "@/components/live/theme-switch";
import type { CompareRow, HeatRow, PickerItem, RiderReport } from "@/lib/engine/report";
import { behindText, clock, dayLine, factText, familyName, heatPill, highlightText, ordinal, percent, score, strategyText, strengthText, tileViews, trainText, whole } from "@/lib/public/report-text";
import { previewHref, reportHref } from "@/lib/public/report-links";
import { copy } from "@/lib/ui-copy";
import { HeatStrip } from "./timeline";

const R = copy.report;
const FAMILY_CLASS = ["f0", "f1", "f2", "f3", "f4"];

/** The rider picker: every rider whose report is open, with where they got to. Choosing one opens that rider's report. */
function Picker({ items, current, slug, preview }: { items: PickerItem[]; current: string; slug: string; preview: boolean }) {
  const router = useRouter();
  const several = new Set(items.map((i) => i.divisionName)).size > 1;
  const line = (i: PickerItem): string => {
    const base = i.place !== null ? R.pickerPlace(i.name, ordinal(i.place)) : R.pickerReached(i.name, i.lastRound ?? "");
    return several ? R.pickerDivision(base, i.divisionName) : base;
  };
  return (
    <label>
      <span className="muted" style={{ fontSize: 12, display: "block", marginBlockEnd: 2 }}>
        {R.riderLabel}
      </span>
      <select
        id="rider"
        data-testid="rider-picker"
        value={current}
        onChange={(e) => {
          // the address comes from the list the server sent, never from the text of the screen
          const href = preview ? previewHref(slug, e.target.value, items.map((i) => ({ id: i.entryId }))) : reportHref(slug, items.find((i) => i.entryId === e.target.value)?.entryId ?? "");
          if (href && items.some((i) => i.entryId === e.target.value)) router.push(href);
        }}
      >
        {items.map((i) => (
          <option key={i.entryId} value={i.entryId}>
            {line(i)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Hero({ report }: { report: RiderReport }) {
  const h = report.headline;
  const place = h.place === null ? null : R.place(ordinal(h.place), h.shared);
  const caption = h.caption === "winner" ? R.caption.winner : h.caption === "final" ? R.caption.final : h.outInRound ? R.outIn(h.outInRound) : R.stillIn;
  const sub = R.heroSub(dayLine(report.days), report.nationality);
  return (
    <div className="card hero" data-testid="report-hero">
      <div className="hero-top">
        <div>
          <div className="eyebrow">{R.heroEvent(report.eventName, report.eventLocation)}</div>
          <h2 className="rname" data-testid="report-name">
            {report.name}
          </h2>
          {sub ? <div className="sub">{sub}</div> : null}
        </div>
        <div className="place" data-testid="report-place">
          <div className={`pbig${place && place.length > 4 ? " pmid" : ""}`}>{place ?? "–"}</div>
          <div className="psmall">{caption}</div>
          {report.soFar ? (
            <div className="psmall" data-testid="report-so-far">
              {R.soFar}
            </div>
          ) : null}
        </div>
      </div>
      <ol className="path" data-testid="report-path">
        {report.headline.steps.map((s) => {
          const word = s.outcome === "walkover" || s.outcome === "did_not_start" || s.outcome === "out_of_event" || s.outcome === "did_not_finish" || s.outcome === "disqualified" ? R.outcome[s.outcome] : s.place ? ordinal(s.place) : R.outcome[s.outcome];
          return (
            <li key={s.heatId} className={s.place === null ? "wo" : ""} data-outcome={s.outcome} data-testid="path-step">
              <span className="pr">{s.roundName}</span>
              <span className="pp">{word}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Tiles({ report }: { report: RiderReport }) {
  return (
    <div className="tiles" data-testid="report-tiles">
      {tileViews(report).map((t) => (
        <div key={t.id} className="tile" data-testid={`tile-${t.id}`}>
          <div className="tl">{t.label}</div>
          <div className="tv">
            {t.value}
            {t.small ? <small>{t.small}</small> : null}
          </div>
          <div className="ts">{t.sub}</div>
        </div>
      ))}
    </div>
  );
}

function Takeaways({ report }: { report: RiderReport }) {
  const t = report.takeaways;
  if (!t.strength && !t.train && !t.strategy) return null;
  return (
    <div className="card" data-testid="report-takeaways">
      <h3>{R.takeawaysHeading}</h3>
      <div className="takes">
        {t.strength ? (
          <div className="take" data-testid="take-strength">
            <div className="tk-l">
              <span className="tk-i" aria-hidden="true">
                ▲
              </span>
              {R.strengthLabel}
            </div>
            <p>{strengthText(t.strength, report)}</p>
          </div>
        ) : null}
        {t.train ? (
          <div className="take" data-testid="take-train">
            <div className="tk-l">
              <span className="tk-i" aria-hidden="true">
                ◎
              </span>
              {R.trainLabel}
            </div>
            <p>{trainText(t.train, report)}</p>
          </div>
        ) : null}
        {t.strategy ? (
          <div className="take" data-testid="take-strategy">
            <div className="tk-l">
              <span className="tk-i" aria-hidden="true">
                ⏱
              </span>
              {R.strategyLabel}
            </div>
            <p>{strategyText(t.strategy, report)}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Heat({ heat, report, top }: { heat: HeatRow; report: RiderReport; top: number }) {
  const H = R.heat;
  const pill = heatPill(heat);
  const behind = behindText(heat, report);
  const sideLetter = (s: "left" | "right" | null) => (s === null ? "" : (s === "right" ? report.sideWords.right : report.sideWords.left).charAt(0).toUpperCase());
  const sideWord = (s: "left" | "right" | null) => (s === null ? undefined : s === "right" ? report.sideWords.right : report.sideWords.left);
  return (
    <div className="heat" data-testid="report-heat">
      <div className="hh">
        <div>
          {heat.lycra ? <span className="lyc" aria-hidden="true" style={{ ["--lyc" as string]: heat.lycra }} /> : null}
          <strong>{heat.roundName}</strong> <span className="hno">{heat.heatNo}</span>
        </div>
        <span className={`res${pill.win ? " win" : heat.place !== null && !heat.isFinal && !heat.toRound ? " out" : ""}`} data-outcome={heat.outcome}>
          {pill.text}
        </span>
      </div>
      <div className="hm">{H.meta(heat.jumps, heat.cap, heat.crashes, heat.crashRate === null ? null : percent(heat.crashRate), heat.firstLandedAt === null ? null : clock(heat.firstLandedAt), heat.paceSec === null ? null : clock(heat.paceSec))}</div>
      {heat.total !== null && heat.tricksTotal !== null ? (
        <div className="tot" data-testid="heat-total">
          {H.total(score(report, heat.total), null, score(report, heat.tricksTotal), heat.impression === null ? null : report.scoreName, heat.impression === null ? null : score(report, heat.impression))}
          {behind ? ` · ${behind}` : ""}
        </div>
      ) : null}
      {heat.jumps ? (
        <>
          <HeatStrip heat={heat} top={top} decimals={report.decimals} />
          <ol className="jumps" data-testid="jump-list">
            {heat.jumpLines.map((j) => (
              <li key={j.seq} className={`${j.landed ? "ok" : "cr"}${j.counted ? " ct" : ""}`} data-testid="jump-line">
                <span className="jt">{clock(j.at_sec)}</span>
                <span className={`jn${j.trick ? "" : " muted"}`}>{j.trick ?? H.notLogged}</span>
                <span className="jd" title={sideWord(j.side)}>
                  {sideLetter(j.side)}
                </span>
                <span className="js">{j.landed ? score(report, j.score) : H.crash}</span>
                {j.counted ? <span className="jb">{H.counts}</span> : null}
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </div>
  );
}

function Mix({ report }: { report: RiderReport }) {
  const m = report.mix;
  if (!m.families.length) return null;
  const total = m.families.reduce((s, f) => s + f.tried, 0);
  const cls = (i: number, key: string) => (key === "not_logged" ? "f4" : FAMILY_CLASS[Math.min(i, 3)]);
  return (
    <div className="card" data-testid="report-mix">
      <h3>{R.mixHeading}</h3>
      <div className="mix">
        {m.families.map((f, i) => (
          <span key={f.key} className={`seg ${cls(i, f.key)}`} style={{ inlineSize: `${(f.tried / total) * 100}%` }} title={familyName(report, f.key)} />
        ))}
      </div>
      <ul className="legend">
        {m.families.map((f, i) => (
          <li key={f.key} data-testid="mix-row">
            <span className={`sw ${cls(i, f.key)}`} aria-hidden="true" />
            {familyName(report, f.key)}{" "}
            <b>
              {f.landed}/{f.tried}
            </b>
            {f.average === null ? "" : ` · avg ${score(report, f.average)}`}
          </li>
        ))}
      </ul>
      <p className="note">{R.mixNote}</p>
      {m.landedTricks.length ? (
        <>
          <h4>{R.mixLanded}</h4>
          <div className="tags">
            {m.landedTricks.map((c) => (
              <span key={c.trick} className="tag">
                {c.trick} {c.count > 1 ? <b>×{c.count}</b> : null}
              </span>
            ))}
          </div>
        </>
      ) : null}
      {m.stillToLand.length ? (
        <>
          <h4>{R.mixStill}</h4>
          <div className="tags">
            {m.stillToLand.map((t) => (
              <span key={t} className="tag red">
                {t}
              </span>
            ))}
          </div>
        </>
      ) : null}
      {m.crashesNoName ? <p className="note">{R.crashesNoName(m.crashesNoName)}</p> : null}
    </div>
  );
}

const compareLabel = (key: string, name: string): string => {
  const v = R.compare[key];
  return typeof v === "function" ? v(name) : v;
};
const compareValue = (c: CompareRow, x: number | null, d: number): string => (x === null ? "–" : c.kind === "percent" ? percent(x) : key1(x, d));
const key1 = (x: number, d: number): string => (Math.round(x * 10 ** d) / 10 ** d).toFixed(d === 0 ? 0 : Math.min(d, 1));

function Compare({ report }: { report: RiderReport }) {
  return (
    <div className="card" data-testid="report-compare">
      <h3>{R.compareHeading}</h3>
      <p className="note">{R.compareNote(report.fieldSize.riders, report.fieldSize.finalists)}</p>
      {report.compare.map((c) => {
        const bar = (cls: string, who: string, v: number | null) => (
          <div className={`bar ${cls}`}>
            <span className="who">{who}</span>
            <span className="track">
              <span className="fill" style={{ inlineSize: `${v === null ? 0 : Math.min(100, (v / c.scale) * 100)}%` }} />
            </span>
            <span className="val">{compareValue(c, v, report.decimals)}</span>
          </div>
        );
        return (
          <div key={c.key} className="cmp" data-testid="compare-row">
            <div className="cmp-l">{compareLabel(c.key, report.scoreName)}</div>
            {bar("you", R.youLabel, c.me)}
            {bar("fieldb", R.allLabel, c.all)}
            {c.finalists !== null ? bar("fin", R.finalistsLabel, c.finalists) : null}
          </div>
        );
      })}
    </div>
  );
}

function Notes({ report }: { report: RiderReport }) {
  return (
    <div className="card notes" data-testid="report-notes">
      <h3>{R.notesHeading}</h3>
      {report.suggested.length ? (
        <div className="sugg" data-testid="report-suggested">
          <div className="tk-l">{R.suggestedHeading}</div>
          <ul>
            {report.suggested.map((p, i) => (
              <li key={i} data-testid="goal">
                {factText(p, report)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {R.notesPrompts.map((q) => (
        <div key={q} data-testid="reflect">
          <span className="prompt-l">{q}</span>
          <div className="prompt" aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}

/** The rider's report: the whole page, laid out like the owner's reference, with its own Daylight / Dark switch and the Sendbook background. */
export function RiderReportView({ report, picker, slug, preview }: { report: RiderReport; picker: PickerItem[]; slug: string; preview: boolean }) {
  const [theme, setTheme] = useBeachTheme();
  const top = Math.max(6, Math.ceil(report.tiles.bestTrick.eventBest ?? 6));
  return (
    <div className="home home-sky report" data-theme={theme === "dark" ? "dark" : "light"} data-testid="rider-report">
      <HomeSky beside={{ column: ".report .wrap", header: ".report .top" }} />
      <main className="wrap" style={{ maxInlineSize: 560, marginInline: "auto", padding: "14px 14px 48px" }}>
        <header className="top">
          <div className="brand">
            Sendbook<small>{R.brand}</small>
          </div>
          {picker.length ? <Picker items={picker} current={report.entryId} slug={slug} preview={preview} /> : null}
        </header>
        <div className="theme-row">
          <div className={`home-theme ${theme === "dark" ? "beach-dark" : "beach-day"} beach-text-normal`} data-testid="report-theme">
            <ThemeSwitch theme={theme} onChange={setTheme} />
          </div>
        </div>
        {preview ? (
          <p className="preview-banner" data-testid="report-preview-banner">
            {R.previewBanner}
          </p>
        ) : null}
        <div className="owner" data-testid="report-note">
          <strong>{R.note(report.eventName, report.eventLocation).split(". ")[0]}.</strong> {R.note(report.eventName, report.eventLocation).split(". ").slice(1).join(". ")}
        </div>
        <section className="report-body" id={`r-${report.entryId}`}>
          <Hero report={report} />
          {report.highlights.length ? (
            <div className="card" data-testid="report-highlights">
              <h3>{R.highlightsHeading}</h3>
              <ul className="hl hl-list">
                {report.highlights.map((h) => (
                  <li key={h.kind} data-testid="highlight">
                    {highlightText(h, report)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <Tiles report={report} />
          <Takeaways report={report} />
          {report.bestTricks.length ? (
            <div className="card" data-testid="report-best">
              <h3>{R.bestHeading}</h3>
              <p className="note">{R.bestNote}</p>
              <ol className="best">
                {report.bestTricks.map((b, i) => (
                  <li key={`${b.trick}-${i}`} data-testid="best-trick">
                    <span className="rk">{i + 1}</span>
                    <span className="bn">{b.trick}</span>
                    <span className="bs">{score(report, b.score)}</span>
                    <span className="bh">{R.bestWhere(b.roundName, clock(b.at_sec))}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {report.heats.length ? (
            <div className="card" data-testid="report-heats">
              <h3>{R.heatsHeading}</h3>
              <p className="note">{R.heatsNote}</p>
              {report.heats.map((h) => (
                <Heat key={h.heatId} heat={h} report={report} top={top} />
              ))}
            </div>
          ) : null}
          <Mix report={report} />
          <Compare report={report} />
          <Notes report={report} />
        </section>
        <p className="foot">{R.foot(report.eventName)}</p>
      </main>
    </div>
  );
}
void whole;
