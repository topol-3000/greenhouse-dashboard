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
    <details className="samples" data-testid="sample-table-disclosure">
      <summary className="samples__summary">
        Show the {samples.length} loaded sample{samples.length === 1 ? "" : "s"} as a table
      </summary>
      <div className="table-scroll">
        <table className="table" data-testid="sample-table">
          <caption className="visually-hidden">
            Loaded telemetry samples for {pointName}, oldest observation first
            {showUnitColumn || sharedUnit === null ? "" : ` (${sharedUnit})`}
          </caption>
          <thead>
            <tr>
              <th scope="col">Observed at</th>
              <th scope="col">Value</th>
              {showUnitColumn ? <th scope="col">Unit</th> : null}
              <th scope="col">Quality</th>
              <th scope="col">Received at</th>
            </tr>
          </thead>
          <tbody>
            {samples.map((sample) => (
              <tr key={sample.id}>
                <th scope="row">
                  <time dateTime={sample.observedAt}>{formatIsoInstant(sample.observedAt)}</time>
                </th>
                <td>{formatContractUnknown(sample.value)}</td>
                {showUnitColumn ? <td>{sample.unit ?? "Unit not provided"}</td> : null}
                <td>{formatContractValue(sample.quality)}</td>
                <td>
                  <time dateTime={sample.receivedAt}>{formatIsoInstant(sample.receivedAt)}</time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
