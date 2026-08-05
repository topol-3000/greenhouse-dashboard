/**
 * The loaded telemetry window as text.
 *
 * This is the chart's accessible equivalent and, for a boolean or textual
 * point, the only honest presentation of a history there is. It carries every
 * readable sample — including the ones the chart could not plot — with the two
 * timestamps the contract publishes kept apart, because `observed_at` is when a
 * greenhouse measured something and `received_at` is when the cloud heard about
 * it, and presenting either as the other would be a small lie about the data.
 *
 * It is inside a `details` element so that two hundred rows do not push the
 * chart off the screen. `details` is keyboard-operable and announced without
 * any scripting, which a bespoke disclosure would have to re-earn.
 */

import {
  CTable,
  CTableBody,
  CTableCaption,
  CTableDataCell,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from "@coreui/react";
import { formatContractUnknown, formatContractValue, formatIsoInstant } from "../../shared/format";
import type { SeriesSample } from "./measurements";

interface SampleTableProps {
  pointName: string;
  samples: readonly SeriesSample[];
  /** Whether the whole window shares one unit, which then leaves the rows. */
  sharedUnit: string | null;
  /** True when units differ between samples, so each row must carry its own. */
  showUnitColumn: boolean;
}

export function SampleTable({ pointName, samples, sharedUnit, showUnitColumn }: SampleTableProps) {
  return (
    <details data-testid="sample-table-disclosure">
      <summary className="py-2 fw-semibold small">
        Show the {samples.length} loaded sample{samples.length === 1 ? "" : "s"} as a table
      </summary>
      {/* A wide table scrolls inside its own box, never the page. */}
      <CTable responsive small align="top" className="mt-2 mb-0" data-testid="sample-table">
        <CTableCaption className="visually-hidden">
          Loaded telemetry samples for {pointName}, oldest observation first
          {showUnitColumn || sharedUnit === null ? "" : ` (${sharedUnit})`}
        </CTableCaption>
        <CTableHead>
          <CTableRow>
            <CTableHeaderCell scope="col">Observed at</CTableHeaderCell>
            <CTableHeaderCell scope="col">Value</CTableHeaderCell>
            {showUnitColumn ? <CTableHeaderCell scope="col">Unit</CTableHeaderCell> : null}
            <CTableHeaderCell scope="col">Quality</CTableHeaderCell>
            <CTableHeaderCell scope="col">Received at</CTableHeaderCell>
          </CTableRow>
        </CTableHead>
        <CTableBody>
          {samples.map((sample) => (
            <CTableRow key={sample.id}>
              <CTableHeaderCell scope="row" className="fw-normal text-nowrap">
                <time dateTime={sample.observedAt}>{formatIsoInstant(sample.observedAt)}</time>
              </CTableHeaderCell>
              <CTableDataCell>{formatContractUnknown(sample.value)}</CTableDataCell>
              {showUnitColumn ? (
                <CTableDataCell>{sample.unit ?? "Unit not provided"}</CTableDataCell>
              ) : null}
              <CTableDataCell>{formatContractValue(sample.quality)}</CTableDataCell>
              <CTableDataCell className="text-nowrap">
                <time dateTime={sample.receivedAt}>{formatIsoInstant(sample.receivedAt)}</time>
              </CTableDataCell>
            </CTableRow>
          ))}
        </CTableBody>
      </CTable>
    </details>
  );
}
