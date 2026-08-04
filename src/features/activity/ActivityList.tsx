/**
 * One control zone's commands, newest first.
 *
 * There is one DOM for every viewport, not a table for desktop and a second
 * markup for phones. Each command is a list item containing a button, and each
 * field inside it carries its own visible label; the stylesheet lays those
 * fields into aligned columns on a wide screen and stacks them on a narrow one.
 * That is what makes "the mobile layout shows the same information" a property
 * of the markup rather than a promise two code paths have to keep, and it keeps
 * the rows operable by keyboard at every width because they were never a table
 * with a click handler.
 *
 * Each row answers four separate questions and never lets one answer another:
 *
 * - **what was asked for** — `desired_value`, labelled as a request;
 * - **who asked** — `source`, in the customer's words with the raw enum beside
 *   it;
 * - **how far it got** — `state`, plus receipt as a fact of its own, because
 *   acknowledgement is not a fourth state;
 * - **when** — `created_at`, as the API published it.
 *
 * A row never shows a reported reading. A current reading beside a command from
 * last week would read as that command's outcome, which is precisely the
 * conflation the contract warns against. Reported state belongs to the details
 * of one opened command, next to the moment it was read.
 */

import type { ReactNode } from "react";
import type { CommandRead } from "../../api/contract";
import { APPLIED_COMMAND_STATE } from "../../api/contract";
import { commandStateLabel, desiredValueLabel } from "../control/commandLabels";
import type { ActivityCommand, PointLabel } from "./activityCommands";
import { receiptLabel, sourceLabel, wasReceivedByGreenhouse } from "./activityLabels";
import { formatIsoInstant } from "../../shared/format";

interface ActivityListProps {
  rows: readonly ActivityCommand[];
  /** The command whose details are open, so its row can say so. */
  selectedCommandId: string | undefined;
  onOpen: (commandId: string) => void;
  /** The zone the window belongs to, named in the list's accessible caption. */
  zoneName: string;
}

/** A point's name, or the identifier the API published when there is none. */
export function PointIdentity({ label }: { label: PointLabel }) {
  if (!label.isResolved) {
    return (
      <>
        <code className="activity-row__identifier">{label.pointId}</code>
        <span className="activity-row__hint">Name unavailable</span>
      </>
    );
  }
  return (
    <>
      <span className="activity-row__name">{label.name}</span>
      {label.code === undefined ? null : (
        <code className="activity-row__identifier">{label.code}</code>
      )}
    </>
  );
}

/** One labelled field of a row. The label is in the DOM at every width. */
function Field({
  label,
  children,
  className = "",
  testId,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <span
      className={`activity-row__field ${className}`.trim()}
      {...(testId ? { "data-testid": testId } : {})}
    >
      <span className="activity-row__label">{label}</span>
      <span className="activity-row__value">{children}</span>
    </span>
  );
}

/**
 * The lifecycle of one command, said in full.
 *
 * The state's own label, the raw enum value beside it for operational clarity,
 * and receipt as a separate fact. `pending` is never dressed up as a failure and
 * receipt is never dressed up as success.
 */
function Lifecycle({ command }: { command: CommandRead }) {
  return (
    <>
      <span className="activity-row__state" data-testid="activity-row-state">
        {commandStateLabel(command.state)}
      </span>{" "}
      <code className="activity-row__identifier">{command.state}</code>
      <span
        className={
          wasReceivedByGreenhouse(command)
            ? "activity-row__receipt activity-row__receipt--received"
            : "activity-row__receipt"
        }
        data-testid="activity-row-receipt"
      >
        {receiptLabel(command)}
      </span>
    </>
  );
}

export function ActivityList({ rows, selectedCommandId, onOpen, zoneName }: ActivityListProps) {
  return (
    <ul
      className="activity-list"
      data-testid="activity-list"
      aria-label={`Commands for ${zoneName}`}
    >
      {rows.map(({ command, target }) => {
        const isSelected =
          selectedCommandId !== undefined &&
          selectedCommandId.toLowerCase() === command.id.toLowerCase();
        return (
          <li key={command.id} className="activity-list__item">
            <button
              type="button"
              className={isSelected ? "activity-row activity-row--selected" : "activity-row"}
              aria-haspopup="dialog"
              data-testid={`activity-row-${command.id}`}
              data-command-id={command.id}
              onClick={() => {
                onOpen(command.id);
              }}
            >
              <Field label="Control point" className="activity-row__field--target">
                <PointIdentity label={target} />
              </Field>

              <Field label="Requested" testId="activity-row-desired">
                <strong>{desiredValueLabel(command.desired_value)}</strong>
              </Field>

              <Field label="Source" testId="activity-row-source">
                {sourceLabel(command.source)}{" "}
                <code className="activity-row__identifier">{command.source}</code>
              </Field>

              <Field label="Command" className="activity-row__field--lifecycle">
                <Lifecycle command={command} />
              </Field>

              <Field label="Created">
                <time dateTime={command.created_at}>{formatIsoInstant(command.created_at)}</time>
              </Field>

              {command.rejection_reason === null ? null : (
                <Field
                  label="Rejected because"
                  className="activity-row__field--rejection"
                  testId="activity-row-rejection"
                >
                  {command.rejection_reason.message}{" "}
                  <code className="activity-row__identifier">{command.rejection_reason.code}</code>
                </Field>
              )}

              {command.state === APPLIED_COMMAND_STATE && command.executed_at !== null ? (
                <Field label="Completed" testId="activity-row-executed">
                  <time dateTime={command.executed_at}>
                    {formatIsoInstant(command.executed_at)}
                  </time>
                </Field>
              ) : null}

              <span className="activity-row__open">View details</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
