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
import { Note } from "../../components/StatePanel";
import { formatContractUnknown, formatContractValue, formatIsoInstant } from "../../shared/format";
import { MetaList } from "../topology/MetaList";

interface ReportedStateProps {
  feedback: ActuatorFeedback | undefined;
  /** Test hook, so the same block can be found in a card and in a dialog. */
  testId?: string;
}

/**
 * "No reported state yet" is a state, not a reading: it is set apart by weight,
 * size and words, never by colour alone.
 */
function Absent({ testId }: { testId: string }) {
  return (
    <p className="fs-5 fst-italic text-body-secondary" data-testid={testId}>
      No reported state yet
    </p>
  );
}

export function ReportedState({ feedback, testId = "reported-state" }: ReportedStateProps) {
  const state = feedback?.state;

  if (feedback === undefined || state === undefined) {
    return <Absent testId={testId} />;
  }

  if (!feedback.hasReading) {
    return (
      <>
        <Absent testId={testId} />
        <Note>
          {feedback.point === undefined
            ? "The cloud API describes no state for the point that reports this one back."
            : `${feedback.point.name} has not reported a state to the cloud API.`}
        </Note>
      </>
    );
  }

  return (
    <>
      <p className="fs-3 fw-semibold lh-sm text-break" data-testid={testId}>
        {formatContractUnknown(state.value)}
      </p>
      <MetaList
        items={[
          {
            label: "Reported by",
            value: feedback.point?.name ?? "A point this configuration does not describe",
          },
          { label: "Quality", value: formatContractValue(state.quality) },
          {
            label: "Observed at",
            value:
              state.observed_at === null ? (
                "Not observed yet"
              ) : (
                <time dateTime={state.observed_at}>{formatIsoInstant(state.observed_at)}</time>
              ),
          },
        ]}
      />
    </>
  );
}
