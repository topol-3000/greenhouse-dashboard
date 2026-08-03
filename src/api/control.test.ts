/**
 * The manual-control boundary: what it sends, and what it accepts back.
 *
 * The assertions are about the published contract — the exact path, the exact
 * `ManualCommandCreate` body, the required `Idempotency-Key` header, the two
 * statuses the creation operation documents as success, and the fields
 * `CommandRead` requires. A change in what the portal sends is a failing test
 * here rather than a request the backend quietly rejects, or worse, accepts as
 * something the customer did not ask for.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createManualCommand,
  fetchCommand,
  findCommandByIdempotencyKey,
  isTerminalCommandState,
  parseCommand,
} from "./control";
import { ApiError, NetworkError, ParseError } from "./errors";

const ZONE_ID = "9b3e1f5c-8d30-4b49-9d8f-7b4d3e1f0001";
const POINT_ID = "bb000000-0000-4000-8000-000000000002";
const REPORTED_ID = "bb000000-0000-4000-8000-000000000008";
const COMMAND_ID = "dd000000-0000-4000-8000-000000000001";
const KEY = "ee000000-0000-4000-8000-000000000001";

/** A `CommandRead` with every field the schema requires. */
const COMMAND = {
  id: COMMAND_ID,
  source: "manual",
  idempotency_key: KEY,
  control_zone_id: ZONE_ID,
  control_loop_id: null,
  trigger_sample_id: null,
  target_point_id: POINT_ID,
  reported_point_id: REPORTED_ID,
  gateway_id: null,
  desired_value: true,
  state: "pending",
  result_control_sample_id: null,
  result_status_sample_id: null,
  issued_at: "2026-01-04T09:06:00Z",
  executed_at: null,
  acknowledged_at: null,
  rejection_reason: null,
  created_at: "2026-01-04T09:06:00Z",
};

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Stub `fetch` with one JSON answer and record the whole request. */
function stubFetch(body: unknown, status = 200): Recorded[] {
  const calls: Recorded[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const headers: Record<string, string> = {};
      new Headers(init?.headers ?? {}).forEach((value, key) => {
        headers[key] = value;
      });
      calls.push({
        url: typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        method: init?.method ?? "GET",
        headers,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("creating a manual command", () => {
  it("posts exactly the contract's body to the contract's path", async () => {
    const calls = stubFetch({ outcome: "created", command: COMMAND }, 201);

    await createManualCommand({
      controlZoneId: ZONE_ID,
      targetPointId: POINT_ID,
      desiredValue: true,
      idempotencyKey: KEY,
    });

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe("/api/v1/commands");
    expect(call.method).toBe("POST");
    // `ManualCommandCreate` is `additionalProperties: false`: these three
    // fields, and nothing beside them.
    expect(call.body).toEqual({
      control_zone_id: ZONE_ID,
      target_point_id: POINT_ID,
      desired_value: true,
    });
  });

  it("sends the required Idempotency-Key header", async () => {
    const calls = stubFetch({ outcome: "created", command: COMMAND }, 201);

    await createManualCommand({
      controlZoneId: ZONE_ID,
      targetPointId: POINT_ID,
      desiredValue: false,
      idempotencyKey: KEY,
    });

    expect(calls[0]?.headers["idempotency-key"]).toBe(KEY);
    expect(calls[0]?.headers["content-type"]).toBe("application/json");
  });

  it("sends a strict boolean, never a coerced one", async () => {
    const calls = stubFetch(
      { outcome: "created", command: { ...COMMAND, desired_value: false } },
      201,
    );

    await createManualCommand({
      controlZoneId: ZONE_ID,
      targetPointId: POINT_ID,
      desiredValue: false,
      idempotencyKey: KEY,
    });

    const body = calls[0]?.body as { desired_value: unknown };
    expect(body.desired_value).toBe(false);
    expect(typeof body.desired_value).toBe("boolean");
  });

  it("reads a 201 as a creation and a 200 as a replay", async () => {
    stubFetch({ outcome: "created", command: COMMAND }, 201);
    const created = await createManualCommand({
      controlZoneId: ZONE_ID,
      targetPointId: POINT_ID,
      desiredValue: true,
      idempotencyKey: KEY,
    });
    expect(created.outcome).toBe("created");
    expect(created.status).toBe(201);

    vi.unstubAllGlobals();
    stubFetch({ outcome: "existing", command: COMMAND }, 200);
    const replayed = await createManualCommand({
      controlZoneId: ZONE_ID,
      targetPointId: POINT_ID,
      desiredValue: true,
      idempotencyKey: KEY,
    });
    expect(replayed.outcome).toBe("existing");
    expect(replayed.status).toBe(200);
  });

  it("raises the backend's own status for a refusal", async () => {
    stubFetch({ error: { code: "idempotency_key_conflict", message: "no", details: {} } }, 409);

    await expect(
      createManualCommand({
        controlZoneId: ZONE_ID,
        targetPointId: POINT_ID,
        desiredValue: true,
        idempotencyKey: KEY,
      }),
    ).rejects.toMatchObject({ status: 409, code: "idempotency_key_conflict" });
  });

  it("raises a transport failure as a network error, not a refusal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );

    const failure = await createManualCommand({
      controlZoneId: ZONE_ID,
      targetPointId: POINT_ID,
      desiredValue: true,
      idempotencyKey: KEY,
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(NetworkError);
    expect(failure).not.toBeInstanceOf(ApiError);
  });

  it("percent-encodes an identifier before it reaches a path", async () => {
    const calls = stubFetch(COMMAND);

    await fetchCommand("../../edge/gateways/x/commands");

    expect(calls[0]?.url).toBe("/api/v1/commands/..%2F..%2Fedge%2Fgateways%2Fx%2Fcommands");
  });
});

describe("reading a command", () => {
  it("asks the contract's path", async () => {
    const calls = stubFetch(COMMAND);

    const command = await fetchCommand(COMMAND_ID);

    expect(calls[0]?.url).toBe(`/api/v1/commands/${COMMAND_ID}`);
    expect(calls[0]?.method).toBe("GET");
    expect(command.id).toBe(COMMAND_ID);
  });

  it("keeps a desired value of false rather than losing it", () => {
    const command = parseCommand({ ...COMMAND, desired_value: false });

    expect(command.desired_value).toBe(false);
  });

  it("reads a rejection reason's code and message", () => {
    const command = parseCommand({
      ...COMMAND,
      state: "rejected",
      rejection_reason: { code: "actuator_unreachable", message: "The gateway did not answer." },
    });

    expect(command.rejection_reason).toEqual({
      code: "actuator_unreachable",
      message: "The gateway did not answer.",
    });
  });

  it("refuses a response whose desired_value is not a boolean", () => {
    // The command boundary refuses `1` and `"true"` rather than coercing them.
    // A reader that accepted what the writer refuses would be where a wrong
    // guess entered the portal.
    expect(() => parseCommand({ ...COMMAND, desired_value: 1 })).toThrow(ParseError);
    expect(() => parseCommand({ ...COMMAND, desired_value: "true" })).toThrow(ParseError);
  });

  it("refuses a response missing an identifier it is followed by", () => {
    const { reported_point_id: _omitted, ...withoutReported } = COMMAND;

    expect(() => parseCommand(withoutReported)).toThrow(ParseError);
  });
});

describe("the terminal states", () => {
  it("treats applied and rejected as terminal and pending as not", () => {
    expect(isTerminalCommandState("applied")).toBe(true);
    expect(isTerminalCommandState("rejected")).toBe(true);
    expect(isTerminalCommandState("pending")).toBe(false);
  });

  it("does not invent a terminal meaning for a state it has never seen", () => {
    expect(isTerminalCommandState("superseded" as "pending")).toBe(false);
  });
});

describe("resolving a lost creation response", () => {
  it("asks the contract's exact idempotency-key filter", async () => {
    const calls = stubFetch({ items: [COMMAND] });

    const found = await findCommandByIdempotencyKey(KEY);

    expect(calls[0]?.url).toBe(`/api/v1/commands?idempotency_key=${KEY}&limit=1`);
    expect(found?.id).toBe(COMMAND_ID);
  });

  it("answers null when the key names no command", async () => {
    stubFetch({ items: [] });

    expect(await findCommandByIdempotencyKey(KEY)).toBeNull();
  });
});
