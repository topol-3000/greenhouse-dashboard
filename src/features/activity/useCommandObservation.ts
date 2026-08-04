/**
 * Following one opened command, for a bounded time.
 *
 * Activity is read-only, so unlike Unit 4 there is no submission to follow —
 * there is an address that names a command, which may have been opened from the
 * list, followed from the control workspace, or restored by a page refresh. In
 * all three cases the rule is the same one the contract states:
 *
 * - `pending` is the only non-terminal state, so only a pending command is worth
 *   asking about again;
 * - `applied` and `rejected` are reached once and never left, so polling stops
 *   the moment one arrives;
 * - `404` is the backend's answer rather than a hiccup, so polling stops there
 *   too;
 * - and nothing in the contract promises a command ever settles, so the portal
 *   stops after a bounded observation window and says the status is
 *   *unconfirmed* — never that it failed, and never that a gateway is offline.
 *
 * Opening a different command starts a new window. Re-opening the same command
 * after a refresh starts a new window as well: the customer asked again, and a
 * window that began in a page that no longer exists is not a reason to refuse.
 */

import { useCallback, useEffect, useState } from "react";
import type { CommandRead } from "../../api/contract";
import { isTerminalCommandState } from "../../api/control";
import { COMMAND_OBSERVATION_WINDOW_MS, useCommandQuery } from "../../api/queries";
import { isResourceMissing } from "../../api/topology";
import type { LoadState } from "../topology/useTopology";
import { toLoadState } from "../topology/useTopology";

/** Everything a screen needs to describe one followed command. */
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
   * A client-side observation window running out. Not a failure, not a domain
   * timeout, and not a statement about the greenhouse: the command may still be
   * delivered.
   */
  readonly stoppedUnconfirmed: boolean;
  /** The cloud API has no command with the identifier being followed. */
  readonly isMissing: boolean;
  /** Resume checking, after the window ran out or a check failed. */
  readonly recheck: () => void;
}

/** An observation of nothing, for when no command is open. */
const IDLE: Omit<CommandObservation, "recheck"> = {
  isLoading: false,
  isRefreshing: false,
  error: null,
  refreshError: null,
  command: undefined,
  isTerminal: false,
  isObserving: false,
  stoppedUnconfirmed: false,
  isMissing: false,
};

/**
 * Follow one command's lifecycle while it is open.
 *
 * @param commandId The command the address names, or `undefined` for none.
 * @returns The observation the details region renders.
 */
export function useCommandObservation(commandId: string | undefined): CommandObservation {
  /*
   * The window is measured by a timer rather than stamped from the clock, so no
   * render ever reads `Date.now()`. One window is identified by the command it
   * belongs to and the attempt that opened it: opening another command changes
   * the key and starts a fresh full-length window, and so does asking to check
   * again, which is exactly what "a refresh may start a new bounded observation
   * window" means.
   */
  const [attempt, setAttempt] = useState(0);
  const [expiredWindow, setExpiredWindow] = useState<string | null>(null);

  const windowKey = commandId === undefined ? null : `${commandId}#${String(attempt)}`;
  const expired = windowKey !== null && expiredWindow === windowKey;

  // The end of the window is the caller's to decide, so the query is told to
  // stop rather than being given a start time to compare a clock against.
  const query = useCommandQuery(commandId, undefined, expired);

  useEffect(() => {
    if (windowKey === null) {
      return;
    }
    const timer = setTimeout(() => {
      setExpiredWindow(windowKey);
    }, COMMAND_OBSERVATION_WINDOW_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [windowKey]);

  const recheck = useCallback(() => {
    // Resuming is a new window over the same command, not a new command: the
    // identifier and everything already known about it are kept.
    setAttempt((current) => current + 1);
    void query.refetch();
  }, [query]);

  if (commandId === undefined) {
    return { ...IDLE, recheck };
  }

  const command = query.data;
  const isTerminal = command !== undefined && isTerminalCommandState(command.state);
  const isMissing = isResourceMissing(query.error);

  return {
    ...toLoadState(query),
    command,
    isTerminal,
    isObserving: !isMissing && !isTerminal && !expired,
    stoppedUnconfirmed: !isMissing && !isTerminal && expired && command !== undefined,
    isMissing,
    recheck,
  };
}
