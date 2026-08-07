/**
 * One command, in full, as a modal dialog.
 *
 * It is CoreUI's `CModal`, exactly as the manual-control confirmation is: focus
 * starts on the dialog itself, Tab stays inside it, Escape and Close close it,
 * and closing returns focus to the row that opened it. Closing removes the
 * `command` parameter and nothing else, so the filters behind it survive.
 *
 * The dialog keeps three facts apart and never reconciles them:
 *
 * - **Requested** — the command's `desired_value`. A request, never a reading;
 * - **Reported** — the `reported_point_id` point's own current state, read from
 *   the facility configuration. It may disagree with the request "for as long as
 *   the physical change takes, or forever if it never happens", and when it does
 *   both are shown as they are;
 * - **Command** — the lifecycle, plus receipt as a fact of its own.
 *
 * An applied command beside an unchanged reading shows both. A rejected command
 * beside a reading that happens to match the request is still rejected. Nothing
 * here treats a reading as evidence about a command, or a command as evidence
 * about equipment.
 *
 * For a manual command it invents no control loop and no trigger sample: the
 * contract publishes both as nullable, and `null` is rendered as the absence it
 * is. For an automatic command it explains the source and offers no way to
 * configure, create or edit the control system that produced it.
 */

import {
  CBadge,
  CButton,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
} from "@coreui/react";
import type { ReactNode } from "react";
import type { CommandState } from "../../api/contract";
import { MANUAL_COMMAND_SOURCE } from "../../api/contract";
import { COMMAND_OBSERVATION_WINDOW_MS } from "../../api/queries";
import { LoadingState, Note, StatePanel } from "../../components/StatePanel";
import { RetryButton } from "../../components/TopologyStates";
import { ReportedState } from "../control/ReportedState";
import {
  commandStateLabel,
  commandStateMeaning,
  describeCommandFailure,
  desiredValueLabel,
} from "../control/commandLabels";
import { formatIsoInstant } from "../../shared/format";
import { describeControlLoop } from "../control/controlLoops";
import { MetaList } from "../topology/MetaList";
import { PointIdentity } from "./ActivityList";
import { receiptLabel, sourceLabel, sourceMeaning } from "./activityLabels";
import type { ActivityDetails } from "./useActivity";

interface CommandDetailsDialogProps {
  details: ActivityDetails;
  /** The names the current selection resolves to, for the whole target. */
  siteName: string | undefined;
  facilityName: string | undefined;
  zoneName: string;
  onClose: () => void;
}

/** The observation window in whole minutes, for the sentence that reports it. */
const WINDOW_MINUTES = Math.round(COMMAND_OBSERVATION_WINDOW_MS / 60_000);

const STATE_COLOUR: Record<CommandState, "info" | "success" | "danger"> = {
  pending: "info",
  applied: "success",
  rejected: "danger",
};

/** An instant, or the words for not having one. */
function Instant({ iso, absent }: { iso: string | null; absent: string }) {
  if (iso === null) {
    return <>{absent}</>;
  }
  return <time dateTime={iso}>{formatIsoInstant(iso)}</time>;
}

/** One of the dialog's three blocks: a small heading over a stated fact. */
function Block({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="d-flex flex-column align-items-start gap-1">
      <h4 className="text-uppercase small text-body-secondary mb-0">{heading}</h4>
      {children}
    </div>
  );
}

export function CommandDetailsDialog({
  details,
  siteName,
  facilityName,
  zoneName,
  onClose,
}: CommandDetailsDialogProps) {
  const { observation, labels } = details;
  const command = labels?.command;

  return (
    <CModal
      visible
      transition={false}
      alignment="center"
      size="lg"
      scrollable
      onClose={onClose}
      aria-labelledby="command-details-heading"
      data-testid="command-details"
    >
      <CModalHeader closeButton={false}>
        <CModalTitle as="h3" id="command-details-heading">
          Command details
        </CModalTitle>
      </CModalHeader>

      <CModalBody className="d-flex flex-column gap-3">
        {details.isOutsideContext ? (
          <StatePanel
            title="This command is not one of the selected control zone’s"
            tone="warning"
            role="alert"
            headingLevel={4}
            testId="command-outside-context"
          >
            <p>
              The cloud API places the command in this address in a different control zone, so the
              portal will not show it here. Nothing about the commands listed behind this dialog has
              changed.
            </p>
          </StatePanel>
        ) : observation.isMissing ? (
          <StatePanel
            title="The cloud API has no such command"
            tone="warning"
            role="alert"
            headingLevel={4}
            testId="command-details-missing"
          >
            <p>
              The portal asked for the command <code>{details.commandId}</code> and the cloud API
              has no such record. It has stopped asking.
            </p>
          </StatePanel>
        ) : observation.isLoading ? (
          <LoadingState label="Loading this command…" />
        ) : observation.error !== null && observation.error !== undefined ? (
          <StatePanel
            title="This command could not be loaded"
            tone="error"
            role="alert"
            headingLevel={4}
            testId="command-details-error"
            action={<RetryButton onClick={observation.recheck} testId="command-details-retry" />}
          >
            <p>{describeCommandFailure(observation.error)}</p>
          </StatePanel>
        ) : command === undefined || labels === undefined ? (
          <StatePanel
            title="This command is not available"
            headingLevel={4}
            testId="command-details-unavailable"
          >
            <p>The cloud API has not returned this command.</p>
          </StatePanel>
        ) : (
          <>
            {/*
              One live region for the lifecycle, so a transition is announced
              once. The text changes only when the state or its meaning changes,
              which is why a poll returning the same answer announces nothing.
            */}
            <p className="text-break" role="status" data-testid="command-details-state">
              <CBadge color={STATE_COLOUR[command.state]} className="me-2">
                {commandStateLabel(command.state)}
              </CBadge>
              {commandStateMeaning(command)}
            </p>

            <Block heading="Requested">
              <p className="fs-3 fw-semibold lh-sm" data-testid="command-details-desired">
                {desiredValueLabel(command.desired_value)}
              </p>
              <Note>
                What this command asked the greenhouse for. It is a request, not a reading.
              </Note>
            </Block>

            <Block heading="Reported by the greenhouse now">
              {details.labelsUnavailable ? (
                <Note tone="warning" testId="command-reported-unavailable">
                  The cloud API has not returned this facility’s configuration, so the reported
                  state of {labels.reported.pointId} cannot be shown. Everything the cloud API
                  published about the command itself is below.
                </Note>
              ) : (
                <>
                  <ReportedState feedback={details.reported} testId="command-reported-state" />
                  <Note>
                    The current state of the point that reports this control point back, read now.
                    It is not this command&rsquo;s result: a reading can match a rejected request
                    and can lag an applied one.
                  </Note>
                </>
              )}
            </Block>

            <MetaList
              testId="command-details-meta"
              items={[
                { label: "Command ID", value: <code>{command.id}</code> },
                {
                  label: "Source",
                  value: (
                    <>
                      {sourceLabel(command.source)} <code>{command.source}</code>
                    </>
                  ),
                },
                { label: "Site", value: siteName ?? "Not available" },
                { label: "Facility", value: facilityName ?? "Not available" },
                { label: "Control zone", value: zoneName },
                { label: "Control point", value: <PointIdentity label={labels.target} /> },
                { label: "Reporting point", value: <PointIdentity label={labels.reported} /> },
                { label: "Requested state", value: desiredValueLabel(command.desired_value) },
                { label: "Command state", value: <code>{command.state}</code> },
                {
                  label: "Created",
                  value: <Instant iso={command.created_at} absent="Not available" />,
                },
                {
                  label: "Issued",
                  value: <Instant iso={command.issued_at} absent="Not available" />,
                },
                {
                  label: "Received by the greenhouse",
                  value: <Instant iso={command.acknowledged_at} absent="Not yet" />,
                },
                {
                  label: "Completed",
                  value: <Instant iso={command.executed_at} absent="Not yet" />,
                },
                {
                  label: "Control loop",
                  value:
                    command.control_loop_id === null ? (
                      <span data-testid="command-details-loop-absent">
                        {command.source === MANUAL_COMMAND_SOURCE
                          ? "None — a person asked for this command"
                          : "The cloud API names none"}
                      </span>
                    ) : (
                      // Described by the points it connects, never titled: the
                      // contract publishes no name for a control loop, and the
                      // identifier stays on screen so nothing here reads as a
                      // label the backend supplied.
                      <span data-testid="command-details-loop">
                        {details.loop === undefined ? null : (
                          <span className="d-block">{describeControlLoop(details.loop)}</span>
                        )}
                        <code>{command.control_loop_id}</code>
                        {details.loop === undefined ? (
                          <span className="d-block small text-body-secondary">
                            This zone&rsquo;s control loops do not include it.
                          </span>
                        ) : null}
                      </span>
                    ),
                },
                {
                  label: "Triggering measurement",
                  value:
                    command.trigger_sample_id === null ? (
                      <span data-testid="command-details-trigger-absent">
                        {command.source === MANUAL_COMMAND_SOURCE
                          ? "None — a person asked for this command"
                          : "The cloud API names none"}
                      </span>
                    ) : (
                      <code>{command.trigger_sample_id}</code>
                    ),
                },
              ]}
            />

            <Note testId="command-details-source-meaning">{sourceMeaning(command.source)}</Note>

            <Note testId="command-details-receipt">
              {receiptLabel(command)}. Receipt means the greenhouse received the command. It is not
              a command state, and it does not say anything moved.
            </Note>

            {command.rejection_reason === null ? null : (
              <StatePanel
                title="Why the greenhouse rejected it"
                tone="error"
                headingLevel={4}
                testId="command-details-rejection"
              >
                <p>{command.rejection_reason.message}</p>
                <p className="small mb-0">
                  Reason code: <code>{command.rejection_reason.code}</code>
                </p>
              </StatePanel>
            )}

            {observation.isTerminal ? (
              <Note testId="command-details-terminal">
                This is the command&rsquo;s final state, and the portal has stopped checking it.
              </Note>
            ) : null}

            {observation.isObserving ? (
              <Note testId="command-details-observing">
                Checking the cloud API for this command&rsquo;s state.
              </Note>
            ) : null}

            {observation.stoppedUnconfirmed ? (
              <StatePanel
                title="Status is still unconfirmed"
                tone="warning"
                role="status"
                headingLevel={4}
                testId="command-details-unconfirmed"
                action={
                  <RetryButton
                    onClick={observation.recheck}
                    label="Check again"
                    testId="command-details-recheck"
                  />
                }
              >
                <p>
                  The portal stopped checking automatically after {WINDOW_MINUTES} minutes. This is
                  not a failure: the command is still <code>{command.state}</code> as far as the
                  cloud API has said, and it may still be delivered.
                </p>
              </StatePanel>
            ) : null}

            {observation.refreshError === null || observation.refreshError === undefined ? null : (
              <StatePanel
                title="Showing the last state the cloud API returned for this command"
                tone="warning"
                role="status"
                headingLevel={4}
                testId="command-details-refresh-failure"
                action={
                  <RetryButton
                    onClick={observation.recheck}
                    label="Check again"
                    testId="command-details-refresh-retry"
                  />
                }
              >
                <p>
                  The most recent check did not succeed, so this may be out of date.{" "}
                  {describeCommandFailure(observation.refreshError)}
                </p>
              </StatePanel>
            )}
          </>
        )}
      </CModalBody>

      <CModalFooter>
        <CButton
          type="button"
          color="secondary"
          variant="outline"
          onClick={onClose}
          data-testid="command-details-close"
        >
          Close
        </CButton>
      </CModalFooter>
    </CModal>
  );
}
