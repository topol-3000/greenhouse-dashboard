/**
 * Words for command activity.
 *
 * Every label is a presentation of a value the contract published. The state
 * words themselves are Unit 4's — `commandStateLabel` and `commandStateMeaning`
 * in [`commandLabels.ts`](../control/commandLabels.ts) — so one command reads
 * the same in the control workspace and in Activity rather than gaining a second
 * vocabulary here.
 *
 * What this module adds is the two things Activity shows that manual control did
 * not: who asked for a command, and whether the greenhouse has been recorded as
 * receiving it.
 *
 * The one thing it will not do is invent a fourth lifecycle. `CommandState` has
 * three values and acknowledgement is not one of them: "Acknowledgement is not a
 * state. A pending command whose `acknowledged_at` is set has been received by
 * the Edge and nothing more". So receipt is presented beside the state, never as
 * the state.
 */

import type { CommandRead, CommandSource } from "../../api/contract";
import { CONTROL_LOOP_COMMAND_SOURCE, MANUAL_COMMAND_SOURCE } from "../../api/contract";
import { formatContractValue } from "../../shared/format";

/** The customer-readable name of one command source. */
export function sourceLabel(source: CommandSource): string {
  switch (source) {
    case MANUAL_COMMAND_SOURCE:
      return "Manual";
    case CONTROL_LOOP_COMMAND_SOURCE:
      return "Automatic";
    default:
      // A source this portal has never seen is shown as the API spelled it,
      // rather than being sorted into one of the two it does know.
      return formatContractValue(source);
  }
}

/** What a command's source means, in one sentence. */
export function sourceMeaning(source: CommandSource): string {
  switch (source) {
    case MANUAL_COMMAND_SOURCE:
      return "A person asked for this command from the portal.";
    case CONTROL_LOOP_COMMAND_SOURCE:
      return "The greenhouse's own control system asked for this command. The portal does not configure or change that system.";
    default:
      return "The cloud API published a source this portal does not recognise. It is shown exactly as it arrived.";
  }
}

/** One option of the source filter, in the order it is offered. */
export interface SourceFilterOption {
  /** The `?source=` value, empty for no filter at all. */
  readonly value: string;
  readonly label: string;
}

/**
 * The source filter's options.
 *
 * Three, because the contract publishes two sources and "no filter" is the
 * third thing a customer can mean. There is deliberately no lifecycle filter
 * beside it: `GET /api/v1/commands` publishes no `state` parameter, and
 * filtering an already-limited window in the browser would present a subset of
 * the most recent 100 commands as though it were the most recent 100 rejected
 * ones.
 */
export const SOURCE_FILTER_OPTIONS: readonly SourceFilterOption[] = [
  { value: "", label: "All sources" },
  { value: MANUAL_COMMAND_SOURCE, label: "Manual" },
  { value: CONTROL_LOOP_COMMAND_SOURCE, label: "Automatic" },
];

/**
 * Whether the cloud API has recorded the greenhouse receiving this command.
 *
 * @param command The command as the API described it.
 * @returns Whether `acknowledged_at` carries an instant.
 */
export function wasReceivedByGreenhouse(command: CommandRead): boolean {
  return command.acknowledged_at !== null;
}

/**
 * The receipt indicator's words, which are never the lifecycle's words.
 *
 * Receipt says the command reached the greenhouse. It says nothing about
 * whether anything moved, and on a terminal command it is history rather than
 * progress — so the sentence never implies an outcome the state has not
 * reported.
 *
 * @param command The command as the API described it.
 * @returns The text to render beside the lifecycle.
 */
export function receiptLabel(command: CommandRead): string {
  return wasReceivedByGreenhouse(command) ? "Received by the greenhouse" : "Receipt not confirmed";
}
