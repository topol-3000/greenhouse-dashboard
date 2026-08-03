/**
 * One cell of the history grid: a numeric point and the state of its history.
 *
 * Each point polls its own history, so each card owns its own loading, error
 * and partial-data states. That is the point of the split — one metric whose
 * history endpoint fails shows an error in its own cell while every other chart
 * keeps drawing, instead of blanking the whole section.
 */

import type { UseQueryResult } from "@tanstack/react-query";
import type { ConfigurationPointDto, TelemetryHistoryDto } from "../api/types";
import { describeError } from "../api/errors";
import { toChartSamples } from "../domain/points";
import { HistoryChart } from "./HistoryChart";
import { LoadingPanel, MessagePanel } from "./Message";

interface HistoryChartCardProps {
  point: ConfigurationPointDto;
  query: UseQueryResult<TelemetryHistoryDto, Error>;
  onRetry: () => void;
  retrying: boolean;
}

export function HistoryChartCard({ point, query, onRetry, retrying }: HistoryChartCardProps) {
  if (query.isPending) {
    return <LoadingPanel label={`Loading ${point.name} samples…`} />;
  }

  // Only a *first* load failure has nothing to show. A refresh that fails still
  // has the previous snapshot, and the header banner is what marks it stale.
  if (query.isError && query.data === undefined) {
    return (
      <MessagePanel
        title={`Cannot load ${point.name} history`}
        tone="error"
        onRetry={onRetry}
        retryLabel="Retry loading history"
        retrying={retrying}
      >
        {describeError(query.error)}
      </MessagePanel>
    );
  }

  const samples = toChartSamples(query.data?.items ?? []);
  const malformed = query.data?.malformed_sample_count ?? 0;

  return (
    <>
      {malformed > 0 ? (
        <p className="notice" data-testid="partial-samples-notice">
          {malformed} {point.name} sample{malformed === 1 ? "" : "s"} could not be read and{" "}
          {malformed === 1 ? "was" : "were"} left out of the chart.
        </p>
      ) : null}
      <HistoryChart point={point} samples={samples} />
    </>
  );
}
