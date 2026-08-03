/**
 * What an actuator is reported to be doing, as the contract publishes it.
 *
 * The value comes from the point `reported_point_id` names, and from nowhere
 * else. It is not the value that was asked for, it is not derived from a command
 * having succeeded, and it is not invented when it is missing.
 *
 * `false` and `0` are readings the greenhouse published and render as such. Only
 * `null` — the empty projection a point carries until telemetry writes to it —
 * renders as "No reported state yet".
 */

import type { ActuatorFeedback } from "./actuators";
import { formatContractUnknown, formatContractValue, formatIsoInstant } from "../../shared/format";

interface ReportedStateProps {
  feedback: ActuatorFeedback | undefined;
  /** Test hook, so the same block can be found in a card and in a dialog. */
  testId?: string;
}

export function ReportedState({ feedback, testId = "reported-state" }: ReportedStateProps) {
  const state = feedback?.state;

  if (feedback === undefined || state === undefined) {
    return (
      <p className="control__reported control__reported--absent" data-testid={testId}>
        No reported state yet
      </p>
    );
  }

  if (!feedback.hasReading) {
    return (
      <>
        <p className="control__reported control__reported--absent" data-testid={testId}>
          No reported state yet
        </p>
        <p className="inline-note">
          {feedback.point === undefined
            ? "The cloud API describes no state for the point that reports this one back."
            : `${feedback.point.name} has not reported a state to the cloud API.`}
        </p>
      </>
    );
  }

  return (
    <>
      <p className="control__reported" data-testid={testId}>
        {formatContractUnknown(state.value)}
      </p>
      <dl className="meta">
        <div className="meta__row">
          <dt className="meta__label">Reported by</dt>
          <dd className="meta__value">
            {feedback.point?.name ?? "A point this configuration does not describe"}
          </dd>
        </div>
        <div className="meta__row">
          <dt className="meta__label">Quality</dt>
          <dd className="meta__value">{formatContractValue(state.quality)}</dd>
        </div>
        <div className="meta__row">
          <dt className="meta__label">Observed at</dt>
          <dd className="meta__value">
            {state.observed_at === null ? (
              "Not observed yet"
            ) : (
              <time dateTime={state.observed_at}>{formatIsoInstant(state.observed_at)}</time>
            )}
          </dd>
        </div>
      </dl>
    </>
  );
}
