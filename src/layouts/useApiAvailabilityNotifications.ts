/**
 * Announce cloud API availability changes in the global notification region.
 *
 * Only *changes* are announced. The first answer after a page load is the
 * indicator's job, and repeating it as a notification would train an operator
 * to ignore the region. A transition, on the other hand, is exactly the thing
 * someone watching a facility needs to be told about.
 */

import { useEffect, useRef } from "react";
import type { ApiAvailability, AvailabilityKind } from "../api/availability";
import { useNotifications } from "../shared/notifications";

export function useApiAvailabilityNotifications(availability: ApiAvailability): void {
  const { notify } = useNotifications();
  const previousKind = useRef<AvailabilityKind | null>(null);
  const { kind, detail } = availability;

  useEffect(() => {
    if (kind === "checking") {
      return;
    }
    const previous = previousKind.current;
    previousKind.current = kind;
    if (previous === null || previous === kind) {
      return;
    }
    if (kind === "available") {
      notify("success", "The cloud API is available again.");
    } else {
      notify("warning", detail);
    }
  }, [kind, detail, notify]);
}
