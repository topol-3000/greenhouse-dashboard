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

import { CButton, CCard, CCardBody, CCardTitle } from "@coreui/react";
import type { ZoneMeasurement } from "./measurements";
import { formatContractUnknown, formatContractValue, formatIsoInstant } from "../../shared/format";
import { MetaList } from "../topology/MetaList";

interface MeasurementCardProps {
  measurement: ZoneMeasurement;
  selected: boolean;
  onSelect: () => void;
}

export function MeasurementCard({ measurement, selected, onSelect }: MeasurementCardProps) {
  const { state } = measurement;
  const observedAt = state.observed_at;

  return (
    <CCard
      className="h-100"
      data-testid="measurement-card"
      data-point-id={measurement.pointId}
      aria-labelledby={`measurement-${measurement.pointId}`}
    >
      <CCardBody className="d-flex flex-column align-items-start gap-2">
        <CCardTitle as="h4" className="text-break mb-0" id={`measurement-${measurement.pointId}`}>
          {measurement.name}
        </CCardTitle>
        <p className="text-uppercase small text-body-secondary">
          {formatContractValue(measurement.role)} · {formatContractValue(measurement.metricType)}
        </p>

        {measurement.hasReading ? (
          <p className="fs-2 fw-semibold lh-sm text-break" data-testid="measurement-value">
            <span>{formatContractUnknown(state.value)}</span>
            {measurement.unit === null ? null : (
              <span className="fs-5 fw-medium text-body-secondary"> {measurement.unit}</span>
            )}
          </p>
        ) : (
          // "No data yet" is a state, not a reading: it is set apart by weight,
          // size and words as well, never by colour alone.
          <p className="fs-5 fst-italic text-body-secondary" data-testid="measurement-value">
            No data yet
          </p>
        )}

        <MetaList
          testId="measurement-meta"
          items={[
            { label: "Unit", value: measurement.unit ?? "Unit not provided" },
            { label: "Quality", value: formatContractValue(state.quality) },
            {
              label: "Observed at",
              value:
                observedAt === null ? (
                  "Not observed yet"
                ) : (
                  <time dateTime={observedAt}>{formatIsoInstant(observedAt)}</time>
                ),
            },
            { label: "Point code", value: <code>{measurement.code}</code> },
            { label: "Data type", value: formatContractValue(measurement.dataType) },
          ]}
        />

        <CButton
          type="button"
          color="secondary"
          variant="outline"
          size="sm"
          className="mt-auto"
          aria-pressed={selected}
          onClick={onSelect}
          data-testid="select-point"
        >
          {selected
            ? `Showing history of ${measurement.name}`
            : `Show history of ${measurement.name}`}
        </CButton>
      </CCardBody>
    </CCard>
  );
}
