/**
 * The responsive grid of active measurement points.
 *
 * Each card shows what the API published for that point and nothing more: the
 * label and type it is configured with, its current reading, the unit snapshot
 * beside that reading, the quality the producer reported, and when the
 * measurement was observed. A point that has never reported shows an explicit
 * no-data dash — never a zero.
 */

import type { ConfigurationPointDto } from "../api/types";
import {
  formatInstant,
  formatPointValue,
  formatUnit,
  humaniseToken,
  NO_DATA_TEXT,
} from "../domain/format";
import { hasCurrentValue, NO_DATA_QUALITY } from "../domain/points";

/** Quality values that mean the reading should be treated with suspicion. */
const SUSPECT_QUALITY = new Set(["bad", "stale", "out_of_range", "sensor_fault", "uncertain"]);

function qualityTone(quality: string, hasValue: boolean): string {
  if (quality === NO_DATA_QUALITY || !hasValue) return "none";
  if (SUSPECT_QUALITY.has(quality)) return "suspect";
  return "good";
}

function MeasurementCard({ point }: { point: ConfigurationPointDto }) {
  const hasValue = hasCurrentValue(point);
  const unit = formatUnit(point);
  const tone = qualityTone(point.state.quality, hasValue);

  return (
    <li className="card" data-testid="measurement-card" data-point-code={point.code}>
      <h3 className="card__title">{point.name}</h3>
      <p className="card__meta">
        {point.metric_type ? humaniseToken(point.metric_type) : humaniseToken(point.point_kind)}
      </p>
      <p className="card__reading">
        <span className="card__value" data-testid="card-value">
          {formatPointValue(point)}
        </span>
        {unit ? (
          <span className="card__unit" data-testid="card-unit">
            {unit}
          </span>
        ) : null}
      </p>
      <dl className="card__facts">
        <div className="card__fact">
          <dt>Quality</dt>
          <dd data-testid="card-quality">
            <span className={`badge badge--${tone}`}>
              {point.state.quality ? humaniseToken(point.state.quality) : NO_DATA_TEXT}
            </span>
          </dd>
        </div>
        <div className="card__fact">
          <dt>Observed</dt>
          <dd data-testid="card-observed-at">
            {point.state.observed_at ? (
              <time dateTime={point.state.observed_at}>
                {formatInstant(point.state.observed_at)}
              </time>
            ) : (
              NO_DATA_TEXT
            )}
          </dd>
        </div>
      </dl>
    </li>
  );
}

export function MeasurementCards({ points }: { points: ConfigurationPointDto[] }) {
  return (
    <ul className="card-grid" aria-label="Active measurement points">
      {points.map((point) => (
        <MeasurementCard key={point.id} point={point} />
      ))}
    </ul>
  );
}
