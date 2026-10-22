import type { HeatRow } from "@/lib/engine/report";
import { clock, score2 } from "@/lib/public/report-text";
import { copy } from "@/lib/ui-copy";

const W = 320;
const H = 116;
const PAD_X = 12;
const TOP = 22;
const BASE = 92;

/**
 * One heat from start to end: a dot for every landed trick placed by its time and its published score, a cross at the bottom for every crash, a dashed line at the
 * average landed trick of the heat, and the tricks that counted drawn larger with their score. Words as well as shapes (a list of every jump sits under it).
 */
export function HeatTimeline({ heat }: { heat: HeatRow }) {
  const best = Math.max(
    1,
    ...heat.timeline.map((p) => p.score ?? 0),
    heat.fieldAverage ?? 0,
  );
  const x = (f: number) => PAD_X + f * (W - 2 * PAD_X);
  const y = (s: number) => BASE - (s / best) * (BASE - TOP);
  const landed = heat.timeline.filter((p) => p.landed).length;
  const label = `${copy.report.heat.timelineLabel}. ${landed} ${copy.report.heat.landed.toLowerCase()}, ${heat.timeline.length - landed} ${copy.report.heat.crash.toLowerCase()}`;
  return (
    <div>
      <svg
        className="r-timeline"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label}
        data-testid="heat-timeline"
      >
        <line
          className="r-axis"
          x1={PAD_X}
          x2={W - PAD_X}
          y1={BASE}
          y2={BASE}
        />
        {heat.fieldAverage !== null ? (
          <line
            className="r-avg"
            x1={PAD_X}
            x2={W - PAD_X}
            y1={y(heat.fieldAverage)}
            y2={y(heat.fieldAverage)}
            data-testid="field-average-line"
          />
        ) : null}
        {heat.timeline.map((p, i) =>
          p.landed ? (
            p.counted ? (
              <g key={i} data-testid="timeline-counted">
                <circle
                  className="r-dot"
                  cx={x(p.x)}
                  cy={y(p.score ?? 0)}
                  r={6}
                />
                <text
                  className="r-score"
                  x={x(p.x)}
                  y={y(p.score ?? 0) - 9}
                  textAnchor="middle"
                >
                  {score2(p.score)}
                </text>
              </g>
            ) : (
              <circle
                key={i}
                className="r-dot-small"
                cx={x(p.x)}
                cy={y(p.score ?? 0)}
                r={3.5}
                data-testid="timeline-landed"
              />
            )
          ) : (
            <g key={i} data-testid="timeline-crash">
              <line
                className="r-cross"
                x1={x(p.x) - 4}
                x2={x(p.x) + 4}
                y1={BASE - 8}
                y2={BASE}
              />
              <line
                className="r-cross"
                x1={x(p.x) - 4}
                x2={x(p.x) + 4}
                y1={BASE}
                y2={BASE - 8}
              />
            </g>
          ),
        )}
        <text x={PAD_X} y={H - 6}>
          {clock(0)}
        </text>
        <text x={W / 2} y={H - 6} textAnchor="middle">
          {clock(Math.round(heat.lengthSec / 2))}
        </text>
        <text x={W - PAD_X} y={H - 6} textAnchor="end">
          {clock(heat.lengthSec)}
        </text>
      </svg>
      {heat.fieldAverage !== null ? (
        <p
          className="r-foot"
          style={{ margin: 0 }}
          data-testid="field-average-legend"
        >
          - - - {copy.report.heat.fieldAverage}: {score2(heat.fieldAverage)}
        </p>
      ) : null}
    </div>
  );
}
