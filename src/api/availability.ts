/**
 * One description of cloud API availability, shared by the whole portal.
 *
 * The shell shows it as a compact indicator and the dashboard shows it as a
 * panel; both read the same derived value, so they can never disagree. The
 * derivation is a pure function of the query result and is tested as one.
 */

import { useApiHealthQuery } from "./queries";
import { describeError } from "./errors";
import type { HealthDto } from "./health";

/** Availability states the portal distinguishes. */
export type AvailabilityKind = "checking" | "available" | "degraded" | "unavailable";

export interface ApiAvailability {
  readonly kind: AvailabilityKind;
  /** Short text label. The indicator never relies on colour alone. */
  readonly label: string;
  /** One sentence explaining the state. */
  readonly detail: string;
  /** When the portal last heard from the API, or `null` before it ever did. */
  readonly checkedAt: number | null;
  /** A check is in flight over an answer the portal already has. */
  readonly isRechecking: boolean;
}

/** The subset of a query result availability is derived from. */
export interface HealthQuerySnapshot {
  readonly isPending: boolean;
  readonly isFetching: boolean;
  readonly data: HealthDto | undefined;
  readonly error: unknown;
  readonly dataUpdatedAt: number;
  readonly errorUpdatedAt: number;
}

/**
 * Describe availability from a health query result.
 *
 * The portal reports only what the backend actually said. It never infers a
 * domain status, and it never treats "no answer yet" as "unavailable".
 *
 * @param snapshot The health query's current state.
 * @returns The single availability description the UI renders.
 */
export function describeAvailability(snapshot: HealthQuerySnapshot): ApiAvailability {
  const isRechecking = snapshot.isFetching && !snapshot.isPending;

  if (snapshot.error !== null && snapshot.error !== undefined) {
    return {
      kind: "unavailable",
      label: "Unavailable",
      detail: describeError(snapshot.error),
      checkedAt: snapshot.errorUpdatedAt > 0 ? snapshot.errorUpdatedAt : null,
      isRechecking,
    };
  }

  if (snapshot.isPending || snapshot.data === undefined) {
    return {
      kind: "checking",
      label: "Checking",
      detail: "Checking whether the cloud API is available.",
      checkedAt: null,
      isRechecking,
    };
  }

  const checkedAt = snapshot.dataUpdatedAt > 0 ? snapshot.dataUpdatedAt : null;
  const health = snapshot.data;

  if (health.status === "ok" && health.database === "ok") {
    return {
      kind: "available",
      label: "Available",
      detail: `The cloud API (${health.service}) is available.`,
      checkedAt,
      isRechecking,
    };
  }

  return {
    kind: "degraded",
    label: "Degraded",
    detail:
      health.database === "ok"
        ? `The cloud API (${health.service}) reports itself unavailable.`
        : `The cloud API (${health.service}) is reachable but reports its database unavailable.`,
    checkedAt,
    isRechecking,
  };
}

/** The portal's availability state, and a way to recheck it on demand. */
export interface ApiAvailabilityResult {
  readonly availability: ApiAvailability;
  readonly recheck: () => void;
}

/** Subscribe to cloud API availability. */
export function useApiAvailability(): ApiAvailabilityResult {
  const query = useApiHealthQuery();
  return {
    availability: describeAvailability(query),
    recheck: () => {
      void query.refetch();
    },
  };
}
