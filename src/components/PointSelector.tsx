/**
 * The numeric point selector that drives the history chart.
 *
 * Only numeric measurement points appear here. A boolean or string point is a
 * legitimate measurement and gets a card, but it has no numeric axis, so it is
 * never offered as a chart subject.
 */

import type { ConfigurationPointDto } from "../api/types";

interface PointSelectorProps {
  points: ConfigurationPointDto[];
  selectedId: string | null;
  onSelect: (pointId: string) => void;
}

export function PointSelector({ points, selectedId, onSelect }: PointSelectorProps) {
  return (
    <div className="field">
      <label className="field__label" htmlFor="point-select">
        Charted measurement
      </label>
      <select
        id="point-select"
        className="field__control"
        value={selectedId ?? ""}
        disabled={points.length === 0}
        onChange={(event) => {
          onSelect(event.target.value);
        }}
      >
        {points.map((point) => (
          <option key={point.id} value={point.id}>
            {point.name}
            {point.unit ? ` (${point.unit})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
