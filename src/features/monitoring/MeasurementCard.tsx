/**
 * One measurement point's last known state.
 *
 * Every line of it is a field the API published. The card never says a reading
 * is normal, high, low, safe or fresh, because the contract defines none of
 * those: `min_value` and `max_value` are not part of the configuration
 * document, and the only statement about trustworthiness the backend makes is
 * `DataQuality`, which is shown as it arrived.
 *
 * That last part is why the quality sits *with* the value rather than in the
 * list below it. `0 ppm` and `0 ppm, uncertain` are different facts, and a
 * qualifier five rows down is one a reader scanning a board of cards will not
 * see. The badge appears for every member except `good` — an allowlist, so a
 * member the contract gains later cannot arrive looking trustworthy — and
 * carries the backend's own word with the raw enum beside it. Its colour is
 * deliberately neutral: choosing danger over warning would be this portal
 * ranking `DataQuality`, and the contract publishes no such order.
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

import { CBadge, CCard, CCardBody, CCardTitle } from "@coreui/react";
import type { ReactNode } from "react";
import { useId } from "react";
import type { ZoneMeasurement } from "./measurements";
import { isQualifiedQuality } from "./measurements";
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
            {measurement.unit === null ? (
              // The unit moved onto the value line, so its absence has to move
              // with it. A reading whose point publishes no unit still says so.
              <span className="fs-6 fw-normal fst-italic text-body-secondary">
                {" "}
                no unit published
              </span>
            ) : (
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

        {/*
          A reading the backend qualified must not look like one it did not.
          The qualifier sits with the value rather than five rows down a list,
          because "0 ppm, uncertain" and "0 ppm" are different facts.

          `color="secondary"` deliberately, never a severity colour: the word
          carries the meaning and the raw enum sits beside it, and choosing
          danger over warning would be the portal ranking `DataQuality` members,
          which no contract field supports. `no_data` gets no badge — "No data
          yet" above already states the absence at full weight.
        */}
        {measurement.hasReading && isQualifiedQuality(state.quality) ? (
          <p className="mb-0" data-testid="measurement-quality">
            <CBadge color="secondary" className="me-1">
              {formatContractValue(state.quality)}
            </CBadge>
            <code>{state.quality}</code>
          </p>
        ) : null}

        <MetaList
          testId="measurement-meta"
          items={[
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
