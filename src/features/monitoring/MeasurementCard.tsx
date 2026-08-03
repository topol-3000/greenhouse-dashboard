/**
 * One measurement point's last known state.
 *
 * Every line of it is a field the API published. The card never says a reading
 * is normal, high, low, safe or fresh, because the contract defines none of
 * those: `min_value` and `max_value` are not part of the configuration
 * document, and the only statement about trustworthiness the backend makes is
 * `DataQuality`, which is shown as it arrived.
 *
 * The distinction the card exists to keep is between a reading of `0` and no
 * reading at all. `0` and `false` are values the greenhouse reported; a point
 * that has never reported carries `value: null` with `quality: "no_data"`, and
 * it says so in words rather than showing a zero nobody measured.
 */

import type { ZoneMeasurement } from "./measurements";
import { formatContractUnknown, formatContractValue, formatIsoInstant } from "../../shared/format";

interface MeasurementCardProps {
  measurement: ZoneMeasurement;
  selected: boolean;
  onSelect: () => void;
}

export function MeasurementCard({ measurement, selected, onSelect }: MeasurementCardProps) {
  const { state } = measurement;
  const observedAt = state.observed_at;

  return (
    <article
      className="card measurement"
      data-testid="measurement-card"
      data-point-id={measurement.pointId}
      aria-labelledby={`measurement-${measurement.pointId}`}
    >
      <h4 className="card__title" id={`measurement-${measurement.pointId}`}>
        {measurement.name}
      </h4>
      <p className="card__subtitle">
        {formatContractValue(measurement.role)} · {formatContractValue(measurement.metricType)}
      </p>

      {measurement.hasReading ? (
        <p className="measurement__value" data-testid="measurement-value">
          <span className="measurement__number">{formatContractUnknown(state.value)}</span>
          {measurement.unit === null ? null : (
            <span className="measurement__unit"> {measurement.unit}</span>
          )}
        </p>
      ) : (
        <p
          className="measurement__value measurement__value--absent"
          data-testid="measurement-value"
        >
          No data yet
        </p>
      )}

      <dl className="meta" data-testid="measurement-meta">
        <div className="meta__row">
          <dt className="meta__label">Unit</dt>
          <dd className="meta__value">{measurement.unit ?? "Unit not provided"}</dd>
        </div>
        <div className="meta__row">
          <dt className="meta__label">Quality</dt>
          <dd className="meta__value">{formatContractValue(state.quality)}</dd>
        </div>
        <div className="meta__row">
          <dt className="meta__label">Observed at</dt>
          <dd className="meta__value">
            {observedAt === null ? (
              "Not observed yet"
            ) : (
              <time dateTime={observedAt}>{formatIsoInstant(observedAt)}</time>
            )}
          </dd>
        </div>
        <div className="meta__row">
          <dt className="meta__label">Point code</dt>
          <dd className="meta__value">
            <code>{measurement.code}</code>
          </dd>
        </div>
        <div className="meta__row">
          <dt className="meta__label">Data type</dt>
          <dd className="meta__value">{formatContractValue(measurement.dataType)}</dd>
        </div>
      </dl>

      <button
        type="button"
        className="button button--inline"
        aria-pressed={selected}
        onClick={onSelect}
        data-testid="select-point"
      >
        {selected
          ? `Showing history of ${measurement.name}`
          : `Show history of ${measurement.name}`}
      </button>
    </article>
  );
}
