/**
 * The telemetry chart for one numeric measurement point.
 *
 * Plain SVG, drawn from the samples the API returned. There is no charting
 * dependency because there is no need for one: a single series on a time axis
 * is a polyline, and adding a library for it would ship a large amount of code
 * to draw a line the portal can draw itself.
 *
 * What the drawing is not allowed to imply is what shapes it:
 *
 * - a run of samples is one polyline, and an unplottable sample ends the run,
 *   so a gap in the data is a gap in the line rather than a straight segment
 *   through a reading the backend never published;
 * - one sample is a point, never a trend;
 * - the axes are labelled with real values and real times, and the caption says
 *   in words what the picture says in pixels, so nothing here depends on being
 *   able to see it — or on hovering it, which a touch screen cannot do.
 *
 * Quality is not drawn. It is a per-sample fact the table below carries in
 * words; encoding it as colour in the plot would be meaning carried by colour
 * alone.
 */

import { CCard, CCardBody } from "@coreui/react";
import { useId, useRef } from "react";
import { formatAxisNumber, formatClock, formatIsoInstant } from "../../shared/format";
import type { SeriesSample } from "./measurements";
import { summariseSeries, toPlottableSegments } from "./measurements";
import { useElementWidth } from "./useElementWidth";

const PADDING = { top: 14, right: 14, bottom: 30, left: 60 } as const;
const HEIGHT = 260;
const FALLBACK_WIDTH = 640;

interface HistoryChartProps {
  /** The point this history belongs to, named in the chart's title. */
  pointName: string;
  /** The one unit the window carries, or `null` when the API published none. */
  unit: string | null;
  /** Every readable sample, already ordered by observation time. */
  samples: readonly SeriesSample[];
}

/** Map a value onto a pixel span, centring it when the span has no extent. */
function scale(value: number, min: number, max: number, from: number, to: number): number {
  if (max === min) {
    return (from + to) / 2;
  }
  return from + ((value - min) / (max - min)) * (to - from);
}

export function HistoryChart({ pointName, unit, samples }: HistoryChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(containerRef, FALLBACK_WIDTH);
  const titleId = useId();
  const descriptionId = useId();

  const segments = toPlottableSegments(samples);
  const plottable = segments.flat();
  const summary = summariseSeries(plottable);
  const unitSuffix = unit === null ? "" : ` ${unit}`;

  const plotWidth = Math.max(width - PADDING.left - PADDING.right, 80);
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const right = PADDING.left + plotWidth;
  const bottom = PADDING.top + plotHeight;

  if (plottable.length === 0) {
    return (
      <CCard>
        <CCardBody>
          <figure className="d-flex flex-column gap-2 mb-0" data-testid="history-chart">
            <figcaption>
              <span className="fw-semibold text-break" id={titleId}>
                Telemetry history — {pointName}
              </span>
            </figcaption>
            <p className="small text-body-secondary" data-testid="chart-summary">
              None of the loaded samples of {pointName} could be plotted, so there is no chart to
              draw.
            </p>
          </figure>
        </CCardBody>
      </CCard>
    );
  }

  const timestamps = plottable.map((sample) => sample.timestamp ?? 0);
  const values = plottable.map((sample) => sample.numericValue ?? 0);
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  const x = (sample: SeriesSample) =>
    scale(sample.timestamp ?? 0, minTime, maxTime, PADDING.left, right);
  const y = (sample: SeriesSample) =>
    scale(sample.numericValue ?? 0, minValue, maxValue, bottom, PADDING.top);

  const description =
    summary === null
      ? `No sample of ${pointName} could be plotted.`
      : `${String(summary.count)} plotted sample${summary.count === 1 ? "" : "s"} of ${pointName}. ` +
        `Latest ${formatAxisNumber(summary.latest)}${unitSuffix}, ` +
        `lowest ${formatAxisNumber(summary.minimum)}${unitSuffix}, ` +
        `highest ${formatAxisNumber(summary.maximum)}${unitSuffix}, ` +
        `between ${formatIsoInstant(summary.firstObservedAt)} and ${formatIsoInstant(summary.lastObservedAt)}.` +
        (summary.count === 1 ? " One sample shows a single reading, not a trend." : "");

  return (
    <CCard>
      <CCardBody>
        <figure className="d-flex flex-column gap-2 mb-0" data-testid="history-chart">
          <figcaption className="d-flex flex-column gap-1">
            <span className="fw-semibold text-break" id={titleId}>
              Telemetry history — {pointName}
              {unit === null ? "" : ` (${unit})`}
            </span>
            <span
              className="small text-body-secondary"
              id={descriptionId}
              data-testid="chart-summary"
            >
              {description}
            </span>
          </figcaption>

          <div className="chart__plot" ref={containerRef}>
            <svg
              role="img"
              aria-labelledby={`${titleId} ${descriptionId}`}
              width={width}
              height={HEIGHT}
              className="chart__svg"
              data-testid="history-chart-svg"
            >
              {/* Axes. Drawn as lines rather than as a full grid, so the plot stays
              readable at a phone's width. */}
              <line
                x1={PADDING.left}
                y1={PADDING.top}
                x2={PADDING.left}
                y2={bottom}
                className="chart__axis"
              />
              <line x1={PADDING.left} y1={bottom} x2={right} y2={bottom} className="chart__axis" />

              <text x={PADDING.left - 8} y={PADDING.top + 4} className="chart__tick chart__tick--y">
                {formatAxisNumber(maxValue)}
              </text>
              <text x={PADDING.left - 8} y={bottom} className="chart__tick chart__tick--y">
                {formatAxisNumber(minValue)}
              </text>
              <text x={PADDING.left} y={HEIGHT - 8} className="chart__tick">
                {formatClock(minTime)}
              </text>
              <text x={right} y={HEIGHT - 8} className="chart__tick chart__tick--end">
                {formatClock(maxTime)}
              </text>

              {segments.map((segment) => {
                const first = segment[0];
                if (first === undefined) {
                  return null;
                }
                if (segment.length === 1) {
                  // A run of one has no line to draw. It is marked so that a lone
                  // reading is visible instead of being an invisible zero-length
                  // polyline.
                  return (
                    <circle
                      key={first.id}
                      cx={x(first)}
                      cy={y(first)}
                      r={4}
                      className="chart__point"
                    />
                  );
                }
                return (
                  <polyline
                    key={first.id}
                    className="chart__line"
                    points={segment
                      .map((sample) => `${String(x(sample))},${String(y(sample))}`)
                      .join(" ")}
                  />
                );
              })}
            </svg>
          </div>
        </figure>
      </CCardBody>
    </CCard>
  );
}
