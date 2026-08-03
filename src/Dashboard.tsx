/**
 * The owner monitoring screen.
 *
 * One screen, read-only. It selects a facility, shows every active measurement
 * point with its current reading, and charts the last 100 samples of one
 * numeric point. It offers no create, edit, archive, command or simulation
 * control, because the backend contract it speaks is a read contract.
 *
 * The failure rule that shapes the whole component: a *refresh* failure keeps
 * the last successful snapshot on screen and marks it stale, while a *first
 * load* failure — where there is nothing to keep — becomes a full error state.
 * TanStack Query expresses the difference as "is there data alongside this
 * error", and that is what every branch below tests.
 */

import { useCallback, useMemo, useState } from "react";
import {
  useFacilitiesQuery,
  useFacilityConfigurationQuery,
  usePointTelemetryQuery,
} from "./api/queries";
import { describeError } from "./api/errors";
import { LoadingPanel, MessagePanel } from "./components/Message";
import { FacilitySelector } from "./components/FacilitySelector";
import { HistoryChart } from "./components/HistoryChart";
import { MeasurementCards } from "./components/MeasurementCards";
import { PointSelector } from "./components/PointSelector";
import type { ConnectionTone } from "./components/StatusBanner";
import { StatusBanner } from "./components/StatusBanner";
import { formatInstant, humaniseToken } from "./domain/format";
import { activeMeasurementPoints, numericMeasurementPoints, toChartSamples } from "./domain/points";

export function Dashboard() {
  const [chosenFacilityId, setChosenFacilityId] = useState<string | null>(null);
  const [chosenPointId, setChosenPointId] = useState<string | null>(null);

  const facilities = useFacilitiesQuery();
  const facilityItems = useMemo(() => facilities.data?.items ?? [], [facilities.data]);

  // The selection is local UI state, but it must still be valid: until the
  // owner picks one, the first facility the API returned is shown, and a stored
  // choice that disappeared from the list falls back the same way.
  const selectedFacilityId = useMemo(() => {
    if (chosenFacilityId !== null && facilityItems.some((item) => item.id === chosenFacilityId)) {
      return chosenFacilityId;
    }
    return facilityItems[0]?.id ?? null;
  }, [chosenFacilityId, facilityItems]);

  const configuration = useFacilityConfigurationQuery(selectedFacilityId);
  const document_ = configuration.data;

  const measurementPoints = useMemo(
    () => (document_ ? activeMeasurementPoints(document_.points) : []),
    [document_],
  );
  const numericPoints = useMemo(
    () => (document_ ? numericMeasurementPoints(document_.points) : []),
    [document_],
  );

  const selectedPointId = useMemo(() => {
    if (chosenPointId !== null && numericPoints.some((point) => point.id === chosenPointId)) {
      return chosenPointId;
    }
    return numericPoints[0]?.id ?? null;
  }, [chosenPointId, numericPoints]);

  const selectedPoint = numericPoints.find((point) => point.id === selectedPointId) ?? null;

  const telemetry = usePointTelemetryQuery(selectedPointId);
  const chartSamples = useMemo(() => toChartSamples(telemetry.data?.items ?? []), [telemetry.data]);

  const handleSelectFacility = useCallback((facilityId: string) => {
    setChosenFacilityId(facilityId);
    // The previous point belonged to the previous facility; clearing it lets
    // the new facility's first numeric point take over.
    setChosenPointId(null);
  }, []);

  const handleRetry = useCallback(() => {
    void facilities.refetch();
    void configuration.refetch();
    void telemetry.refetch();
  }, [facilities, configuration, telemetry]);

  const retrying = facilities.isFetching || configuration.isFetching || telemetry.isFetching;

  // Connectivity is derived from the queries themselves; there is no separate
  // health probe, because /health is not part of the proxied /api/v1 surface.
  const anyError = facilities.isError || configuration.isError || telemetry.isError;
  const haveSnapshot = facilities.data !== undefined || configuration.data !== undefined;
  const firstError = facilities.error ?? configuration.error ?? telemetry.error;

  let tone: ConnectionTone;
  let bannerMessage: string;
  if (anyError && haveSnapshot) {
    tone = "stale";
    bannerMessage = `Showing the last successful snapshot. ${describeError(firstError)}`;
  } else if (anyError) {
    tone = "error";
    bannerMessage = describeError(firstError);
  } else if (facilities.isPending || configuration.isPending) {
    tone = "loading";
    bannerMessage = "Loading data from the greenhouse API.";
  } else {
    tone = "live";
    bannerMessage =
      configuration.dataUpdatedAt > 0
        ? `Updated ${formatInstant(new Date(configuration.dataUpdatedAt).toISOString())}.`
        : "Connected to the greenhouse API.";
  }

  const partialPoints = document_?.malformed_point_count ?? 0;
  const partialSamples = telemetry.data?.malformed_sample_count ?? 0;

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Greenhouse Monitor</h1>
        <StatusBanner
          tone={tone}
          message={bannerMessage}
          onRetry={anyError ? handleRetry : undefined}
          retrying={retrying}
        />
      </header>

      <main className="app__main">
        <section className="section" aria-labelledby="facility-heading">
          <h2 id="facility-heading" className="section__heading">
            Facility
          </h2>

          {facilities.isPending ? (
            <LoadingPanel label="Loading facilities…" />
          ) : facilities.isError && facilities.data === undefined ? (
            <MessagePanel
              title="Cannot load facilities"
              tone="error"
              onRetry={handleRetry}
              retryLabel="Retry loading facilities"
              retrying={retrying}
            >
              {describeError(facilities.error)}
            </MessagePanel>
          ) : facilityItems.length === 0 ? (
            <MessagePanel title="No facilities yet">
              The greenhouse backend has no active facilities. A producer such as the Simulation Lab
              creates them through the public management API; this dashboard only reads them.
            </MessagePanel>
          ) : (
            <div className="controls">
              <FacilitySelector
                facilities={facilityItems}
                selectedId={selectedFacilityId}
                onSelect={handleSelectFacility}
              />
              {document_ ? (
                <p className="context" data-testid="facility-context">
                  <span className="context__primary">{document_.facility.name}</span>
                  <span className="context__secondary">
                    {document_.facility.facility_type
                      ? humaniseToken(document_.facility.facility_type)
                      : "Facility"}{" "}
                    at {document_.site.name || "an unnamed site"}
                    {document_.site.timezone ? ` · ${document_.site.timezone}` : ""}
                  </span>
                </p>
              ) : null}
            </div>
          )}
        </section>

        {selectedFacilityId !== null ? (
          <>
            <section className="section" aria-labelledby="measurements-heading">
              <h2 id="measurements-heading" className="section__heading">
                Measurement points
              </h2>

              {configuration.isPending ? (
                <LoadingPanel label="Loading measurement points…" />
              ) : configuration.isError && document_ === undefined ? (
                <MessagePanel
                  title="Cannot load this facility"
                  tone="error"
                  onRetry={handleRetry}
                  retryLabel="Retry loading this facility"
                  retrying={retrying}
                >
                  {describeError(configuration.error)}
                </MessagePanel>
              ) : measurementPoints.length === 0 ? (
                <MessagePanel title="No measurement points">
                  This facility has no active measurement points yet. Points appear here once a
                  producer configures them through the public API.
                </MessagePanel>
              ) : (
                <>
                  {partialPoints > 0 ? (
                    <p className="notice" data-testid="partial-points-notice">
                      {partialPoints} point{partialPoints === 1 ? "" : "s"} could not be read from
                      the API response and {partialPoints === 1 ? "is" : "are"} not shown.
                    </p>
                  ) : null}
                  <MeasurementCards points={measurementPoints} />
                </>
              )}
            </section>

            <section className="section" aria-labelledby="history-heading">
              <h2 id="history-heading" className="section__heading">
                Recent history
              </h2>

              {configuration.isPending ? (
                <LoadingPanel label="Loading history…" />
              ) : numericPoints.length === 0 ? (
                <MessagePanel title="No numeric measurements">
                  None of this facility&rsquo;s active measurement points report numeric values, so
                  there is nothing to chart.
                </MessagePanel>
              ) : (
                <>
                  <div className="controls">
                    <PointSelector
                      points={numericPoints}
                      selectedId={selectedPointId}
                      onSelect={setChosenPointId}
                    />
                  </div>

                  {telemetry.isPending ? (
                    <LoadingPanel label="Loading samples…" />
                  ) : telemetry.isError && telemetry.data === undefined ? (
                    <MessagePanel
                      title="Cannot load history"
                      tone="error"
                      onRetry={handleRetry}
                      retryLabel="Retry loading history"
                      retrying={retrying}
                    >
                      {describeError(telemetry.error)}
                    </MessagePanel>
                  ) : selectedPoint ? (
                    <>
                      {partialSamples > 0 ? (
                        <p className="notice" data-testid="partial-samples-notice">
                          {partialSamples} sample{partialSamples === 1 ? "" : "s"} could not be read
                          and {partialSamples === 1 ? "was" : "were"} left out of the chart.
                        </p>
                      ) : null}
                      <HistoryChart point={selectedPoint} samples={chartSamples} />
                    </>
                  ) : null}
                </>
              )}
            </section>
          </>
        ) : null}
      </main>

      <footer className="app__footer">
        <p>
          Read-only view of the greenhouse public API. Facilities refresh every 30s, current state
          every 5s, history every 10s.
        </p>
      </footer>
    </div>
  );
}
