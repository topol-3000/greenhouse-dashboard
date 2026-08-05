/**
 * What became of one submitted command, kept apart from what it asked for.
 *
 * The panel answers three separate questions and never lets one answer the
 * others:
 *
 * - **the request** — did the cloud API accept it, refuse it, or never answer;
 * - **the lifecycle** — `pending`, `applied` or `rejected`, in the contract's
 *   own vocabulary, with the raw value shown beside the label;
 * - **what was asked for** — `desired_value`, labelled as a request.
 *
 * What it will not do: call a `201` an application, call a lost connection a
 * failure, call an observation window running out a rejection, or overwrite the
 * reported state on the card above it. When a command is applied and the
 * reported state has not changed, both facts stay on screen exactly as they are.
 *
 * The lifecycle carries a badge as well as its words. The badge repeats the
 * state; it never replaces it, and the raw enum stays on screen beside it.
 */

import { CBadge, CButton, CSpinner } from "@coreui/react";
import { Link } from "react-router";
import type { CommandState } from "../../api/contract";
import type { CommandObservation, Submission } from "./useZoneManualControl";
import { commandStateLabel, commandStateMeaning, desiredValueLabel } from "./commandLabels";
import { describeCommandFailure } from "./commandLabels";
import { Note, StatePanel } from "../../components/StatePanel";
import { RetryButton } from "../../components/TopologyStates";
import { COMMAND_OBSERVATION_WINDOW_MS } from "../../api/queries";
import { activityPath } from "../../routes/routes";
import { formatIsoInstant } from "../../shared/format";
import { MetaList } from "../topology/MetaList";

interface CommandProgressPanelProps {
  submission: Submission;
  observation: CommandObservation;
  /** The facility in the address, so Activity can be opened in this context. */
  facilityId: string;
  onRetryAmbiguous: () => void;
  onLookUpAmbiguous: () => void;
  onRecheck: () => void;
  onDismiss: () => void;
}

/** The observation window in whole minutes, for the sentence that reports it. */
const WINDOW_MINUTES = Math.round(COMMAND_OBSERVATION_WINDOW_MS / 60_000);

const STATE_COLOUR: Record<CommandState, "info" | "success" | "danger"> = {
  pending: "info",
  applied: "success",
  rejected: "danger",
};

/** The portal's "sending…" line: a spinner beside words that carry the state. */
function Working({ children, testId }: { children: string; testId: string }) {
  return (
    <p
      className="d-flex align-items-center gap-2 text-body-secondary"
      role="status"
      data-testid={testId}
    >
      <CSpinner as="span" size="sm" role={undefined} visuallyHiddenLabel="" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

function DismissButton({
  onDismiss,
  testId,
  label = "Dismiss",
}: {
  onDismiss: () => void;
  testId?: string;
  label?: string;
}) {
  return (
    <CButton
      type="button"
      color="secondary"
      variant="outline"
      size="sm"
      onClick={onDismiss}
      {...(testId === undefined ? {} : { "data-testid": testId })}
    >
      {label}
    </CButton>
  );
}

export function CommandProgressPanel({
  submission,
  observation,
  facilityId,
  onRetryAmbiguous,
  onLookUpAmbiguous,
  onRecheck,
  onDismiss,
}: CommandProgressPanelProps) {
  const requested = desiredValueLabel(submission.intent.desiredValue);

  if (submission.phase === "submitting") {
    return (
      <Working testId="command-submitting">
        {`Sending the request to turn ${requested.toLowerCase()}…`}
      </Working>
    );
  }

  if (submission.phase === "refused") {
    return (
      <StatePanel
        title="The cloud API did not accept this command"
        tone="error"
        role="alert"
        headingLevel={4}
        testId="command-refused"
        action={<DismissButton onDismiss={onDismiss} />}
      >
        <p>{describeCommandFailure(submission.error)}</p>
        <p className="small mb-0">
          Nothing was sent again. The reported state above is unchanged and still comes from the
          cloud API.
        </p>
      </StatePanel>
    );
  }

  if (submission.phase === "ambiguous") {
    return (
      <StatePanel
        title="This command may or may not have been created"
        tone="warning"
        role="alert"
        headingLevel={4}
        testId="command-ambiguous"
      >
        <p>{describeCommandFailure(submission.error)}</p>
        {submission.resolvedAbsent ? (
          <p data-testid="command-resolved-absent">
            The cloud API has no command under this request&rsquo;s identifier, so nothing was
            created. Sending it again is safe.
          </p>
        ) : (
          <p>
            The portal will not send it again on its own, and it will not claim it failed. The
            request&rsquo;s identifier still identifies it, so asking the cloud API about that
            identifier is safe, and so is sending the same request again — the cloud API returns the
            stored command rather than creating a second one.
          </p>
        )}
        {submission.lookupError === null || submission.lookupError === undefined ? null : (
          <p data-testid="command-lookup-error">{describeCommandFailure(submission.lookupError)}</p>
        )}
        <div className="d-flex flex-wrap gap-2">
          <CButton
            type="button"
            color="secondary"
            variant="outline"
            size="sm"
            onClick={onLookUpAmbiguous}
            disabled={submission.isLookingUp || submission.resolvedAbsent}
            data-testid="command-lookup"
          >
            {submission.isLookingUp ? "Checking…" : "Check whether it was created"}
          </CButton>
          <CButton
            type="button"
            color="secondary"
            variant="outline"
            size="sm"
            onClick={onRetryAmbiguous}
            disabled={submission.isLookingUp}
            data-testid="command-retry-ambiguous"
          >
            Send the same request again
          </CButton>
        </div>
      </StatePanel>
    );
  }

  const command = observation.command;

  if (observation.isMissing) {
    return (
      <StatePanel
        title="The cloud API no longer has this command"
        tone="warning"
        headingLevel={4}
        testId="command-missing"
        action={<DismissButton onDismiss={onDismiss} />}
      >
        <p>The portal has stopped checking it. Nothing about the reported state above changed.</p>
      </StatePanel>
    );
  }

  if (command === undefined) {
    return <Working testId="command-loading">Reading the command’s state…</Working>;
  }

  return (
    <div
      className="d-flex flex-column align-items-start gap-2 w-100 pt-3 border-top"
      data-testid="command-progress"
    >
      <h5 className="text-uppercase small text-body-secondary mb-0">This command</h5>

      {/*
        One live region for the lifecycle, so a transition is announced once. The
        text changes only when the state or its meaning changes, which is why a
        poll that returns the same answer announces nothing.
      */}
      <p className="text-break" role="status" data-testid="command-state">
        <CBadge color={STATE_COLOUR[command.state]} className="me-2">
          {commandStateLabel(command.state)}
        </CBadge>
        {commandStateMeaning(command)}
      </p>

      <MetaList
        testId="command-meta"
        items={[
          {
            label: "Requested state",
            value: (
              <span data-testid="command-desired-value">
                {desiredValueLabel(command.desired_value)}
              </span>
            ),
          },
          { label: "Command state", value: <code>{command.state}</code> },
          {
            label: "Issued at",
            value: <time dateTime={command.issued_at}>{formatIsoInstant(command.issued_at)}</time>,
          },
          {
            label: "Received by the greenhouse",
            value:
              command.acknowledged_at === null ? (
                "Not yet"
              ) : (
                <time dateTime={command.acknowledged_at}>
                  {formatIsoInstant(command.acknowledged_at)}
                </time>
              ),
          },
          {
            label: "Completed at",
            value:
              command.executed_at === null ? (
                "Not yet"
              ) : (
                <time dateTime={command.executed_at}>{formatIsoInstant(command.executed_at)}</time>
              ),
          },
        ]}
      />

      {command.rejection_reason === null ? null : (
        <StatePanel
          title="Why the greenhouse rejected it"
          tone="error"
          headingLevel={4}
          testId="command-rejection"
        >
          <p>{command.rejection_reason.message}</p>
          <p className="small mb-0">
            Reason code: <code>{command.rejection_reason.code}</code>
          </p>
        </StatePanel>
      )}

      {submission.wasReplayed ? (
        <Note testId="command-replayed">
          This request identified a command the cloud API had already stored, so nothing was sent a
          second time.
        </Note>
      ) : null}

      {observation.isTerminal ? (
        <Note testId="command-terminal-note">
          This is the command&rsquo;s final state, and the portal has stopped checking it. What the
          equipment reports is shown as the reported state above, separately, and may not have
          changed.
        </Note>
      ) : null}

      {observation.isObserving ? (
        <Note testId="command-observing">
          Checking the cloud API for this command&rsquo;s state.
        </Note>
      ) : null}

      {observation.stoppedUnconfirmed ? (
        <StatePanel
          title="Status is still unconfirmed"
          tone="warning"
          role="status"
          headingLevel={4}
          testId="command-unconfirmed"
          action={<RetryButton onClick={onRecheck} label="Check again" testId="command-recheck" />}
        >
          <p>
            The portal stopped checking automatically after {WINDOW_MINUTES} minutes. This is not a
            failure: the command is still <code>{command.state}</code> as far as the cloud API has
            said, and it may still be delivered.
          </p>
        </StatePanel>
      ) : null}

      {observation.refreshError === null || observation.refreshError === undefined ? null : (
        <StatePanel
          title="Showing the last state the cloud API returned for this command"
          tone="warning"
          role="status"
          headingLevel={4}
          testId="command-refresh-failure"
          action={
            <RetryButton onClick={onRecheck} label="Check again" testId="command-refresh-retry" />
          }
        >
          <p>
            The most recent check did not succeed, so this may be out of date.{" "}
            {describeCommandFailure(observation.refreshError)}
          </p>
        </StatePanel>
      )}

      {/*
        The one link Activity adds to this workspace. It carries the context
        already on screen — the facility in the address, and the zone, control
        point and command the cloud API named on this command — so the command
        stays reachable after this panel is dismissed or this page is left.
        Activity is read-only: this opens a record, it does not resend anything.
      */}
      <Note>
        <Link
          to={activityPath({
            facility: facilityId,
            zone: command.control_zone_id,
            point: command.target_point_id,
            command: command.id,
          })}
          data-testid="command-activity-link"
        >
          View this command in Activity
        </Link>
      </Note>

      <DismissButton
        onDismiss={onDismiss}
        testId="command-dismiss"
        label="Stop showing this command"
      />
    </div>
  );
}
