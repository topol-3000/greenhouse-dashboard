/**
 * The view model for a control zone's manual-control section.
 *
 * It is the only place a command is submitted or followed, and the components
 * below it stay presentational. It reads the same facility configuration query
 * monitoring reads — the same key, so the two share one poll rather than asking
 * twice — and adds exactly two requests of its own: the `POST` that creates one
 * command, and the bounded `GET` that follows it.
 *
 * Three states are kept apart on purpose, because merging any two of them would
 * be a lie the customer cannot check:
 *
 * - **requested** — `desired_value`, what this command asked for;
 * - **reported** — the reported point's own last state, what the greenhouse
 *   says is happening;
 * - **lifecycle** — `CommandState`, how far the request got.
 *
 * A submission is a request and never a reading. No cache is written ahead of an
 * answer, the reported state is never replaced by what was asked for, and a
 * `201` is never rendered as `applied`.
 *
 * One user intent owns one idempotency key. The key is generated when the
 * customer confirms, kept for a safe replay of that same intent, and never
 * reused for a different target or a different value.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { CommandRead } from "../../api/contract";
import { findCommandByIdempotencyKey, isTerminalCommandState } from "../../api/control";
import { canGenerateIdempotencyKey, newIdempotencyKey } from "../../api/idempotency";
import { NetworkError } from "../../api/errors";
import {
  COMMAND_OBSERVATION_WINDOW_MS,
  queryKeys,
  useCommandQuery,
  useFacilityConfigurationQuery,
  useManualCommandMutation,
} from "../../api/queries";
import { isResourceMissing, sameResourceId } from "../../api/topology";
import type { LoadState } from "../topology/useTopology";
import { toLoadState } from "../topology/useTopology";
import type { ZoneActuator } from "./actuators";
import { readZoneActuators } from "./actuators";

/** The API answered about a command that is not the one this intent asked for. */
export class MismatchedCommandError extends Error {
  constructor() {
    super("The cloud API answered with a command for a different target.");
    this.name = "MismatchedCommandError";
  }
}

/** How far one submitted intent has got. */
export type SubmissionPhase =
  /** Nothing has been submitted from this workspace. */
  | "idle"
  /** The `POST` is in flight. Its outcome is not yet known. */
  | "submitting"
  /** The backend answered, and the command is being followed. */
  | "accepted"
  /** The backend refused the request. Nothing was created. */
  | "refused"
  /**
   * The request never completed. It may or may not have been accepted, and the
   * portal will not guess which.
   */
  | "ambiguous";

/** One thing the customer asked for, before or after it was submitted. */
export interface ManualIntent {
  readonly actuator: ZoneActuator;
  /** The value asked for. `true` is on, as `ManualCommandCreate` states. */
  readonly desiredValue: boolean;
}

/** A submitted intent and everything known about what became of it. */
export interface Submission {
  readonly intent: ManualIntent;
  /** The key this one logical intent is identified by, for its whole life. */
  readonly idempotencyKey: string;
  readonly phase: SubmissionPhase;
  /** The failure, when the backend refused the request or transport failed. */
  readonly error: unknown;
  /** Whether the backend replayed a command rather than creating one. */
  readonly wasReplayed: boolean;
  /** Whether an ambiguous submission has been looked up and found not to exist. */
  readonly resolvedAbsent: boolean;
  /** A failed lookup of an ambiguous submission. */
  readonly lookupError: unknown;
  readonly isLookingUp: boolean;
}

/** The lifecycle of the command the workspace is following. */
export interface CommandObservation extends LoadState {
  /** The command as the API last described it, kept across a failed refresh. */
  readonly command: CommandRead | undefined;
  /** Whether the state is one the contract says is never left again. */
  readonly isTerminal: boolean;
  /** Whether the portal is still checking. */
  readonly isObserving: boolean;
  /**
   * Whether the portal stopped checking without a terminal answer.
   *
   * This is a client-side observation window running out, not a failure and not
   * a domain timeout: the command may still be delivered.
   */
  readonly stoppedUnconfirmed: boolean;
  /** The cloud API has no command with the identifier the portal is following. */
  readonly isMissing: boolean;
  /** Resume checking, after the window ran out or a refresh failed. */
  readonly recheck: () => void;
}

/** Everything the manual-control section renders. */
export interface ZoneManualControl extends LoadState {
  /** Every control point the zone assigns as a `control_output`. */
  readonly actuators: readonly ZoneActuator[];
  /** The ones the contract proves can be commanded. */
  readonly commandable: readonly ZoneActuator[];
  /** Whether a configuration document has been read at all. */
  readonly hasInventory: boolean;
  /** Whether the configuration document contained this zone. */
  readonly zoneFound: boolean;
  /** The cloud API has no facility with the identifier in the address. */
  readonly isFacilityMissing: boolean;
  /** Whether this browser can produce the identifier a command requires. */
  readonly canSubmit: boolean;
  readonly refresh: () => void;
  /** The action awaiting explicit confirmation, if any. */
  readonly confirming: ManualIntent | undefined;
  /** Open the confirmation for one action. This sends nothing. */
  readonly requestAction: (actuator: ZoneActuator, desiredValue: boolean) => void;
  /** Close the confirmation without sending anything. */
  readonly cancelConfirmation: () => void;
  /** Submit the confirmed action. Exactly one request per confirmation. */
  readonly confirmAction: () => void;
  /** Replay an ambiguous submission with its original key. */
  readonly retryAmbiguous: () => void;
  /** Ask the API whether an ambiguous submission produced a command. */
  readonly lookUpAmbiguous: () => void;
  /** Stop showing the last submission and its command. */
  readonly dismissSubmission: () => void;
  readonly submission: Submission | undefined;
  readonly observation: CommandObservation;
}

/** Whether a command the API returned is a command for this exact intent. */
function commandMatchesIntent(command: CommandRead, zoneId: string, intent: ManualIntent): boolean {
  return (
    sameResourceId(command.control_zone_id, zoneId) &&
    sameResourceId(command.target_point_id, intent.actuator.pointId) &&
    command.desired_value === intent.desiredValue
  );
}

/** The mutable part of one submission, before the query layer is consulted. */
interface SubmissionState extends Submission {
  /** The command the creation response named, once there is one. */
  readonly commandId: string | undefined;
  /** When the portal started following it, in epoch milliseconds. */
  readonly observationStartedAt: number;
  /** Whether the observation window has run out without a terminal state. */
  readonly observationExpired: boolean;
}

/** A submission that has been created but not yet sent. */
function newSubmission(intent: ManualIntent, idempotencyKey: string): SubmissionState {
  return {
    intent,
    idempotencyKey,
    phase: "submitting",
    error: null,
    wasReplayed: false,
    resolvedAbsent: false,
    lookupError: null,
    isLookingUp: false,
    commandId: undefined,
    observationStartedAt: 0,
    observationExpired: false,
  };
}

/**
 * Read one control zone's manual-control state.
 *
 * @param facilityId The facility identifier from the route, untrusted.
 * @param zoneId The zone identifier from the route, untrusted.
 * @param enabled Whether the workspace is in a state where manual control may
 *   run. It is false for a zone the API does not have, and for a zone the
 *   contract places in a different facility — the portal offers no action for a
 *   relationship the API did not state.
 * @returns The manual-control view model.
 */
export function useZoneManualControl(
  facilityId: string | undefined,
  zoneId: string | undefined,
  enabled: boolean,
): ZoneManualControl {
  const queryClient = useQueryClient();
  const configuration = useFacilityConfigurationQuery(facilityId, enabled);
  const mutation = useManualCommandMutation();

  const [confirming, setConfirming] = useState<ManualIntent | undefined>(undefined);
  const [submission, setSubmission] = useState<SubmissionState | undefined>(undefined);

  // A submission belongs to the zone it was made in. Moving to another zone or
  // another facility leaves the workspace mounted, so the confirmation and the
  // command being followed are dropped as the address changes rather than being
  // carried into a workspace they say nothing about. This is the "adjust state
  // when a prop changes" pattern: it happens during the render that observes the
  // change, so no obsolete confirmation is ever painted.
  const workspaceKey = `${facilityId ?? ""}|${zoneId ?? ""}`;
  const [renderedKey, setRenderedKey] = useState(workspaceKey);
  if (renderedKey !== workspaceKey) {
    setRenderedKey(workspaceKey);
    setConfirming(undefined);
    setSubmission(undefined);
  }

  const inventory = useMemo(() => {
    if (configuration.data === undefined || zoneId === undefined) {
      return { zoneFound: false, actuators: [] as readonly ZoneActuator[] };
    }
    return readZoneActuators(configuration.data, zoneId);
  }, [configuration.data, zoneId]);

  const observationStartedAt = submission?.observationStartedAt ?? 0;
  const observedCommandId = submission?.commandId;
  const observationExpired = submission?.observationExpired ?? false;

  const commandQuery = useCommandQuery(observedCommandId, observationStartedAt, observationExpired);

  /*
   * The end of the observation window is the one thing here that comes from the
   * clock rather than from an answer, so it is subscribed to rather than read
   * during a render: one timer per observed command, cleared when the command
   * changes or the workspace unmounts, and never a repeating tick.
   */
  useEffect(() => {
    if (observedCommandId === undefined || observationStartedAt === 0 || observationExpired) {
      return;
    }
    const remaining = observationStartedAt + COMMAND_OBSERVATION_WINDOW_MS - Date.now();
    const timer = setTimeout(
      () => {
        setSubmission((current) =>
          current === undefined ||
          current.commandId !== observedCommandId ||
          current.observationStartedAt !== observationStartedAt
            ? current
            : { ...current, observationExpired: true },
        );
      },
      Math.max(remaining, 0),
    );
    return () => {
      clearTimeout(timer);
    };
  }, [observedCommandId, observationStartedAt, observationExpired]);

  // One representation of the command: the lifecycle query's, seeded on
  // acceptance with what the creation response already returned. A failed
  // refresh leaves the last good answer exactly where it was rather than
  // replacing it with an error.
  const command = commandQuery.data;
  const isTerminal = command !== undefined && isTerminalCommandState(command.state);
  const isCommandMissing = isResourceMissing(commandQuery.error);

  const canSubmit = canGenerateIdempotencyKey();

  const requestAction = useCallback((actuator: ZoneActuator, desiredValue: boolean) => {
    // Opening a confirmation for a different target or a different value makes
    // the previous one obsolete, and it is replaced rather than stacked.
    setConfirming({ actuator, desiredValue });
  }, []);

  const cancelConfirmation = useCallback(() => {
    setConfirming(undefined);
  }, []);

  const dismissSubmission = useCallback(() => {
    setSubmission(undefined);
  }, []);

  /**
   * Send one request for one intent, under one key.
   *
   * Guarded by a ref as well as by the disabled state of the button, so a second
   * click or a repeated Enter that arrives before React has re-rendered still
   * cannot produce a second request.
   */
  const submittingRef = useRef(false);

  const send = useCallback(
    (intent: ManualIntent, idempotencyKey: string) => {
      if (submittingRef.current || zoneId === undefined) {
        return;
      }
      submittingRef.current = true;

      setSubmission(newSubmission(intent, idempotencyKey));

      mutation.mutate(
        {
          controlZoneId: zoneId,
          targetPointId: intent.actuator.pointId,
          desiredValue: intent.desiredValue,
          idempotencyKey,
        },
        {
          onSettled: () => {
            submittingRef.current = false;
          },
          onSuccess: (acceptance) => {
            // The API answered about *some* command. It is adopted only if it is
            // the command this intent asked for.
            if (!commandMatchesIntent(acceptance.command, zoneId, intent)) {
              setSubmission((current) =>
                current === undefined
                  ? current
                  : { ...current, phase: "refused", error: new MismatchedCommandError() },
              );
              return;
            }
            // Seed the lifecycle query with what the creation already returned,
            // so the first render of the command is the answer in hand rather
            // than a second request for it.
            queryClient.setQueryData(queryKeys.command(acceptance.command.id), acceptance.command);
            setSubmission((current) =>
              current === undefined
                ? current
                : {
                    ...current,
                    phase: "accepted",
                    wasReplayed: acceptance.outcome === "existing",
                    commandId: acceptance.command.id,
                    observationStartedAt: Date.now(),
                    observationExpired: false,
                  },
            );
          },
          onError: (error) => {
            // A request that never completed is ambiguous, not failed: it may
            // have reached the backend. Anything the backend answered is a
            // refusal, and nothing was created.
            const ambiguous = error instanceof NetworkError;
            setSubmission((current) =>
              current === undefined
                ? current
                : { ...current, phase: ambiguous ? "ambiguous" : "refused", error },
            );
          },
        },
      );
    },
    [mutation, queryClient, zoneId],
  );

  const confirmAction = useCallback(() => {
    if (confirming === undefined) {
      return;
    }
    let key: string;
    try {
      key = newIdempotencyKey();
    } catch (error) {
      setSubmission({ ...newSubmission(confirming, ""), phase: "refused", error });
      setConfirming(undefined);
      return;
    }
    setConfirming(undefined);
    send(confirming, key);
  }, [confirming, send]);

  const retryAmbiguous = useCallback(() => {
    // The same intent keeps the same key. The contract guarantees that replaying
    // it returns the stored command and writes nothing a second time.
    if (submission === undefined || submission.phase !== "ambiguous") {
      return;
    }
    send(submission.intent, submission.idempotencyKey);
  }, [send, submission]);

  const lookUpAmbiguous = useCallback(() => {
    if (submission === undefined || submission.phase !== "ambiguous" || zoneId === undefined) {
      return;
    }
    const { idempotencyKey, intent } = submission;
    setSubmission((current) =>
      current === undefined ? current : { ...current, isLookingUp: true, lookupError: null },
    );

    findCommandByIdempotencyKey(idempotencyKey)
      .then((found) => {
        setSubmission((current) => {
          if (current === undefined || current.idempotencyKey !== idempotencyKey) {
            return current;
          }
          if (found === null) {
            return { ...current, isLookingUp: false, resolvedAbsent: true };
          }
          if (!commandMatchesIntent(found, zoneId, intent)) {
            return { ...current, isLookingUp: false, lookupError: new MismatchedCommandError() };
          }
          queryClient.setQueryData(queryKeys.command(found.id), found);
          return {
            ...current,
            isLookingUp: false,
            phase: "accepted",
            wasReplayed: true,
            commandId: found.id,
            observationStartedAt: Date.now(),
            observationExpired: false,
          };
        });
      })
      .catch((error: unknown) => {
        setSubmission((current) =>
          current === undefined || current.idempotencyKey !== idempotencyKey
            ? current
            : { ...current, isLookingUp: false, lookupError: error },
        );
      });
  }, [queryClient, submission, zoneId]);

  const recheck = useCallback(() => {
    // Resuming is a new window over the same command, not a new command: the
    // identifier, the key and everything already known about it are kept.
    setSubmission((current) =>
      current === undefined
        ? current
        : { ...current, observationStartedAt: Date.now(), observationExpired: false },
    );
    void commandQuery.refetch();
  }, [commandQuery]);

  const configurationState = toLoadState(configuration);
  const isFacilityMissing = isResourceMissing(configuration.error);

  // A lifecycle query with no command to read is idle, not loading: an
  // untouched manual-control section must not render a spinner for a request
  // nobody made.
  const commandState: LoadState =
    submission?.commandId === undefined
      ? { isLoading: false, isRefreshing: false, error: null, refreshError: null }
      : toLoadState(commandQuery);

  const isFollowing = observedCommandId !== undefined && !isCommandMissing;
  const isObserving = isFollowing && !isTerminal && !observationExpired;

  return {
    isLoading: isFacilityMissing ? false : configurationState.isLoading,
    isRefreshing: isFacilityMissing ? false : configurationState.isRefreshing,
    error: isFacilityMissing ? null : configurationState.error,
    refreshError: isFacilityMissing ? null : configurationState.refreshError,
    actuators: inventory.actuators,
    commandable: inventory.actuators.filter((actuator) => actuator.isCommandable),
    hasInventory: configuration.data !== undefined,
    zoneFound: inventory.zoneFound,
    isFacilityMissing,
    canSubmit,
    refresh: () => {
      void configuration.refetch();
    },
    confirming,
    requestAction,
    cancelConfirmation,
    confirmAction,
    retryAmbiguous,
    lookUpAmbiguous,
    dismissSubmission,
    submission,
    observation: {
      ...commandState,
      command,
      isTerminal,
      isObserving,
      stoppedUnconfirmed: isFollowing && !isTerminal && observationExpired,
      isMissing: isCommandMissing,
      recheck,
    },
  };
}
