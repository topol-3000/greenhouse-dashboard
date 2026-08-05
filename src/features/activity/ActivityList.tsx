/**
 * One control zone's commands, newest first.
 *
 * There is one DOM for every viewport, not a table for desktop and a second
 * markup for phones. Each command is a list item containing a CoreUI list-group
 * action button, and each field inside it carries its own visible label; CoreUI's
 * own grid lays those fields into aligned columns on a wide screen and stacks
 * them on a narrow one. That is what makes "the mobile layout shows the same
 * information" a property of the markup rather than a promise two code paths
 * have to keep, and it keeps the rows operable by keyboard at every width
 * because they were never a table with a click handler.
 *
 * The list stays a `<ul>` of `<li>`s. CoreUI's actionable list group puts the
 * buttons directly in the list, which costs the list its `listitem` semantics;
 * the button lives inside the item here instead, so a screen reader still hears
 * "list, N items".
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
 *
 * The open row is marked by `aria-current` and by its own words — "Details
 * open" rather than "View details" — as well as by the highlight, so the
 * selection is never carried by colour alone.
 */

import { CBadge, CCol, CListGroup, CListGroupItem, CRow } from "@coreui/react";
import type { ReactNode } from "react";
import type { CommandRead, CommandState } from "../../api/contract";
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

const STATE_COLOUR: Record<CommandState, "info" | "success" | "danger"> = {
  pending: "info",
  applied: "success",
  rejected: "danger",
};

/** A point's name, or the identifier the API published when there is none. */
export function PointIdentity({ label }: { label: PointLabel }) {
  if (!label.isResolved) {
    return (
      <>
        <code className="small">{label.pointId}</code>
        <span className="d-block small text-body-secondary">Name unavailable</span>
      </>
    );
  }
  return (
    <>
      <span className="fw-semibold">{label.name}</span>
      {label.code === undefined ? null : <code className="small ms-1">{label.code}</code>}
    </>
  );
}

/** One labelled field of a row. The label is in the DOM at every width. */
function Field({
  label,
  children,
  span,
  testId,
}: {
  label: string;
  children: ReactNode;
  /** Columns this field takes on a wide screen. Full width on a narrow one. */
  span?: { lg?: number; xl?: number };
  testId?: string;
}) {
  return (
    <CCol
      xs={12}
      lg={span?.lg ?? 4}
      xl={span?.xl ?? span?.lg ?? 4}
      className="d-flex flex-column gap-1"
      {...(testId ? { "data-testid": testId } : {})}
    >
      <span className="text-uppercase small text-body-secondary">{label}</span>
      <span className="text-break">{children}</span>
    </CCol>
  );
}

/**
 * The lifecycle of one command, said in full.
 *
 * The state's own label with a badge repeating it, the raw enum value beside it
 * for operational clarity, and receipt as a separate fact. `pending` is never
 * dressed up as a failure and receipt is never dressed up as success.
 */
function Lifecycle({ command }: { command: CommandRead }) {
  return (
    <>
      <CBadge color={STATE_COLOUR[command.state]} data-testid="activity-row-state">
        {commandStateLabel(command.state)}
      </CBadge>{" "}
      <code className="small">{command.state}</code>
      <span
        className={
          wasReceivedByGreenhouse(command) ? "d-block small" : "d-block small text-body-secondary"
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
    <CListGroup
      as="ul"
      className="gap-2"
      data-testid="activity-list"
      aria-label={`Commands for ${zoneName}`}
    >
      {rows.map(({ command, target }) => {
        const isSelected =
          selectedCommandId !== undefined &&
          selectedCommandId.toLowerCase() === command.id.toLowerCase();
        return (
          <li key={command.id} className="d-flex">
            <CListGroupItem
              as="button"
              type="button"
              active={isSelected}
              className="w-100 text-start rounded py-3"
              aria-haspopup="dialog"
              data-testid={`activity-row-${command.id}`}
              data-command-id={command.id}
              onClick={() => {
                onOpen(command.id);
              }}
            >
              <CRow className="g-3 align-items-start">
                <Field label="Control point" span={{ lg: 6, xl: 3 }}>
                  <PointIdentity label={target} />
                </Field>

                <Field label="Requested" span={{ lg: 3, xl: 2 }} testId="activity-row-desired">
                  <strong>{desiredValueLabel(command.desired_value)}</strong>
                </Field>

                <Field label="Source" span={{ lg: 3, xl: 2 }} testId="activity-row-source">
                  {sourceLabel(command.source)} <code className="small">{command.source}</code>
                </Field>

                <Field label="Command" span={{ lg: 6, xl: 2 }}>
                  <Lifecycle command={command} />
                </Field>

                <Field label="Created" span={{ lg: 4, xl: 2 }}>
                  <time dateTime={command.created_at}>{formatIsoInstant(command.created_at)}</time>
                </Field>

                {/*
                  The two fields a command does not always have come after the
                  ones it always has, each on a line of its own, so a rejection
                  or a completion time never shifts the columns beside it
                  between one row and the next.
                */}
                {command.state === APPLIED_COMMAND_STATE && command.executed_at !== null ? (
                  <Field label="Completed" span={{ lg: 12, xl: 12 }} testId="activity-row-executed">
                    <time dateTime={command.executed_at}>
                      {formatIsoInstant(command.executed_at)}
                    </time>
                  </Field>
                ) : null}

                {command.rejection_reason === null ? null : (
                  <Field
                    label="Rejected because"
                    span={{ lg: 12, xl: 12 }}
                    testId="activity-row-rejection"
                  >
                    {command.rejection_reason.message}{" "}
                    <code className="small">{command.rejection_reason.code}</code>
                  </Field>
                )}

                {/*
                  Always the last thing in the row, at the end of its own line,
                  so it sits in the same place whatever fields the command
                  above it happened to have.
                */}
                <CCol xs={12} className="d-flex justify-content-lg-end">
                  <span className="fw-semibold small">
                    {isSelected ? "Details open" : "View details"}
                  </span>
                </CCol>
              </CRow>
            </CListGroupItem>
          </li>
        );
      })}
    </CListGroup>
  );
}
