/**
 * The selected point's telemetry window.
 *
 * The panel's job is to be exact about what has been loaded. The contract's
 * history operation answers an `items` array with no total and no cursor, so
 * every state below says "the samples the API returned" and never "the
 * history", "the last hour" or "the latest hundred readings" — claims nothing
 * in the response could support.
 *
 * The states it keeps apart are the ones that would otherwise be confused:
 * nothing selected, a first load in flight, a first load that failed, a refresh
 * that failed over samples that are still on screen, a point that genuinely has
 * no telemetry, a value type that cannot be charted, and a window whose units
 * disagree.
 */

import { LoadingState, Note, StatePanel } from "../../components/StatePanel";
import {
  BackgroundRefreshNotice,
  RefreshFailurePanel,
  RequestErrorPanel,
} from "../../components/TopologyStates";
import { formatContractValue } from "../../shared/format";
import { HistoryChart } from "./HistoryChart";
import type { ZoneMeasurement } from "./measurements";
import { SampleTable } from "./SampleTable";
import type { TelemetryView } from "./useZoneMonitoring";

interface TelemetryHistoryPanelProps {
  selectedPoint: ZoneMeasurement | undefined;
  /** A `?point=` value naming no measurement of this zone. */
  hasUnknownSelection: boolean;
  telemetry: TelemetryView;
}

/** How much of the point's record this window is, said without overclaiming. */
function WindowNotice({
  pointName,
  loaded,
  limit,
  full,
}: {
  pointName: string;
  loaded: number;
  limit: number;
  full: boolean;
}) {
  return (
    <Note testId="history-window">
      Showing the {loaded} sample{loaded === 1 ? "" : "s"} the cloud API returned, ordered by
      observation time. The telemetry endpoint returns at most {limit} samples per request and
      publishes no total, so this is a bounded window of {pointName}&rsquo;s history, not its
      complete record.
      {full
        ? ` The response filled the ${String(limit)}-sample request, so more samples may exist.`
        : ""}
    </Note>
  );
}

export function TelemetryHistoryPanel({
  selectedPoint,
  hasUnknownSelection,
  telemetry,
}: TelemetryHistoryPanelProps) {
  if (hasUnknownSelection) {
    return (
      <StatePanel
        title="That measurement point is not in this control zone"
        tone="warning"
        headingLevel={4}
        testId="unknown-point-selection"
      >
        <p>
          The address names a point the cloud API does not list among this zone&rsquo;s active
          measurement points. Choose one of the measurement points above to load its history.
        </p>
      </StatePanel>
    );
  }

  if (selectedPoint === undefined) {
    return (
      <StatePanel
        title="No measurement point is selected"
        headingLevel={4}
        testId="history-unselected"
      >
        <p>
          Choose a measurement point above to load the telemetry history the cloud API has for it.
        </p>
      </StatePanel>
    );
  }

  const { series, window } = telemetry;

  if (telemetry.isLoading) {
    return <LoadingState label={`Loading telemetry history for ${selectedPoint.name}…`} />;
  }

  if (telemetry.error !== null && telemetry.error !== undefined) {
    return (
      <RequestErrorPanel
        title={`Telemetry history for ${selectedPoint.name} could not be loaded`}
        error={telemetry.error}
        onRetry={telemetry.refresh}
        retrying={telemetry.isRefreshing}
      />
    );
  }

  if (series === undefined || window === undefined) {
    return (
      <StatePanel
        title="No telemetry history has been loaded"
        headingLevel={4}
        testId="history-unselected"
      >
        <p>Choose a measurement point above to load its telemetry history.</p>
      </StatePanel>
    );
  }

  const refreshFailed = telemetry.refreshError !== null && telemetry.refreshError !== undefined;

  const header = (
    <>
      {refreshFailed ? (
        <RefreshFailurePanel
          error={telemetry.refreshError}
          onRetry={telemetry.refresh}
          retrying={telemetry.isRefreshing}
        />
      ) : null}
      {telemetry.isRefreshing ? (
        <BackgroundRefreshNotice
          announce={false}
          testId="history-refreshing"
          label="Refreshing this history from the cloud API…"
        />
      ) : null}
    </>
  );

  if (series.samples.length === 0) {
    return (
      <>
        {header}
        <StatePanel
          title={`No telemetry has been recorded for ${selectedPoint.name}`}
          headingLevel={4}
          testId="history-empty"
        >
          <p>
            The cloud API answered with no samples for this point. That is an answer, not a failure:
            the point exists and has no stored history yet.
          </p>
          {window.unreadableCount > 0 ? (
            <p data-testid="history-unreadable">
              {window.unreadableCount} entr{window.unreadableCount === 1 ? "y" : "ies"} in the
              response did not match the published sample schema and could not be read.
            </p>
          ) : null}
        </StatePanel>
      </>
    );
  }

  const notices = (
    <>
      <WindowNotice
        pointName={selectedPoint.name}
        loaded={series.samples.length}
        limit={telemetry.requestedLimit}
        full={telemetry.windowIsFull}
      />
      {window.unreadableCount > 0 ? (
        <Note tone="warning" testId="history-unreadable">
          {window.unreadableCount} entr{window.unreadableCount === 1 ? "y" : "ies"} in the response
          did not match the published sample schema and{" "}
          {window.unreadableCount === 1 ? "was" : "were"} left out.
        </Note>
      ) : null}
    </>
  );

  const table = (
    <SampleTable
      pointName={selectedPoint.name}
      samples={series.samples}
      sharedUnit={series.unit}
      showUnitColumn={series.mixedUnits}
    />
  );

  // A boolean or textual point has a real history and no numeric axis. Drawing
  // one would mean inventing a number for every reading.
  if (!selectedPoint.isNumeric) {
    return (
      <>
        {header}
        {notices}
        <StatePanel
          title="This measurement cannot be charted"
          headingLevel={4}
          testId="history-not-numeric"
        >
          <p>
            The cloud API publishes {selectedPoint.name} as a{" "}
            {formatContractValue(selectedPoint.dataType).toLowerCase()} point. A chart needs a
            numeric axis, so its history is shown as samples instead.
          </p>
        </StatePanel>
        {table}
      </>
    );
  }

  // Units that disagree cannot share one continuous line, and converting between
  // them would be the portal inventing a reading.
  if (series.mixedUnits) {
    return (
      <>
        {header}
        {notices}
        <StatePanel
          title="This window mixes units"
          tone="warning"
          headingLevel={4}
          testId="history-mixed-units"
        >
          <p>
            The samples carry more than one unit (
            {series.units.map((unit) => unit ?? "no unit").join(", ")}). Drawing them as one line
            would imply a single scale the cloud API did not publish, and the portal does not
            convert between units, so the samples are shown as a table instead.
          </p>
        </StatePanel>
        {table}
      </>
    );
  }

  return (
    <>
      {header}
      {notices}
      {series.unplottableCount > 0 ? (
        <Note tone="warning" testId="history-unplottable">
          {series.unplottableCount} of the loaded sample{series.unplottableCount === 1 ? "" : "s"}{" "}
          could not be plotted, because the value is not a number or the observation time cannot be
          read. {series.unplottableCount === 1 ? "It is" : "They are"} left out of the line — never
          drawn as zero — and can be read in the table below.
        </Note>
      ) : null}
      <HistoryChart pointName={selectedPoint.name} unit={series.unit} samples={series.samples} />
      {table}
    </>
  );
}
