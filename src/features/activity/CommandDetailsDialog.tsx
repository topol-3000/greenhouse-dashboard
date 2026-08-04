/**
 * One command, in full, as a modal dialog.
 *
 * It follows the confirmation dialog Unit 4 established: focus starts inside it,
 * Tab stays inside it, Escape and Close close it, and closing returns focus to
 * the row that opened it. Closing removes the `command` parameter and nothing
 * else, so the filters behind it survive.
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

import { useCallback, useEffect, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { MANUAL_COMMAND_SOURCE } from "../../api/contract";
import { COMMAND_OBSERVATION_WINDOW_MS } from "../../api/queries";
import { LoadingState, StatePanel } from "../../components/StatePanel";
import { ReportedState } from "../control/ReportedState";
import {
  commandStateLabel,
  commandStateMeaning,
  describeCommandFailure,
  desiredValueLabel,
} from "../control/commandLabels";
import { formatIsoInstant } from "../../shared/format";
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

/** Elements inside the dialog that can hold focus. */
const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex="0"]';

/** The observation window in whole minutes, for the sentence that reports it. */
const WINDOW_MINUTES = Math.round(COMMAND_OBSERVATION_WINDOW_MS / 60_000);

/** One row of the detail list. `null` renders as an explicit absence. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="meta__row">
      <dt className="meta__label">{label}</dt>
      <dd className="meta__value">{children}</dd>
    </div>
  );
}

/** An instant, or the words for not having one. */
function Instant({ iso, absent }: { iso: string | null; absent: string }) {
  if (iso === null) {
    return <>{absent}</>;
  }
  return <time dateTime={iso}>{formatIsoInstant(iso)}</time>;
}

export function CommandDetailsDialog({
  details,
  siteName,
  facilityName,
  zoneName,
  onClose,
}: CommandDetailsDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<Element | null>(null);

  // Focus starts on the dialog itself, so a screen reader announces the whole
  // region rather than whichever control happens to be first, and so the key
  // that opened it cannot activate anything inside it.
  useEffect(() => {
    openerRef.current = document.activeElement;
    dialogRef.current?.focus();
    const opener = openerRef.current;
    return () => {
      if (opener instanceof HTMLElement && document.contains(opener)) {
        opener.focus();
      }
    };
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const dialog = dialogRef.current;
      if (dialog === null) {
        return;
      }
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) {
        return;
      }
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  const { observation, labels } = details;
  const command = labels?.command;

  return (
    <div className="modal" data-testid="command-details-backdrop">
      <div
        className="modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-details-heading"
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={onKeyDown}
        data-testid="command-details"
      >
        <h3 className="modal__title" id="command-details-heading">
          Command details
        </h3>

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
            action={
              <button
                type="button"
                className="button"
                onClick={observation.recheck}
                data-testid="command-details-retry"
              >
                Try again
              </button>
            }
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
            <p className="control__lifecycle" role="status" data-testid="command-details-state">
              <strong>{commandStateLabel(command.state)}</strong> — {commandStateMeaning(command)}
            </p>

            <div className="control__state">
              <h4 className="control__state-heading">Requested</h4>
              <p className="control__reported" data-testid="command-details-desired">
                {desiredValueLabel(command.desired_value)}
              </p>
              <p className="inline-note">
                What this command asked the greenhouse for. It is a request, not a reading.
              </p>
            </div>

            <div className="control__state">
              <h4 className="control__state-heading">Reported by the greenhouse now</h4>
              {details.labelsUnavailable ? (
                <p
                  className="inline-note inline-note--warning"
                  data-testid="command-reported-unavailable"
                >
                  The cloud API has not returned this facility’s configuration, so the reported
                  state of {labels.reported.pointId} cannot be shown. Everything the cloud API
                  published about the command itself is below.
                </p>
              ) : (
                <>
                  <ReportedState feedback={details.reported} testId="command-reported-state" />
                  <p className="inline-note">
                    The current state of the point that reports this control point back, read now.
                    It is not this command&rsquo;s result: a reading can match a rejected request
                    and can lag an applied one.
                  </p>
                </>
              )}
            </div>

            <dl className="meta" data-testid="command-details-meta">
              <Row label="Command ID">
                <code>{command.id}</code>
              </Row>
              <Row label="Source">
                {sourceLabel(command.source)} <code>{command.source}</code>
              </Row>
              <Row label="Site">{siteName ?? "Not available"}</Row>
              <Row label="Facility">{facilityName ?? "Not available"}</Row>
              <Row label="Control zone">{zoneName}</Row>
              <Row label="Control point">
                <PointIdentity label={labels.target} />
              </Row>
              <Row label="Reporting point">
                <PointIdentity label={labels.reported} />
              </Row>
              <Row label="Requested state">{desiredValueLabel(command.desired_value)}</Row>
              <Row label="Command state">
                <code>{command.state}</code>
              </Row>
              <Row label="Created">
                <Instant iso={command.created_at} absent="Not available" />
              </Row>
              <Row label="Issued">
                <Instant iso={command.issued_at} absent="Not available" />
              </Row>
              <Row label="Received by the greenhouse">
                <Instant iso={command.acknowledged_at} absent="Not yet" />
              </Row>
              <Row label="Completed">
                <Instant iso={command.executed_at} absent="Not yet" />
              </Row>
              <Row label="Control loop">
                {command.control_loop_id === null ? (
                  <span data-testid="command-details-loop-absent">
                    {command.source === MANUAL_COMMAND_SOURCE
                      ? "None — a person asked for this command"
                      : "The cloud API names none"}
                  </span>
                ) : (
                  <code>{command.control_loop_id}</code>
                )}
              </Row>
              <Row label="Triggering measurement">
                {command.trigger_sample_id === null ? (
                  <span data-testid="command-details-trigger-absent">
                    {command.source === MANUAL_COMMAND_SOURCE
                      ? "None — a person asked for this command"
                      : "The cloud API names none"}
                  </span>
                ) : (
                  <code>{command.trigger_sample_id}</code>
                )}
              </Row>
            </dl>

            <p className="inline-note" data-testid="command-details-source-meaning">
              {sourceMeaning(command.source)}
            </p>

            <p className="inline-note" data-testid="command-details-receipt">
              {receiptLabel(command)}. Receipt means the greenhouse received the command. It is not
              a command state, and it does not say anything moved.
            </p>

            {command.rejection_reason === null ? null : (
              <StatePanel
                title="Why the greenhouse rejected it"
                tone="error"
                headingLevel={4}
                testId="command-details-rejection"
              >
                <p>{command.rejection_reason.message}</p>
                <p className="panel__meta">
                  Reason code: <code>{command.rejection_reason.code}</code>
                </p>
              </StatePanel>
            )}

            {observation.isTerminal ? (
              <p className="inline-note" data-testid="command-details-terminal">
                This is the command&rsquo;s final state, and the portal has stopped checking it.
              </p>
            ) : null}

            {observation.isObserving ? (
              <p className="inline-note" data-testid="command-details-observing">
                Checking the cloud API for this command&rsquo;s state.
              </p>
            ) : null}

            {observation.stoppedUnconfirmed ? (
              <StatePanel
                title="Status is still unconfirmed"
                tone="warning"
                role="status"
                headingLevel={4}
                testId="command-details-unconfirmed"
                action={
                  <button
                    type="button"
                    className="button"
                    onClick={observation.recheck}
                    data-testid="command-details-recheck"
                  >
                    Check again
                  </button>
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
                  <button
                    type="button"
                    className="button"
                    onClick={observation.recheck}
                    data-testid="command-details-refresh-retry"
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
          </>
        )}

        <div className="modal__actions">
          <button
            type="button"
            className="button"
            onClick={onClose}
            data-testid="command-details-close"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
