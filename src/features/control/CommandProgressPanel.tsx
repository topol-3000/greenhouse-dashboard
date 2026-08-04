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
 */

import { Link } from "react-router";
import type { CommandObservation, Submission } from "./useZoneManualControl";
import { commandStateLabel, commandStateMeaning, desiredValueLabel } from "./commandLabels";
import { describeCommandFailure } from "./commandLabels";
import { StatePanel } from "../../components/StatePanel";
import { COMMAND_OBSERVATION_WINDOW_MS } from "../../api/queries";
import { activityPath } from "../../routes/routes";
import { formatIsoInstant } from "../../shared/format";

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
      <p className="loading" role="status" data-testid="command-submitting">
        <span className="spinner" aria-hidden="true" />
        <span>Sending the request to turn {requested.toLowerCase()}…</span>
      </p>
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
        action={
          <button type="button" className="button button--inline" onClick={onDismiss}>
            Dismiss
          </button>
        }
      >
        <p>{describeCommandFailure(submission.error)}</p>
        <p className="panel__meta">
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
        <div className="control__actions">
          <button
            type="button"
            className="button"
            onClick={onLookUpAmbiguous}
            disabled={submission.isLookingUp || submission.resolvedAbsent}
            data-testid="command-lookup"
          >
            {submission.isLookingUp ? "Checking…" : "Check whether it was created"}
          </button>
          <button
            type="button"
            className="button"
            onClick={onRetryAmbiguous}
            disabled={submission.isLookingUp}
            data-testid="command-retry-ambiguous"
          >
            Send the same request again
          </button>
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
        action={
          <button type="button" className="button button--inline" onClick={onDismiss}>
            Dismiss
          </button>
        }
      >
        <p>The portal has stopped checking it. Nothing about the reported state above changed.</p>
      </StatePanel>
    );
  }

  if (command === undefined) {
    return (
      <p className="loading" role="status" data-testid="command-loading">
        <span className="spinner" aria-hidden="true" />
        <span>Reading the command&rsquo;s state…</span>
      </p>
    );
  }

  return (
    <div className="control__command" data-testid="command-progress">
      <h5 className="control__state-heading">This command</h5>

      {/*
        One live region for the lifecycle, so a transition is announced once. The
        text changes only when the state or its meaning changes, which is why a
        poll that returns the same answer announces nothing.
      */}
      <p className="control__lifecycle" role="status" data-testid="command-state">
        <strong>{commandStateLabel(command.state)}</strong> — {commandStateMeaning(command)}
      </p>

      <dl className="meta" data-testid="command-meta">
        <div className="meta__row">
          <dt className="meta__label">Requested state</dt>
          <dd className="meta__value" data-testid="command-desired-value">
            {desiredValueLabel(command.desired_value)}
          </dd>
        </div>
        <div className="meta__row">
          <dt className="meta__label">Command state</dt>
          <dd className="meta__value">
            <code>{command.state}</code>
          </dd>
        </div>
        <div className="meta__row">
          <dt className="meta__label">Issued at</dt>
          <dd className="meta__value">
            <time dateTime={command.issued_at}>{formatIsoInstant(command.issued_at)}</time>
          </dd>
        </div>
        <div className="meta__row">
          <dt className="meta__label">Received by the greenhouse</dt>
          <dd className="meta__value">
            {command.acknowledged_at === null ? (
              "Not yet"
            ) : (
              <time dateTime={command.acknowledged_at}>
                {formatIsoInstant(command.acknowledged_at)}
              </time>
            )}
          </dd>
        </div>
        <div className="meta__row">
          <dt className="meta__label">Completed at</dt>
          <dd className="meta__value">
            {command.executed_at === null ? (
              "Not yet"
            ) : (
              <time dateTime={command.executed_at}>{formatIsoInstant(command.executed_at)}</time>
            )}
          </dd>
        </div>
      </dl>

      {command.rejection_reason === null ? null : (
        <StatePanel
          title="Why the greenhouse rejected it"
          tone="error"
          headingLevel={4}
          testId="command-rejection"
        >
          <p>{command.rejection_reason.message}</p>
          <p className="panel__meta">
            Reason code: <code>{command.rejection_reason.code}</code>
          </p>
        </StatePanel>
      )}

      {submission.wasReplayed ? (
        <p className="inline-note" data-testid="command-replayed">
          This request identified a command the cloud API had already stored, so nothing was sent a
          second time.
        </p>
      ) : null}

      {observation.isTerminal ? (
        <p className="inline-note" data-testid="command-terminal-note">
          This is the command&rsquo;s final state, and the portal has stopped checking it. What the
          equipment reports is shown as the reported state above, separately, and may not have
          changed.
        </p>
      ) : null}

      {observation.isObserving ? (
        <p className="inline-note" data-testid="command-observing">
          Checking the cloud API for this command&rsquo;s state.
        </p>
      ) : null}

      {observation.stoppedUnconfirmed ? (
        <StatePanel
          title="Status is still unconfirmed"
          tone="warning"
          role="status"
          headingLevel={4}
          testId="command-unconfirmed"
          action={
            <button
              type="button"
              className="button"
              onClick={onRecheck}
              data-testid="command-recheck"
            >
              Check again
            </button>
          }
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
            <button
              type="button"
              className="button"
              onClick={onRecheck}
              data-testid="command-refresh-retry"
            >
              Check again
            </button>
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
      <p className="inline-note">
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
      </p>

      <button
        type="button"
        className="button button--inline"
        onClick={onDismiss}
        data-testid="command-dismiss"
      >
        Stop showing this command
      </button>
    </div>
  );
}
