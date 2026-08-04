/**
 * Manual control requests: creating one command, and following it.
 *
 * The endpoint and schema mapping this file implements — how a controllable
 * point is identified, how it is related to the point that reports it back, and
 * what the contract's idempotency rules actually promise — is documented in
 * [`contract.ts`](./contract.ts).
 *
 * Three rules shape what is below.
 *
 * The request body is exactly `ManualCommandCreate` and nothing else. The schema
 * is `additionalProperties: false` and `desired_value` is a strict `bool`, so
 * there is no field to add, no value to coerce and no shape to guess at.
 *
 * The idempotency key is supplied by the caller and never invented here. The
 * contract requires the header, requires it to be a UUID, and states that the
 * server never replaces a supplied key — which is what makes one key one logical
 * user intent rather than one HTTP attempt.
 *
 * Creation is never retried by this layer. `POST` is not safe to repeat on its
 * own, and a lost response is ambiguous rather than failed: the caller decides
 * whether to resolve it with {@link findCommandByIdempotencyKey} or to replay it
 * with the same key.
 */

import { API_V1_PREFIX } from "./config";
import type {
  CommandListRead,
  CommandRead,
  CommandRejectionReason,
  CommandSource,
  CommandState,
  ManualCommandAcceptanceRead,
  ManualCommandCreate,
  ManualCommandOutcome,
} from "./contract";
import { IDEMPOTENCY_KEY_HEADER, TERMINAL_COMMAND_STATES } from "./contract";
import {
  asRecord,
  readNullableString,
  requireArray,
  requireBoolean,
  requireContractEnum,
  requireString,
} from "./decode";
import { getJson, postJson } from "./http";
import { resourcePath } from "./topology";

const COMMANDS_PATH = `${API_V1_PREFIX}/commands`;

/** The statuses `POST /api/v1/commands` documents as a successful outcome. */
const CREATION_STATUSES = [200, 201] as const;

/** Cancellation, carried by every control request. */
export interface ControlRequestOptions {
  readonly signal?: AbortSignal | undefined;
}

/**
 * Whether a command state is one the contract says is never left again.
 *
 * An unrecognised state is deliberately *not* treated as terminal: the portal
 * would be claiming an outcome the backend did not publish. It stays
 * non-terminal, and the caller's bounded observation window is what stops the
 * portal from watching it forever.
 *
 * @param state The command's `state`, as the API published it.
 * @returns Whether the state is `applied` or `rejected`.
 */
export function isTerminalCommandState(state: CommandState): boolean {
  return TERMINAL_COMMAND_STATES.includes(state);
}

/** Decode a `CommandRejectionReason`, or `null` when there is none. */
function parseRejectionReason(value: unknown): CommandRejectionReason | null {
  if (value === null || value === undefined) {
    return null;
  }
  const context = "command rejection reason";
  const record = asRecord(value, context);
  return {
    code: requireString(record, "code", context),
    message: requireString(record, "message", context),
  };
}

/**
 * Decode a `CommandRead`.
 *
 * Every identifier the schema requires is read, including `reported_point_id`
 * and `control_zone_id`: they are what let the workspace prove that a command it
 * is following is a command for the actuator and the zone on screen.
 */
export function parseCommand(body: unknown): CommandRead {
  const context = "command";
  const record = asRecord(body, context);
  return {
    id: requireString(record, "id", context),
    source: requireContractEnum<CommandSource>(record, "source", context),
    idempotency_key: requireString(record, "idempotency_key", context),
    control_zone_id: requireString(record, "control_zone_id", context),
    control_loop_id: readNullableString(record, "control_loop_id"),
    trigger_sample_id: readNullableString(record, "trigger_sample_id"),
    target_point_id: requireString(record, "target_point_id", context),
    reported_point_id: requireString(record, "reported_point_id", context),
    gateway_id: readNullableString(record, "gateway_id"),
    // A request, never a reading — and strictly a boolean, as the contract has
    // it on both sides of the boundary.
    desired_value: requireBoolean(record, "desired_value", context),
    state: requireContractEnum<CommandState>(record, "state", context),
    result_control_sample_id: readNullableString(record, "result_control_sample_id"),
    result_status_sample_id: readNullableString(record, "result_status_sample_id"),
    issued_at: requireString(record, "issued_at", context),
    executed_at: readNullableString(record, "executed_at"),
    acknowledged_at: readNullableString(record, "acknowledged_at"),
    rejection_reason: parseRejectionReason(record["rejection_reason"]),
    created_at: requireString(record, "created_at", context),
  };
}

/** Decode a `ManualCommandAcceptanceRead`. */
export function parseManualCommandAcceptance(body: unknown): ManualCommandAcceptanceRead {
  const context = "manual command acceptance";
  const record = asRecord(body, context);
  return {
    outcome: requireContractEnum<ManualCommandOutcome>(record, "outcome", context),
    command: parseCommand(record["command"]),
  };
}

/** Decode a `CommandListRead`: `items`, and nothing else. */
export function parseCommandList(body: unknown): CommandListRead {
  const context = "command list";
  const record = asRecord(body, context);
  return { items: requireArray(record, "items", context).map(parseCommand) };
}

/** One logical manual intent: what to ask for, and the key that identifies it. */
export interface ManualCommandRequest {
  /** The zone the target point is assigned to, from the address. */
  readonly controlZoneId: string;
  /** The active boolean control point to command. */
  readonly targetPointId: string;
  /** The state asked for. `true` is on, as `ManualCommandCreate` states. */
  readonly desiredValue: boolean;
  /**
   * The client-supplied UUID identifying this one logical command.
   *
   * One key belongs to one user intent, not to one HTTP attempt: replaying it
   * with the same body returns the stored command and writes nothing.
   */
  readonly idempotencyKey: string;
}

/** What `POST /api/v1/commands` answered, including how it answered. */
export interface ManualCommandAcceptance extends ManualCommandAcceptanceRead {
  /** `201` for a creation, `200` for an idempotent replay. */
  readonly status: number;
}

/**
 * Create one manual command, or replay one that already exists.
 *
 * The `outcome` is read from the body rather than inferred from the status code,
 * because the contract puts it in both "so a client behind a proxy that rewrites
 * statuses can still tell a first creation from a replay".
 *
 * Acceptance is acceptance of the *request*. The command it returns is `pending`
 * until the Edge reports otherwise, and nothing here treats a `200` or a `201`
 * as evidence that an actuator moved.
 *
 * @param request The zone, the point, the boolean asked for and the key.
 * @param options Cancellation.
 * @returns The stored command and whether this request created it.
 * @throws {ApiError} `404` for a target the API does not have, `409` for a key
 *   reused with a different request, `422` for a request it refused.
 * @throws {NetworkError} When the request never completed. It may still have
 *   been accepted.
 */
export async function createManualCommand(
  request: ManualCommandRequest,
  options: ControlRequestOptions = {},
): Promise<ManualCommandAcceptance> {
  const body: ManualCommandCreate = {
    control_zone_id: request.controlZoneId,
    target_point_id: request.targetPointId,
    desired_value: request.desiredValue,
  };

  const payload = await postJson(COMMANDS_PATH, {
    body,
    headers: { [IDEMPOTENCY_KEY_HEADER]: request.idempotencyKey },
    acceptStatuses: CREATION_STATUSES,
    signal: options.signal,
  });

  return { ...parseManualCommandAcceptance(payload.body), status: payload.status };
}

/**
 * Read one command's current lifecycle state.
 *
 * @param commandId The command to read, as the creation response named it.
 * @param options Cancellation.
 * @returns The stored command.
 * @throws {ApiError} `404` when the API has no such command.
 */
export async function fetchCommand(
  commandId: string,
  options: ControlRequestOptions = {},
): Promise<CommandRead> {
  const payload = await getJson(resourcePath(COMMANDS_PATH, commandId), {
    signal: options.signal,
  });
  return parseCommand(payload.body);
}

/**
 * The exact-match filters `GET /api/v1/commands` accepts, as Activity uses them.
 *
 * Every field is one of the operation's own query parameters. There is no
 * client-side filter here and none is added elsewhere: a filter the contract
 * does not publish would turn a bounded server-side window into a subset of a
 * subset, which is not something a screen could describe truthfully.
 */
export interface CommandListFilters {
  /** `control_zone_id`. Activity is always scoped to one zone. */
  readonly controlZoneId: string;
  /** `target_point_id`, when one actuator was chosen. */
  readonly targetPointId?: string | undefined;
  /** `source`, when the customer narrowed to manual or automatic commands. */
  readonly source?: CommandSource | undefined;
  /** `limit`, the size of the window asked for. */
  readonly limit: number;
}

/**
 * Read one bounded window of commands.
 *
 * The operation documents both the order and its stability: "Return a bounded,
 * deterministic newest-first window of commands […] Ordering is `created_at
 * DESC, id DESC` and is enforced by the query itself, so repeated calls return
 * the same window." That is what lets the portal call the answer the most recent
 * commands rather than "some commands"; nothing is re-sorted here, because
 * re-sorting a window the backend already ordered could only disagree with it.
 *
 * `CommandListRead` is `items` alone — no total and no cursor — so the window is
 * never presented as a complete history and no page after it is offered.
 *
 * @param filters The zone, and any narrowing the customer asked for.
 * @param options Cancellation.
 * @returns The matching commands, newest first.
 * @throws {ApiError} As the operation documents.
 */
export async function fetchCommands(
  filters: CommandListFilters,
  options: ControlRequestOptions = {},
): Promise<CommandListRead> {
  // Built in a fixed order so one set of filters is always one URL, which is
  // also what makes the query cacheable rather than re-fetched per render.
  const query: Record<string, string | number> = { control_zone_id: filters.controlZoneId };
  if (filters.targetPointId !== undefined) {
    query["target_point_id"] = filters.targetPointId;
  }
  if (filters.source !== undefined) {
    query["source"] = filters.source;
  }
  query["limit"] = filters.limit;

  const payload = await getJson(COMMANDS_PATH, { signal: options.signal, query });
  return parseCommandList(payload.body);
}

/**
 * Resolve the one command an idempotency key identifies, if it exists.
 *
 * This is the contract's own answer to a lost creation response: "the key is
 * unique, so the answer carries zero or one command: this is how a client that
 * lost a creation response finds out whether its command exists". It is an exact
 * filter, not a search — the portal never scans the collection looking for
 * something that resembles what it asked for.
 *
 * @param idempotencyKey The key the lost request was sent with.
 * @param options Cancellation.
 * @returns The command the key names, or `null` when the key named none.
 */
export async function findCommandByIdempotencyKey(
  idempotencyKey: string,
  options: ControlRequestOptions = {},
): Promise<CommandRead | null> {
  const payload = await getJson(COMMANDS_PATH, {
    signal: options.signal,
    query: { idempotency_key: idempotencyKey, limit: 1 },
  });
  return parseCommandList(payload.body).items[0] ?? null;
}
