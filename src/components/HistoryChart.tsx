/**
 * The history chart for one numeric measurement point.
 *
 * One series, so there is no legend: the heading names the point. Every numeric
 * point gets its own card in the history grid, so the heading is what tells the
 * charts apart — a point with no samples yet keeps its card and says so, rather
 * than vanishing from the grid.
 *
 * The chart is never the only source of the data — a text summary sits above it
 * and the full sample table is available underneath, which is also what makes
 * the reading available to a screen reader and in forced-colors mode. The
 * summary is the figure's `figcaption` and therefore its last child, with CSS
 * ordering it back under the heading.
 */

import { useId, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ConfigurationPointDto } from "../api/types";
import { formatClock, formatInstant, formatNumber } from "../domain/format";
import type { ChartSample } from "../domain/points";
import { summariseSeries } from "../domain/points";

interface HistoryChartProps {
  point: ConfigurationPointDto;
  samples: ChartSample[];
}

/** Tooltip body; Recharts supplies loosely typed payload entries. */
function ChartTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean | undefined;
  payload?: { payload: ChartSample }[] | undefined;
  unit: string | null;
}) {
  const entry = payload?.[0]?.payload;
  if (!active || !entry) {
    return null;
  }
  return (
    <div className="chart-tooltip">
      <strong>
        {formatNumber(entry.value)}
        {unit ? ` ${unit}` : ""}
      </strong>
      <span>{formatInstant(entry.observedAt)}</span>
    </div>
  );
}

export function HistoryChart({ point, samples }: HistoryChartProps) {
  const [tableOpen, setTableOpen] = useState(false);
  const summary = summariseSeries(samples);
  const tableId = useId();
  const unitSuffix = point.unit ? ` ${point.unit}` : "";

  const heading = (
    <h3 className="chart__title">
      {point.name}
      {point.unit ? <span className="chart__unit"> ({point.unit})</span> : null}
    </h3>
  );

  if (samples.length === 0) {
    return (
      <figure className="chart" data-testid="history-chart" data-point-code={point.code}>
        {heading}
        <p className="chart-empty" data-testid="chart-empty">
          No numeric samples have been recorded for {point.name} yet.
        </p>
      </figure>
    );
  }

  return (
    <figure className="chart" data-testid="history-chart" data-point-code={point.code}>
      {heading}

      <div className="chart__plot" role="img" aria-label={`Line chart of ${point.name} over time.`}>
        <ResponsiveContainer width="100%" height={280}>
          {/*
            Recharts' own accessibility layer puts a focusable
            `role="application"` svg inside this `role="img"` wrapper, which
            contradicts it: the drawing is presentational here, and the summary
            and the sample table are what carry the data. Left on, every chart
            would also add a dead tab stop between the charts' real controls.
          */}
          <LineChart
            data={samples}
            margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
            accessibilityLayer={false}
          >
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={["dataMin", "dataMax"]}
              scale="time"
              tickFormatter={formatClock}
              stroke="var(--chart-axis)"
              tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
              minTickGap={32}
            />
            <YAxis
              stroke="var(--chart-axis)"
              tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
              width={56}
              domain={["auto", "auto"]}
            />
            <Tooltip
              content={<ChartTooltip unit={point.unit} />}
              cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--series-1)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface-1)" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <button
        type="button"
        className="button button--inline"
        aria-expanded={tableOpen}
        aria-controls={tableId}
        onClick={() => {
          setTableOpen((open) => !open);
        }}
      >
        {tableOpen ? "Hide sample table" : "Show sample table"}
      </button>

      {tableOpen ? (
        <div className="chart__table-wrap" id={tableId}>
          <table className="chart__table">
            <caption>
              {point.name} samples, oldest first{point.unit ? ` (${point.unit})` : ""}
            </caption>
            <thead>
              <tr>
                <th scope="col">Observed at</th>
                <th scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              {samples.map((sample) => (
                <tr key={`${sample.observedAt}-${String(sample.timestamp)}`}>
                  <td>
                    <time dateTime={sample.observedAt}>{formatInstant(sample.observedAt)}</time>
                  </td>
                  <td>{formatNumber(sample.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <figcaption className="chart__summary" data-testid="chart-summary">
        {summary.count} sample{summary.count === 1 ? "" : "s"} for {point.name}. Latest{" "}
        {formatNumber(summary.latest)}
        {unitSuffix}, ranging {formatNumber(summary.min)}–{formatNumber(summary.max)}
        {unitSuffix} between {formatInstant(summary.firstObservedAt)} and{" "}
        {formatInstant(summary.lastObservedAt)}.
      </figcaption>
    </figure>
  );
}
