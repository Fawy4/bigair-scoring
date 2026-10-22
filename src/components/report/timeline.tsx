import type { HeatRow } from "@/lib/engine/report";
import { clock, score } from "@/lib/public/report-text";
import { copy } from "@/lib/ui-copy";

const R = copy.report.heat;
const X0 = 14;
const X1 = 312;
const BASE = 66;
const HEIGHT = 50;

/**
 * One heat from start to end, drawn the way the owner's reference draws it: a tick every minute with a time every 2 (or 5) minutes, a dot on a stem for every landed trick
 * placed by its time and its score, a cross on the baseline for every crash, a dashed line at the field's average, and the counting tricks as big dots with their score.
 * `top` is the highest score the scale reaches (at least 6): the same for every heat of the report, so heats compare.
 */
export function HeatStrip({ heat, top, decimals }: { heat: HeatRow; top: number; decimals: number }) {
  const px = HEIGHT / top;
  const len = Math.max(60, heat.lengthSec);
  const x = (f: number) => X0 + f * (X1 - X0);
  const labelStep = len <= 12 * 60 ? 120 : len <= 40 * 60 ? 300 : 600;
  const ticks: number[] = [];
  for (let t = 0; t <= len; t += 60) ticks.push(t);
  const fmt = { decimals };
  const avgY = heat.fieldAverage === null ? 0 : BASE - heat.fieldAverage * px;
  const avgWords = heat.fieldAverage === null ? "" : `${R.fieldAverage} ${score(fmt, heat.fieldAverage)}`;
  const avgSpot = heat.fieldAverage === null ? null : averageLabelSpot(heat, avgWords.length * 3.8, avgY, x, px);
  return (
    <svg className="strip" viewBox="0 0 320 82" role="img" aria-label={R.timelineLabel} data-testid="heat-timeline">
      <line className="base" x1={X0} x2={X1} y1={BASE} y2={BASE} />
      {heat.fieldAverage !== null ? (
        <>
          <line className="avg" x1={X0} x2={X1} y1={BASE - heat.fieldAverage * px} y2={BASE - heat.fieldAverage * px} data-testid="field-average-line" />
          <text className="avgl" x={avgSpot?.x} y={avgSpot?.y} textAnchor="end">
            {avgWords}
          </text>
        </>
      ) : null}
      {ticks.map((t) => (
        <g key={t}>
          <line className="tick" x1={x(t / len)} x2={x(t / len)} y1={63} y2={69} />
          {t % labelStep === 0 ? (
            <text className="tlab" x={x(t / len)} y={80}>
              {clock(t)}
            </text>
          ) : null}
        </g>
      ))}
      {heat.timeline.map((p, i) => {
        const cx = x(p.x);
        if (!p.landed) {
          return (
            <g key={i} className="x" data-testid="timeline-crash">
              <title>{`${clock(p.seconds)} · ${p.trick ?? R.notLogged} · ${R.crash.toLowerCase()}`}</title>
              <line x1={cx - 4} x2={cx + 4} y1={62} y2={70} />
              <line x1={cx - 4} x2={cx + 4} y1={70} y2={62} />
            </g>
          );
        }
        const cy = BASE - (p.score ?? 0) * px;
        return (
          <g key={i}>
            <line className="stem" x1={cx} x2={cx} y1={BASE} y2={cy} />
            <circle className={p.counted ? "dot best" : "dot"} cx={cx} cy={cy} r={p.counted ? 5.5 : 4} data-testid={p.counted ? "timeline-counted" : "timeline-landed"}>
              <title>{`${clock(p.seconds)} · ${p.trick ?? R.notLogged} · ${score(fmt, p.score)}${p.counted ? ` · ${R.counts.toLowerCase()}` : ""}`}</title>
            </circle>
            {p.counted ? (
              <text className="blab" x={cx} y={cy - 8}>
                {score(fmt, p.score)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Where the "field average" words go: along the dashed line, above it or below it, from the right end towards the left in steps, the first place no dot or score touches (a stem is a
 * thin pale line: words over it stay readable, so it does not count). The words are never written over a dot or a score.
 */
function averageLabelSpot(heat: HeatRow, width: number, lineY: number, x: (f: number) => number, px: number): { x: number; y: number; anchor: "start" | "end" } {
  const marks = heat.timeline.filter((p) => p.landed).map((p) => ({ cx: x(p.x), cy: BASE - (p.score ?? 0) * px, big: p.counted }));
  const touches = (right: number, y: number): boolean => {
    const x0 = right - width - 3;
    const x1 = right + 3;
    const y0 = y - 9;
    const y1 = y + 4;
    return marks.some((m) => {
      const r = m.big ? 7 : 5.5;
      const dotHit = m.cx + r >= x0 && m.cx - r <= x1 && m.cy + r >= y0 && m.cy - r <= y1;
      // the score written above a counting trick
      const labelHit = m.big && m.cx + 10 >= x0 && m.cx - 10 <= x1 && m.cy - 16 <= y1 && m.cy - 8 >= y0 - 8;
      return dotHit || labelHit;
    });
  };
  for (const y of [lineY - 3, lineY + 9]) for (let right = X1; right - width >= X0; right -= 6) if (!touches(right, y) && y > 6 && y < BASE - 1) return { x: right, y, anchor: "end" };
  return { x: X1, y: lineY - 3, anchor: "end" };
}
