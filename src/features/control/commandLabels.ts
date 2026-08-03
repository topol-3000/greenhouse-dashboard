/**
 * Words for a command's state, and for the ways a submission can fail.
 *
 * Every label here is a presentation of a value the contract published, never a
 * reinterpretation of it. `pending` is not "sending", `applied` is not
 * "switched on", and an HTTP status is never turned into a physical outcome. The
 * raw enum stays available beside the label, so the screen shows both what the
 * API said and what it means.
 */

import type { CommandRead, CommandState } from "../../api/contract";
import {
  APPLIED_COMMAND_STATE,
  PENDING_COMMAND_STATE,
  REJECTED_COMMAND_STATE,
  IDEMPOTENCY_KEY_CONFLICT_CODE,
} from "../../api/contract";
import { ApiError, describeError, NetworkError } from "../../api/errors";
import { IdempotencyKeyUnavailableError } from "../../api/idempotency";
import { formatContractValue } from "../../shared/format";
import { MismatchedCommandError } from "./useZoneManualControl";

/** The customer-readable name of one command state. */
export function commandStateLabel(state: CommandState): string {
  switch (state) {
    case PENDING_COMMAND_STATE:
      return "Pending";
    case APPLIED_COMMAND_STATE:
      return "Applied";
    case REJECTED_COMMAND_STATE:
      return "Rejected";
    default:
      // A state this portal has never seen is shown as the API spelled it,
      // rather than falling through a lookup table into a blank or, worse, into
      // another state's words.
      return formatContractValue(state);
  }
}

/**
 * What a command's current state means, in one sentence.
 *
 * `acknowledged_at` is read here because the contract is explicit about what it
 * does and does not mean: on a pending command it says the Edge received the
 * command "and nothing more: the physical change has not been reported either
 * way, so the command is still non-terminal".
 *
 * @param command The command as the API last described it.
 * @returns A sentence that says only what the contract says.
 */
export function commandStateMeaning(command: CommandRead): string {
  switch (command.state) {
    case PENDING_COMMAND_STATE:
      return command.acknowledged_at === null
        ? "The cloud API has stored the command. The greenhouse has not confirmed receiving it yet, and nothing has been reported as changed."
        : "The greenhouse received the command. Nothing has been reported as changed yet.";
    case APPLIED_COMMAND_STATE:
      return "The greenhouse reported this command as applied. What the equipment now reports is shown as the reported state.";
    case REJECTED_COMMAND_STATE:
      return "The greenhouse rejected this command. It was not applied.";
    default:
      return "The cloud API answered with a state this portal does not recognise. It is shown exactly as it arrived.";
  }
}

/** The value a command asked for, in the customer's words. */
export function desiredValueLabel(desiredValue: boolean): string {
  // `ManualCommandCreate.desired_value` states the mapping: "true is on".
  return desiredValue ? "On" : "Off";
}

/** The action a customer presses to ask for a value. */
export function actionLabel(desiredValue: boolean): string {
  return desiredValue ? "Turn on" : "Turn off";
}

/**
 * Describe a failed command submission.
 *
 * Statuses are read as the operation documents them and nothing is inferred
 * beyond that. In particular a `5xx` and a lost connection are *not* described
 * as a rejection: neither tells the portal whether the command was created.
 *
 * @param error The caught failure.
 * @returns A message safe to render.
 */
export function describeCommandFailure(error: unknown): string {
  if (error instanceof IdempotencyKeyUnavailableError || error instanceof MismatchedCommandError) {
    return error.message;
  }
  if (error instanceof NetworkError) {
    return "The portal could not reach the cloud API, so it does not know whether this command was created.";
  }
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return "The cloud API has no such control zone or control point (404). It may have been archived since this page was loaded.";
    }
    if (error.status === 409) {
      return error.code === IDEMPOTENCY_KEY_CONFLICT_CODE
        ? "The cloud API has already stored a different command under this request's identifier (409). Nothing was sent again."
        : "The cloud API refused this command because of a conflict (409). Nothing was sent again.";
    }
    if (error.status === 422) {
      return "The cloud API refused this command as invalid (422). It was not created.";
    }
    if (error.status === 401 || error.status === 403) {
      return `The cloud API did not permit this command (${String(error.status)}).`;
    }
    if (error.status >= 500) {
      return `The cloud API failed while handling this request (${String(error.status)}). It does not say whether the command was created.`;
    }
  }
  return describeError(error);
}

/**
 * Whether a failed submission may safely be sent again without a new intent.
 *
 * Only a transport failure qualifies, and only because the contract guarantees
 * that replaying the same key with the same body returns the stored command and
 * writes nothing. A `409` or a `422` is the backend's decision, and repeating it
 * would produce the same decision.
 *
 * @param error The caught failure.
 * @returns Whether a replay under the same key is defined behaviour.
 */
export function isAmbiguousSubmission(error: unknown): boolean {
  return error instanceof NetworkError;
}
