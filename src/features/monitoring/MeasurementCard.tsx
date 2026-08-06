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
 *
 * The card knows nothing about the zone it is shown under. It is rendered
 * inside one control zone's monitoring, under each zone of a facility, and on
 * the landing page, and the only thing that changes between them is what the
 * caller puts in {@link MeasurementCardProps.action} — a button that selects
 * this point's history, or a link into the zone that owns it. That is also why
 * the heading's identifier is generated rather than built from the point's own
 * id: the same point may legitimately appear under two zones on one page, and
 * two elements may not share an id.
 */

import { CCard, CCardBody, CCardTitle } from "@coreui/react";
import type { ReactNode } from "react";
import { useId } from "react";
import type { ZoneMeasurement } from "./measurements";
import { ObservedInstant } from "../../components/ObservedInstant";
import { formatContractUnknown, formatContractValue } from "../../shared/format";
import { MetaList } from "../topology/MetaList";

interface MeasurementCardProps {
  measurement: ZoneMeasurement;
  /** What this card offers the customer, decided by whoever renders it. */
  action?: ReactNode;
}

export function MeasurementCard({ measurement, action }: MeasurementCardProps) {
  const { state } = measurement;
  const headingId = useId();

  return (
    <CCard
      className="h-100"
      data-testid="measurement-card"
      data-point-id={measurement.pointId}
      aria-labelledby={headingId}
    >
      <CCardBody className="d-flex flex-column align-items-start gap-2">
        <CCardTitle as="h4" className="text-break mb-0" id={headingId}>
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
            { label: "Observed at", value: <ObservedInstant iso={state.observed_at} /> },
            { label: "Point code", value: <code>{measurement.code}</code> },
            { label: "Data type", value: formatContractValue(measurement.dataType) },
          ]}
        />

        {action === undefined ? null : <div className="mt-auto">{action}</div>}
      </CCardBody>
    </CCard>
  );
}
